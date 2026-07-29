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
const GENERATED_MODEL_ENDPOINTS = [
  'fal-ai/hunyuan-3d/v3.1/pro/text-to-3d',
  'fal-ai/hunyuan-3d/v3.1/rapid/text-to-3d',
] as const;
type GeneratedModelEndpoint = typeof GENERATED_MODEL_ENDPOINTS[number];

function generatedModelEndpoint(value: unknown): value is GeneratedModelEndpoint {
  return typeof value === 'string' && (GENERATED_MODEL_ENDPOINTS as readonly string[]).includes(value);
}

type CatalogStatus = 'idle' | 'loading' | 'ready' | 'offline';

interface RemoteManifest {
  version: 1;
  entries: unknown[];
  overrides?: unknown[];
}

type ModelOverride = {
  type: string;
  model: NonNullable<CatalogEntry['model']>;
};

interface CatalogSnapshot {
  entries: CatalogEntry[];
  status: CatalogStatus;
  remoteCount: number;
  error?: string;
}

const listeners = new Set<() => void>();
const remoteTypes = new Set<string>();
const overriddenTypes = new Set<string>();
const bundledByType: Record<string, CatalogEntry> = Object.fromEntries(
  FURNITURE_CATALOG.map((entry) => [entry.type, entry]),
);
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

