// Anonymous first-session events (POST /v1/events). The app sends a random
// install id it made for itself, never an account or device id. Nothing about
// the request (IP, user agent) is stored. The whole request is validated first
// and either stored or refused: a partial write would skew the funnel.
export const HD_EVENT_NAMES = new Set([
  'app_first_open',
  'template_chosen',
  'editor_opened',
  'view_3d_opened',
  'pro_wall_shown',
  'import_result',
  'export',
  'pro_checkout',
  'photo',
]);
export const HD_EVENTS_PER_REQUEST = 20;
export const HD_EVENTS_PER_INSTALL_PER_DAY = 60;
const MAX_BODY_CHARS = 8192;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DETAIL = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/;
const SOURCE = /^[A-Za-z0-9][A-Za-z0-9:_.-]*$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

interface Parsed {
  install: string;
  appVersion: string | null;
  source: string | null;
  events: { event: string; detail: string | null }[];
}

function parse(raw: unknown): Parsed | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.install !== 'string' || !UUID_V4.test(body.install)) return null;
  let appVersion: string | null = null;
  if (body.app_version != null) {
    if (typeof body.app_version !== 'string' || body.app_version.length > 24 || !VERSION.test(body.app_version)) return null;
    appVersion = body.app_version;
  }
  let source: string | null = null;
  if (body.source != null) {
    if (typeof body.source !== 'string' || body.source.length > 64 || !SOURCE.test(body.source)) return null;
    source = body.source;
  }
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > HD_EVENTS_PER_REQUEST) return null;
  const events: Parsed['events'] = [];
  for (const item of body.events) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const e = item as Record<string, unknown>;
    if (typeof e.event !== 'string' || !HD_EVENT_NAMES.has(e.event)) return null;
    let detail: string | null = null;
    if (e.detail != null) {
      if (typeof e.detail !== 'string' || e.detail.length > 64 || !DETAIL.test(e.detail)) return null;
      detail = e.detail;
    }
    events.push({ event: e.event, detail });
  }
  return { install: body.install.toLowerCase(), appVersion, source, events };
}

/** Returns the HTTP status and body for the route to send. */
export async function recordHdEvents(
  request: Request,
  db: D1Database,
  now = Date.now(),
): Promise<{ status: number; body: Record<string, unknown>; headers?: Record<string, string> }> {
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return { status: 400, body: { error: 'Invalid events' } };
    raw = JSON.parse(text);
  } catch {
    return { status: 400, body: { error: 'Invalid events' } };
  }
  const parsed = parse(raw);
  if (!parsed) return { status: 400, body: { error: 'Invalid events' } };

  const day = Math.floor(now / 86_400_000);
  const used = await db.prepare('SELECT COUNT(*) AS n FROM hd_events WHERE install = ? AND day = ?')
    .bind(parsed.install, day).first<{ n: number }>();
  if ((used?.n ?? 0) + parsed.events.length > HD_EVENTS_PER_INSTALL_PER_DAY) {
    return { status: 429, body: { error: 'Too many events' }, headers: { 'Retry-After': '3600' } };
  }
  await db.batch(parsed.events.map((e) => db.prepare(
    'INSERT INTO hd_events (install, event, detail, app_version, source, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(parsed.install, e.event, e.detail, parsed.appVersion, parsed.source, day, now)));
  return { status: 202, body: { ok: true, stored: parsed.events.length } };
}

/** Anonymous events are kept for 13 months (396 days), then deleted. */
export const HD_EVENTS_RETENTION_DAYS = 396;

/** Deletes events older than the retention window. Returns the rows removed. */
export async function purgeOldHdEvents(db: D1Database, now = Date.now()): Promise<number> {
  const cutoff = Math.floor(now / 86_400_000) - HD_EVENTS_RETENTION_DAYS;
  const result = await db.prepare('DELETE FROM hd_events WHERE day < ?').bind(cutoff).run();
  return result.meta?.changes ?? 0;
}
