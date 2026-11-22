// Anonymous first-session events (see workers/design-sync/src/hd-events.ts).
//
// What is sent: a random install id this module makes for itself on first run,
// the app version, where the install came from (Play campaign / organic / web)
// and one of six fixed event names with a short slug. What is NEVER used: the
// Android ID, the advertising ID, an account id or an email.
//
// Everything here is fire-and-forget: `trackEvent` never throws, never awaits
// in the caller and never touches the UI. Offline, events wait in a small queue
// (50 at most, oldest dropped) and go out on the next flush.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { APP_VERSION } from './appInfo';

export type HdEventName =
  | 'app_first_open' | 'template_chosen' | 'editor_opened'
  | 'view_3d_opened' | 'pro_wall_shown' | 'import_result';

const BASE = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');
const INSTALL_KEY = 'homedesigner.install.v1';
const SOURCE_KEY = 'homedesigner.installSource.v1';
const FIRST_OPEN_KEY = 'homedesigner.firstOpen.v1';
const MAX_QUEUE = 50;
const MAX_PER_REQUEST = 20;
const FLUSH_DELAY_MS = 2_000;
const SEND_TIMEOUT_MS = 10_000;
const REFERRER_TIMEOUT_MS = 2_000;

interface QueuedEvent { event: HdEventName; detail?: string }
interface InstallReferrerPlugin { getReferrer(): Promise<{ referrer: string }> }
const InstallReferrer = registerPlugin<InstallReferrerPlugin>('InstallReferrer');

let queue: QueuedEvent[] = [];
let flushTimer: number | null = null;
let sending = false;
let sourcePromise: Promise<string> | null = null;
const firedThisSession = new Set<HdEventName>();

const slug = (value: string, max: number): string =>
  value.toLowerCase().replace(/[^a-z0-9:_.-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, max);

function randomUuid(): string {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function installId(): string | null {
  try {
    const stored = localStorage.getItem(INSTALL_KEY);
    if (stored && stored.length === 36) return stored;
    const id = randomUuid();
    localStorage.setItem(INSTALL_KEY, id);
    return id;
  } catch {
    return null; // no storage: an id that changes every launch would only mislead
  }
}

/** Play referrer string -> "utm_source:utm_campaign", or "organic". */
export function sourceFromReferrer(referrer: string): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(referrer);
  } catch {
    return 'organic';
  }
  const src = (params.get('utm_source') ?? '').trim();
  const campaign = (params.get('utm_campaign') ?? '').trim();
  const medium = (params.get('utm_medium') ?? '').trim().toLowerCase();
  const notSet = (v: string) => !v || /^\(?not set\)?$/i.test(v);
  if (notSet(src) || medium === 'organic') return 'organic';
  const joined = notSet(campaign) ? src : `${src}:${campaign}`;
  return slug(joined, 64) || 'organic';
}

function readSource(): Promise<string> {
  if (!sourcePromise) {
    sourcePromise = (async () => {
      if (!Capacitor.isNativePlatform()) return 'web';
      try {
        const cached = localStorage.getItem(SOURCE_KEY);
        if (cached) return cached;
      } catch { /* ignore */ }
      try {
        const { referrer } = await Promise.race([
          InstallReferrer.getReferrer(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), REFERRER_TIMEOUT_MS)),
        ]);
        const source = sourceFromReferrer(String(referrer ?? ''));
        // The plugin answers "" when Play has no referrer to give; that is
        // organic, while a failed or slow read stays "unknown" and is retried
        // next launch rather than cached.
        try { localStorage.setItem(SOURCE_KEY, source); } catch { /* ignore */ }
        return source;
      } catch {
        return 'unknown';
      }
    })();
  }
  return sourcePromise;
}

function scheduleFlush(delay = FLUSH_DELAY_MS): void {
  if (flushTimer !== null || queue.length === 0) return;
  flushTimer = window.setTimeout(() => { flushTimer = null; void flush(); }, delay);
}

/** Send what is queued. Never throws. `keepalive` lets it survive a tab hide. */
export async function flush(keepalive = false): Promise<void> {
  if (sending || queue.length === 0 || !/^https:\/\//.test(BASE)) return;
  sending = true;
  try {
    const install = installId();
    if (!install) { queue = []; return; }
    const source = await readSource();
    const batch = queue.slice(0, MAX_PER_REQUEST);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
    try {
      const response = await fetch(`${BASE}/v1/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ install, app_version: slug(APP_VERSION, 24), source, events: batch }),
        signal: controller.signal,
        keepalive,
      });
      // 2xx stored; 4xx (invalid / over the daily cap) will not improve on a
      // retry, so drop. Only a server/network failure keeps the batch.
      if (response.status < 500) queue = queue.slice(batch.length);
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    /* offline or timed out: keep the queue for the next flush */
  } finally {
    sending = false;
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  }
}

/** Queue one event. `once` limits it to the first call per app session. */
export function trackEvent(event: HdEventName, detail?: string, opts: { once?: boolean } = {}): void {
  try {
    if (!/^https:\/\//.test(BASE)) return;
    if (opts.once) {
      if (firedThisSession.has(event)) return;
      firedThisSession.add(event);
    }
    const clean = detail ? slug(detail, 64) : '';
    queue.push(clean ? { event, detail: clean } : { event });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    scheduleFlush();
  } catch {
    /* analytics must never break the app */
  }
}

/** Call once at startup: records the first launch and wires background flushes. */
export function initEvents(): void {
  try {
    void readSource(); // start the (2 s bounded) referrer read early
    let first = false;
    try {
      if (!localStorage.getItem(FIRST_OPEN_KEY)) {
        localStorage.setItem(FIRST_OPEN_KEY, '1');
        first = true;
      }
    } catch { /* no storage: never claim a first open we cannot remember */ }
    if (first) trackEvent('app_first_open');
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flush(true);
    });
    window.addEventListener('online', () => scheduleFlush(500));
  } catch {
    /* ignore */
  }
}