function validateModel(value: unknown, manifestUrl: URL): NonNullable<CatalogEntry['model']> | null {
  if (!isRecord(value)) return null;
  const modelUrl = sameOriginUrl(value.url, manifestUrl);
  if (!modelUrl || !modelUrl.toLowerCase().endsWith('.glb')) return null;

  let source: NonNullable<CatalogEntry['model']>['source'];
  if (isRecord(value.source)) {
    const sourceName = cleanText(value.source.name, 100);
    const sourceUrl = cleanText(value.source.url, 500);
    const author = cleanText(value.source.author, 100) ?? undefined;
    const cc0 = value.source.license === 'CC0';
    const generatedModel = generatedModelEndpoint(value.source.model) ? value.source.model : null;
    const generated = value.source.license === 'AI-generated' &&
      value.source.provider === 'fal.ai' &&
      !!generatedModel;
    if (sourceName && sourceUrl && (cc0 || generated)) {
      try {
        const parsed = new URL(sourceUrl);
        if (parsed.protocol === 'https:') {
          source = generated
            ? {
                name: sourceName,
                url: parsed.href,
                author,
                license: 'AI-generated',
                provider: 'fal.ai',
                model: generatedModel!,
              }
            : { name: sourceName, url: parsed.href, author, license: 'CC0' };
        }
      } catch {
        // Provenance is mandatory; malformed source URLs reject the model.
      }
    }
  }
  if (!source) return null;

  const bytes = cleanBytes(value.bytes);
  const shaText = cleanText(value.sha256, 64);
  const sha256 = shaText && /^[a-f0-9]{64}$/i.test(shaText) ? shaText.toLowerCase() : undefined;
  const yaw = typeof value.yaw === 'number' && Number.isFinite(value.yaw) ? value.yaw : undefined;
  const fit = value.fit === 'width' || value.fit === 'depth' || value.fit === 'contain' || value.fit === 'stretch'
    ? value.fit
    : undefined;
  const offsetY = typeof value.offsetY === 'number' && Number.isFinite(value.offsetY) && Math.abs(value.offsetY) <= 2_000
    ? value.offsetY
    : undefined;
  const renderUrl = sameOriginUrl(value.renderUrl, manifestUrl);
  const renderBytes = cleanBytes(value.renderBytes);
  const renderShaText = cleanText(value.renderSha256, 64);
  const renderSha256 = renderShaText && /^[a-f0-9]{64}$/i.test(renderShaText)
    ? renderShaText.toLowerCase()
    : undefined;
  return {
    url: modelUrl,
    yaw,
    fit,
    offsetY,
    bytes,
    sha256,
    ...(renderUrl?.toLowerCase().endsWith('.glb') ? { renderUrl, renderBytes, renderSha256 } : {}),
    source,
  };
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
  // New cloud entries may never shadow an object bundled with the app. Check
  // the immutable baseline rather than CATALOG_BY_TYPE, which also contains
  // entries from the previous manifest refresh.
  if (bundledByType[type]) return null;
  if (!isRecord(value.model)) return null;
  const modelUrl = sameOriginUrl(value.model.url, manifestUrl);
  if (!modelUrl || !modelUrl.toLowerCase().endsWith('.glb')) return null;

  let source: NonNullable<CatalogEntry['model']>['source'];
  if (isRecord(value.model.source)) {
    const sourceName = cleanText(value.model.source.name, 100);
    const sourceUrl = cleanText(value.model.source.url, 500);
    const author = cleanText(value.model.source.author, 100) ?? undefined;
    const cc0 = value.model.source.license === 'CC0';
    const generatedModel = generatedModelEndpoint(value.model.source.model) ? value.model.source.model : null;
    const generated = value.model.source.license === 'AI-generated' &&
      value.model.source.provider === 'fal.ai' &&
      !!generatedModel;
    if (sourceName && sourceUrl && (cc0 || generated)) {
      try {
        const parsed = new URL(sourceUrl);
        if (parsed.protocol === 'https:') {
          source = generated
            ? {
                name: sourceName,
                url: parsed.href,
                author,
                license: 'AI-generated',
                provider: 'fal.ai',
                model: generatedModel!,
              }
            : { name: sourceName, url: parsed.href, author, license: 'CC0' };
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
  const fit = value.model.fit === 'width' || value.model.fit === 'depth' || value.model.fit === 'contain' || value.model.fit === 'stretch'
    ? value.model.fit
    : undefined;
  const offsetY = typeof value.model.offsetY === 'number' && Number.isFinite(value.model.offsetY) && Math.abs(value.model.offsetY) <= 2_000
    ? value.model.offsetY
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
    model: {
      url: modelUrl,
      yaw,
      fit,
      offsetY,
      bytes,
      sha256,
      ...(() => {
        const renderUrl = sameOriginUrl(value.model.renderUrl, manifestUrl);
        const renderBytes = cleanBytes(value.model.renderBytes);
        const text = cleanText(value.model.renderSha256, 64);
        const renderSha256 = text && /^[a-f0-9]{64}$/i.test(text) ? text.toLowerCase() : undefined;
        return renderUrl?.toLowerCase().endsWith('.glb') ? { renderUrl, renderBytes, renderSha256 } : {};
      })(),
      source,
    },
  };
}

function validateOverride(
  value: unknown,
  manifestUrl: URL,
): ModelOverride | null {
  if (!isRecord(value)) return null;
  const type = cleanText(value.type, 80);
  if (!type || !/^[a-z0-9][a-z0-9_-]*$/.test(type)) return null;
  const bundled = bundledByType[type];
  // Only model rendering may be upgraded remotely. Openings remain tied to an
  // app release because their dimensions and styles affect wall geometry.
  if (!bundled || bundled.opening) return null;
  const model = validateModel(value.model, manifestUrl);
  return model ? { type, model } : null;
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
  const seenOverrides = new Set<string>();
  const overrides = (manifest.overrides ?? [])
    .map((override) => validateOverride(override, manifestUrl))
    .filter((override): override is ModelOverride => {
      if (!override || seenOverrides.has(override.type)) return false;
      seenOverrides.add(override.type);
      return true;
    });

  remoteTypes.forEach((type) => delete CATALOG_BY_TYPE[type]);
  remoteTypes.clear();
  overriddenTypes.forEach((type) => {
    CATALOG_BY_TYPE[type] = bundledByType[type];
  });
  overriddenTypes.clear();
  entries.forEach((entry) => {
    CATALOG_BY_TYPE[entry.type] = entry;
    remoteTypes.add(entry.type);
  });
  overrides.forEach(({ type, model }) => {
    CATALOG_BY_TYPE[type] = { ...bundledByType[type], model, cloud: true };
    overriddenTypes.add(type);
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
    // Abort a hanging network after 6 s so the sidebar falls back to bundled
    // items ("Offline catalog") instead of spinning "Loading…" forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(MANIFEST_URL, { cache: 'no-cache', signal: controller.signal });
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
      clearTimeout(timer);
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
