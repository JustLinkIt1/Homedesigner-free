// Product-update email opt-in (migrations/0011_email_consent.sql).
//
// Hard rule: nobody gets product email unless the NEWEST row for their account
// says opted_in = 1. The log is append-only (one row per change, never
// UPDATEd), so the current state and its proof can never disagree.
//
// This module is self-contained (no jose, no index.ts) so tests can run it
// against the real migration in SQLite. Route handlers return a plain result;
// index.ts turns it into a Response.

export const CONSENT_SOURCES = ['signin', 'settings', 'unsubscribe_link', 'list_unsubscribe'] as const;
export type ConsentSource = typeof CONSENT_SOURCES[number];
/** The only sources the app may post. The other two come from the signed link. */
const APP_SOURCES = new Set<string>(['signin', 'settings']);
const WORDING = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const LANG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})?$/;
const SUBJECT = /^[A-Za-z0-9_-]{1,255}$/;
const MAX_BODY_CHARS = 2048;
const TOKEN_PREFIX = 'unsub:v1:';

export interface ConsentIdentity {
  subject: string;
  email: string | null;
  emailVerified: boolean;
}

export interface ConsentState {
  optedIn: boolean;
  wording: string | null;
  updatedAt: number | null;
}

export interface JsonResult {
  status: number;
  body: Record<string, unknown>;
}

export interface HtmlResult {
  status: number;
  contentType: string;
  body: string;
}

