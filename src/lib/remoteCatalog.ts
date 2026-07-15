import { useEffect, useSyncExternalStore } from 'react';
import {
  CATALOG_BY_TYPE,
  FURNITURE_CATALOG,
  type CatalogEntry,
  type Shape3D,
} from '../data/furnitureCatalog';

const DEFAULT_MANIFEST_URL =
  'https://pub-6583adc5c7ee4926ae2b8037175a5dfc.r2.dev/catalog/v1/catalog.json';
const MANIFEST_URL = import.meta.env.VITE_MODEL_CATALOG_URL || DEFAULT_MANIFEST_URL;
const CACHE_KEY = 'homedesigner.remote-catalog.v1';
const MAX_MANIFEST_BYTES = 2_000_000;
const MAX_ENTRIES = 5_000;

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'offline';

interface RemoteManifest {
  version: 1;
  entries: unknown[];
}

interface CatalogSnapshot {
  entries: CatalogEntry[];
  status: CatalogStatus;
  remoteCount: number;
  error?: string;
}

const listeners = new Set<() => void>();
const remoteTypes = new Set<string>();
const allowedShapes = new Set<Shape3D>(FURNITURE_CATALOG.map((entry) => entry.shape));
let snapshot: CatalogSnapshot = {
  entries: FURNITURE_CATALOG,
  status: 'idle',
  remoteCount: 0,
};
let inflight: Promise<void> | null = null;
let cacheHydrated = false;

function emit(next: CatalogSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

function cleanDimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 2_000
    ? value
    : null;
}

function cleanBytes(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 100_000_000
    ? value
    : undefined;
}

function sameOriginUrl(value: unknown, manifestUrl: URL): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, manifestUrl);
    return url.protocol === 'https:' && url.origin === manifestUrl.origin ? url.href : null;
  } catch {
    return null;
  }
}

function validateEntry(value: unknown, manifestUrl: URL): CatalogEntry | null {
  if (!isRecord(value)) return null;
  const type = cleanText(value.type, 80);
  const name = cleanText(value.name, 100);
  const category = cleanText(value.category, 50);
  const color = cleanText(value.color, 30);
  const icon = cleanText(value.icon, 12) ?? '▣';
  const width = cleanDimension(value.width);
  const depth = cleanDimension(value.depth);
  const height = cleanDimension(value.height);
  const shape = value.shape as Shape3D;
  if (!type || !/^[a-z0-9][a-z0-9_-]*$/.test(type) || !name || !category || !color) return null;
  if (!width || !depth || !height || !allowedShapes.has(shape)) return null;
  // Cloud data may add types but may never replace bundled items or openings.
  if (CATALOG_BY_TYPE[type]) return null;
  if (!isRecord(value.model)) return null;
  const modelUrl = sameOriginUrl(value.model.url, manifestUrl);
  if (!modelUrl || !modelUrl.toLowerCase().endsWith('.glb')) return null;

  let source: NonNullable<CatalogEntry['model']>['source'];
  if (isRecord(value.model.source)) {
    const sourceName = cleanText(value.model.source.name, 100);
    const sourceUrl = cleanText(value.model.source.url, 500);
    const author = cleanText(value.model.source.author, 100) ?? undefined;
    if (sourceName && sourceUrl && value.model.source.license === 'CC0') {
      try {
        const parsed = new URL(sourceUrl);
        if (parsed.protocol === 'https:') {
          source = { name: sourceName, url: parsed.href, author, license: 'CC0' };
        }
      } catch {
        // Provenance is required below; malformed URLs reject the entry.
      }
    }
  }
  if (!source) return null;

  const bytes = cleanBytes(value.model.bytes);
  const shaText = cleanText(value.model.sha256, 64);
  const sha256 = shaText && /^[a-f0-9]{64}$/i.test(shaText) ? shaText.toLowerCase() : undefined;
  const yaw = typeof value.model.yaw === 'number' && Number.isFinite(value.model.yaw)
    ? value.model.yaw
    : undefined;
  return {
    type,
    name,
    category,
    width,
    depth,
    height,
    color,
    shape,
    icon,
    pro: value.pro === false ? undefined : true,
    cloud: true,
    model: { url: modelUrl, yaw, bytes, sha256, source },
  };
}

function applyManifest(raw: unknown, urlString: string): CatalogEntry[] {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.entries)) {
    throw new Error('Unsupported catalog manifest');
  }
  const manifest = raw as unknown as RemoteManifest;
  if (manifest.entries.length > MAX_ENTRIES) throw new Error('Catalog manifest is too large');
  const manifestUrl = new URL(urlString);
  const entries = manifest.entries
    .map((entry) => validateEntry(entry, manifestUrl))
    .filter((entry): entry is CatalogEntry => !!entry);

  remoteTypes.forEach((type) => delete CATALOG_BY_TYPE[type]);
  remoteTypes.clear();
  entries.forEach((entry) => {
    CATALOG_BY_TYPE[entry.type] = entry;
    remoteTypes.add(entry.type);
  });
  return entries;
}

function hydrateCache() {
  if (cacheHydrated) return;
  cacheHydrated = true;
  try {
    const text = localStorage.getItem(CACHE_KEY);
    if (!text || text.length > MAX_MANIFEST_BYTES) return;
    const cached = JSON.parse(text) as { url?: string; manifest?: unknown };
    if (cached.url !== MANIFEST_URL) return;
    const entries = applyManifest(cached.manifest, MANIFEST_URL);
    emit({ entries: [...FURNITURE_CATALOG, ...entries], status: 'idle', remoteCount: entries.length });
  } catch {
    try { localStorage.removeItem(CACHE_KEY); } catch { /* best effort */ }
  }
}

export async function loadRemoteCatalog(force = false): Promise<void> {
  hydrateCache();
  if (inflight) return inflight;
  if (!force && snapshot.status === 'ready') return;
  emit({ ...snapshot, status: 'loading', error: undefined });
  inflight = (async () => {
    try {
      const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
      const text = await response.text();
      if (text.length > MAX_MANIFEST_BYTES) throw new Error('Catalog manifest is too large');
      const raw = JSON.parse(text) as unknown;
      const entries = applyManifest(raw, MANIFEST_URL);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ url: MANIFEST_URL, manifest: raw })); } catch { /* best effort */ }
      emit({ entries: [...FURNITURE_CATALOG, ...entries], status: 'ready', remoteCount: entries.length });
    } catch (error) {
      // Retain both bundled items and a previously validated cached manifest.
      emit({
        ...snapshot,
        status: 'offline',
        error: error instanceof Error ? error.message : 'Cloud catalog unavailable',
      });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function useRemoteCatalog(): CatalogSnapshot {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
  useEffect(() => {
    hydrateCache();
    void loadRemoteCatalog();
  }, []);
  return current;
}
