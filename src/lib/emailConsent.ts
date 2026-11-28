// Product-update email opt-in: the API calls and the local flags.
// Server side: workers/design-sync/src/email-consent.ts.
//
// The rules this file serves (spec hd-email-optin, 28 Nov 2026):
// - Nobody is emailed unless their newest server row says yes. The app never
//   opts anyone in by itself: only a person's own tap posts `optedIn: true`.
// - The address is never typed or sent from here: the worker takes it from the
//   verified Google token.
// - The sign-in card is offered once per account (`homedesigner.emailOptinAsked.v1:<sub>`),
//   never when the server already has a row, and never blocks sign-in or sync.
// - Nothing else in the app reads the answer.
import { getGoogleIdToken } from './googleAuth';

/** Version id of the opt-in text the person saw. Bump it when the text changes. */
export const WORDING_VERSION = 'optin-v1-2026-11-28';

/** The consent wording per version id, as English source strings (translated
 *  through the locale catalogs). `label` (L1) names the switch, `detail` (L2) is
 *  the line under it; both are shown wherever the switch is, and both are what
 *  the version id stands for. Old versions stay here when a new one is added. */
export const OPTIN_TEXT: Record<string, { label: string; detail: string }> = {
  'optin-v1-2026-11-28': {
    label: 'Email me about new features and offers',
    detail: 'About once a month. Unsubscribe anytime.',
  },
};

export type EmailConsentSource = 'signin' | 'settings';

export interface EmailConsentState {
  optedIn: boolean;
  wording: string | null;
  /** ms UTC of the newest server row; null when the server has no row. */
  updatedAt: number | null;
}

/** The server answered with an error status. 401/429/5xx are worth a retry
 *  later; 400/403 will never improve (403 = the Google email is not verified). */
export class EmailConsentHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  get retryable(): boolean {
    return this.status === 401 || this.status === 429 || this.status >= 500;
  }
}

const BASE = (import.meta.env.VITE_CLOUD_SYNC_URL ?? '').replace(/\/$/, '');
const ASKED_PREFIX = 'homedesigner.emailOptinAsked.v1:';
const LAST_KNOWN_PREFIX = 'homedesigner.emailConsent.v1:';
const PENDING_PREFIX = 'homedesigner.emailConsentPending.v1:';
const NETWORK_TIMEOUT_MS = 15_000;
const LANG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})?$/;

export function isEmailConsentAvailable(): boolean {
  return /^https:\/\//.test(BASE);
}

/** A language tag the worker accepts; anything odd becomes "en". */
export function consentLang(lang: string | null | undefined): string {
  return lang && lang.length <= 12 && LANG.test(lang) ? lang : 'en';
}

// ---- Local flags (per account) -------------------------------------------

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* best effort */ }
}

export function hasBeenAsked(subject: string): boolean {
  return read(ASKED_PREFIX + subject) !== null;
}
export function markAsked(subject: string): void {
  write(ASKED_PREFIX + subject, '1');
}

/** The last state the server confirmed, for offline display. */
export function readLastKnown(subject: string): EmailConsentState | null {
  try {
    const v = JSON.parse(read(LAST_KNOWN_PREFIX + subject) ?? 'null') as Partial<EmailConsentState> | null;
    if (!v || typeof v.optedIn !== 'boolean') return null;
    return {
      optedIn: v.optedIn,
      wording: typeof v.wording === 'string' ? v.wording : null,
      updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : null,
    };
  } catch {
    return null;
  }
}
export function writeLastKnown(subject: string, state: EmailConsentState): void {
  write(LAST_KNOWN_PREFIX + subject, JSON.stringify(state));
}

export interface PendingConsent { optedIn: boolean; source: EmailConsentSource }

/** An answer the person gave that has not reached the server yet (offline). */
export function readPending(subject: string): PendingConsent | null {
  try {
    const v = JSON.parse(read(PENDING_PREFIX + subject) ?? 'null') as Partial<PendingConsent> | null;
    if (!v || typeof v.optedIn !== 'boolean' || (v.source !== 'signin' && v.source !== 'settings')) return null;
    return { optedIn: v.optedIn, source: v.source };
  } catch {
    return null;
  }
}
export function writePending(subject: string, pending: PendingConsent | null): void {
  write(PENDING_PREFIX + subject, pending ? JSON.stringify(pending) : null);
}

/** Account deleted: its local opt-in flags go too (the server rows are already gone). */
export function forgetLocalConsent(subject: string): void {
  write(ASKED_PREFIX + subject, null);
  write(LAST_KNOWN_PREFIX + subject, null);
  write(PENDING_PREFIX + subject, null);
}

// ---- API ------------------------------------------------------------------

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  if (!isEmailConsentAvailable()) throw new Error('Cloud sync is not configured.');
  const token = await getGoogleIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseState(body: unknown): EmailConsentState {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    optedIn: b.optedIn === true,
    wording: typeof b.wording === 'string' ? b.wording : null,
    updatedAt: typeof b.updatedAt === 'number' ? b.updatedAt : null,
  };
}

/** GET /v1/email-consent. Throws when offline or the server fails. */
export async function fetchEmailConsent(): Promise<EmailConsentState> {
  const response = await call('/v1/email-consent');
  if (!response.ok) throw new EmailConsentHttpError(response.status, `Email setting check failed (${response.status}).`);
  return parseState(await response.json());
}

/** POST /v1/email-consent. Throws when offline or refused. */
export async function sendEmailConsent(optedIn: boolean, source: EmailConsentSource, lang: string): Promise<EmailConsentState> {
  const response = await call('/v1/email-consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ optedIn, wording: WORDING_VERSION, lang: consentLang(lang), source }),
  });
  if (!response.ok) throw new EmailConsentHttpError(response.status, `Email setting save failed (${response.status}).`);
  return parseState(await response.json());
}
