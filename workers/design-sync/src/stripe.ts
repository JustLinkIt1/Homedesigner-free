/**
 * Stripe webhook authentication.
 *
 * Split out of `index.ts` deliberately: `/v1/stripe/webhook` is a PUBLIC route
 * that credits real money to real accounts, and this signature check is the
 * entirety of its authentication. Living in its own module means it can be
 * tested against forged and replayed inputs without standing up a Worker.
 */

/**
 * Constant-time string compare.
 *
 * A byte-by-byte compare that returns early leaks, through timing, how much of
 * a candidate signature was correct -- which is enough to forge one a byte at a
 * time. Always walks the whole string.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * How far out of date a signed webhook may be. Without a bound, a webhook body
 * captured once stays valid forever and can be replayed for points at will.
 * Five minutes is Stripe's own documented default.
 */
export const STRIPE_SIGNATURE_TOLERANCE_S = 300;

/**
 * Verifies Stripe's `Stripe-Signature` header.
 *
 * The scheme is HMAC-SHA256 over `${timestamp}.${rawBody}`, keyed by the
 * endpoint's `whsec_...` secret, hex encoded.
 *
 * `payload` MUST be the raw body exactly as received. Parsing the JSON and
 * re-serialising it changes the bytes -- key order, whitespace, number
 * formatting -- and every signature then fails for reasons that look like a
 * misconfigured secret.
 */
export async function stripeSignatureValid(
  payload: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!header || !secret) return false;

  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === 't') timestamp = value;
    // Stripe sends more than one v1 signature while an endpoint secret is
    // being rotated, and either may be the valid one.
    else if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) return false;

  const signedAt = Number(timestamp);
  if (!Number.isFinite(signedAt)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - signedAt) > STRIPE_SIGNATURE_TOLERANCE_S) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return signatures.some((candidate) => timingSafeEqual(candidate.toLowerCase(), expected));
}