interface ConsentRow {
  id: number;
  email: string;
  opted_in: number;
  wording: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Signed unsubscribe token:
//   base64url(subject) + "." + base64url(HMAC-SHA256(secret, "unsub:v1:" + subject))
// It never expires (a link in an old email must keep working), so the secret is
// never rotated: changing it kills every link already sent.

const encoder = new TextEncoder();

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

/**
 * Constant-time byte comparison: the loop always runs over the full expected
 * length and never exits early, so the time taken does not reveal how many
 * leading bytes of a forged signature were right.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i] ?? 0);
  return diff === 0;
}

export async function unsubscribeToken(secret: string, subject: string): Promise<string> {
  return `${base64urlEncode(encoder.encode(subject))}.${base64urlEncode(await hmac(secret, TOKEN_PREFIX + subject))}`;
}

/** Returns the subject the token was signed for, or null if it is not genuine. */
export async function verifyUnsubscribeToken(secret: string, token: string | null): Promise<string | null> {
  if (!secret || !token || token.length > 600) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const subjectBytes = base64urlDecode(token.slice(0, dot));
  const signature = base64urlDecode(token.slice(dot + 1));
  if (!subjectBytes || !signature) return null;
  let subject: string;
  try {
    subject = new TextDecoder('utf-8', { fatal: true }).decode(subjectBytes);
  } catch {
    return null;
  }
  if (!SUBJECT.test(subject)) return null;
  const expected = await hmac(secret, TOKEN_PREFIX + subject);
  return timingSafeEqual(expected, signature) ? subject : null;
}

// ---------------------------------------------------------------------------
// Storage

async function newestRow(db: D1Database, subject: string): Promise<ConsentRow | null> {
  return db.prepare(
    'SELECT id, email, opted_in, wording, created_at FROM email_consent_log WHERE subject = ? ORDER BY id DESC LIMIT 1',
  ).bind(subject).first<ConsentRow>();
}

async function appendRow(
  db: D1Database, subject: string, email: string, optedIn: boolean,
  wording: string, lang: string, source: ConsentSource, now: number,
): Promise<void> {
  await db.prepare(
    'INSERT INTO email_consent_log (subject, email, opted_in, wording, lang, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(subject, email, optedIn ? 1 : 0, wording, lang, source, now).run();
}

function stateOf(row: ConsentRow | null): ConsentState {
  return row
    ? { optedIn: row.opted_in === 1, wording: row.wording, updatedAt: row.created_at }
    : { optedIn: false, wording: null, updatedAt: null };
}

export async function readConsent(db: D1Database, subject: string): Promise<ConsentState> {
  return stateOf(await newestRow(db, subject));
}

/** Account deletion: the email and the whole consent history go with it. */
export async function eraseEmailConsent(db: D1Database, subject: string): Promise<void> {
  await db.prepare('DELETE FROM email_consent_log WHERE subject = ?').bind(subject).run();
}

// ---------------------------------------------------------------------------
// Authenticated routes (rate limited by the shared authed gate in index.ts)

/** GET /v1/email-consent */
export async function getEmailConsent(db: D1Database, identity: ConsentIdentity): Promise<JsonResult> {
  return { status: 200, body: { ...(await readConsent(db, identity.subject)) } };
}

/** POST /v1/email-consent { optedIn, wording, lang, source: 'signin' | 'settings' } */
export async function postEmailConsent(
  request: Request, db: D1Database, identity: ConsentIdentity, now = Date.now(),
): Promise<JsonResult> {
  // The address is taken only from a verified Google token, never typed. No
  // verified email: refused, and nothing is written.
  if (!identity.emailVerified || !identity.email) {
    return { status: 403, body: { error: 'A verified Google email is required.' } };
  }
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) return { status: 400, body: { error: 'Invalid consent' } };
    raw = JSON.parse(text);
  } catch {
    return { status: 400, body: { error: 'Invalid consent' } };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { status: 400, body: { error: 'Invalid consent' } };
  const body = raw as Record<string, unknown>;
  if (
    typeof body.optedIn !== 'boolean'
    || typeof body.wording !== 'string' || !WORDING.test(body.wording)
    || typeof body.lang !== 'string' || !LANG.test(body.lang)
    || typeof body.source !== 'string' || !APP_SOURCES.has(body.source)
  ) {
    return { status: 400, body: { error: 'Invalid consent' } };
  }
  const email = identity.email.trim().toLowerCase();
  const current = await newestRow(db, identity.subject);
  // Unchanged state (same answer, same address) is a no-op: the log records
  // changes, not repeats. With no row yet, even a "no" is written: it is the
  // record that the person was asked and declined.
  if (current && (current.opted_in === 1) === body.optedIn && current.email === email) {
    return { status: 200, body: { ...stateOf(current), changed: false } };
  }
  await appendRow(db, identity.subject, email, body.optedIn, body.wording, body.lang, body.source as ConsentSource, now);
  return { status: 200, body: { optedIn: body.optedIn, wording: body.wording, updatedAt: now, changed: true } };
}

// ---------------------------------------------------------------------------
// Public unsubscribe (signed token, no sign-in). It only ever unsubscribes:
// opting back in is done in the app's Settings, never by link. Idempotent: an
// already-unsubscribed (or never-subscribed) account gets no new row.

async function unsubscribe(db: D1Database, subject: string, source: ConsentSource, now: number): Promise<boolean> {
  const current = await newestRow(db, subject);
  if (!current || current.opted_in !== 1) return false;
  await appendRow(db, subject, current.email, false, current.wording, 'und', source, now);
  return true;
}

function page(status: number, title: string, message: string): HtmlResult {
  return {
    status,
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
</head>
<body>
<h1>${title}</h1>
<p>${message}</p>
</body>
</html>
`,
  };
}

/** Headers for the unsubscribe responses: the token is in the URL, so no referrer leaves the page. */
export const UNSUBSCRIBE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex',
};

/** GET /v1/email/unsubscribe?t=<token>: the link in the email body. */
export async function unsubscribeLinkPage(
  url: URL, db: D1Database, secret: string | undefined, now = Date.now(),
): Promise<HtmlResult> {
  if (!secret) return page(503, 'Please try again later', 'We could not process this request right now. Please try again later.');
  const subject = await verifyUnsubscribeToken(secret, url.searchParams.get('t'));
  if (!subject) return page(400, 'Link not valid', 'This unsubscribe link is not valid. Please use the link from the most recent email, or change your email setting in the app.');
  await unsubscribe(db, subject, 'unsubscribe_link', now);
  return page(200, 'You are unsubscribed', 'You will no longer receive product update emails from HomeDesigner. You can change this at any time in the app\'s Settings.');
}

/** POST /v1/email/unsubscribe?t=<token>: RFC 8058 one-click from the mail client. */
export async function unsubscribeOneClick(
  url: URL, db: D1Database, secret: string | undefined, now = Date.now(),
): Promise<HtmlResult> {
  const text = (status: number, body: string): HtmlResult => ({ status, contentType: 'text/plain; charset=utf-8', body });
  if (!secret) return text(503, 'Unavailable');
  const subject = await verifyUnsubscribeToken(secret, url.searchParams.get('t'));
  if (!subject) return text(400, 'Invalid token');
  // The body should be "List-Unsubscribe=One-Click" (RFC 8058). It is not
  // required: a valid signed token is the whole authorisation, and refusing an
  // unsubscribe over a body detail would only keep mailing someone who said stop.
  await unsubscribe(db, subject, 'list_unsubscribe', now);
  return text(200, 'Unsubscribed');
}
