import { SocialLogin } from '@capgo/capacitor-social-login';
import { Capacitor } from '@capacitor/core';

export interface GoogleAccount {
  /** Stable Google OpenID subject. Never use the mutable email as identity. */
  subject: string;
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

/** Google OAuth Web client IDs are public identifiers, not secrets. Keeping it
 * in an env value lets development and production use separate Cloud projects. */
const GOOGLE_WEB_CLIENT_ID = (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID ?? '').trim();
const GOOGLE_REDIRECT_URL = 'https://homedesignerapp.com/app/';
const GOOGLE_OAUTH_PENDING_KEY = 'social_login_oauth_pending';
const GOOGLE_PROVIDER_STATE_KEY = 'capgo_social_login_google_state';
const GOOGLE_ACCOUNT_CACHE_KEY = 'homedesigner.google-account.v1';
const GOOGLE_REDIRECT_RETURN_KEY = 'homedesigner.google-redirect-return.v1';

let initializePromise: Promise<void> | null = null;
let currentIdToken: string | null = null;

/** Every call below crosses the Capacitor bridge into the social-login plugin,
 *  and a native call that never calls back is a promise that never settles —
 *  not an error anyone can catch. Callers await these behind a `busy` flag that
 *  only clears in a `finally`, so one silent native hang froze the UI outright
 *  (see the stranded Pro buy button fixed in 1.22.10). Bound them here, at the
 *  boundary that knows they are native calls, rather than relying on every
 *  caller to remember. Token work is non-interactive, so the bound is short. */
const NATIVE_TIMEOUT_MS = 12_000;

function withNativeTimeout<T>(promise: Promise<T>, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${what} did not respond.`)), NATIVE_TIMEOUT_MS)),
  ]);
}

interface GoogleTokenClaims {
  aud?: string;
  email?: string;
  exp?: number;
  iss?: string;
  name?: string;
  nonce?: string;
  picture?: string;
  sub?: string;
}

interface GoogleRedirectState {
  nonce: string;
  returnTo: string;
  version: 1;
}

function safeReturnPath(value: unknown): string | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : null;
}

function readRedirectState(value: string | null): GoogleRedirectState | null {
  if (!value) return null;
  try {
    const state = JSON.parse(value) as Partial<GoogleRedirectState>;
    const returnTo = safeReturnPath(state.returnTo);
    if (state.version !== 1 || typeof state.nonce !== 'string' || !state.nonce || !returnTo) return null;
    return { version: 1, nonce: state.nonce, returnTo };
  } catch {
    return null;
  }
}

function readTokenClaims(token: string): GoogleTokenClaims | null {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as GoogleTokenClaims;
  } catch {
    return null;
  }
}

function tokenIsFresh(token: string): boolean {
  const payload = readTokenClaims(token);
  return typeof payload?.exp === 'number' && payload.exp * 1000 > Date.now() + 60_000;
}

export function isGoogleSignInConfigured(): boolean {
  return GOOGLE_WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com');
}

/**
 * Finishes a Google popup callback that the web plugin cannot recognise.
 *
 * Some desktop browsers open OAuth "popups" as ordinary tabs and deliberately
 * remove window.opener/window.name. Capgo then leaves the successful callback
 * stranded in that tab while the original app waits forever. Forward the
 * verified response over the same nonce-scoped channel the plugin already
 * listens to. Native login is unaffected.
 */
export function finishStrandedGooglePopup(): boolean {
  if (
    Capacitor.isNativePlatform() ||
    (!window.location.hash.includes('id_token=') && !window.location.hash.includes('error='))
  ) return false;

  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const redirectState = readRedirectState(params.get('state'));
    const pendingRaw = localStorage.getItem(GOOGLE_OAUTH_PENDING_KEY);
    const pending = pendingRaw
      ? JSON.parse(pendingRaw) as { provider?: string; nonce?: string; returnTo?: string }
      : null;
    if (pending && (pending.provider !== 'google' || !pending.nonce)) return false;
    if (!pending?.nonce && !redirectState?.nonce) return false;
    if (pending?.nonce && redirectState?.nonce && pending.nonce !== redirectState.nonce) return false;

    // Mobile browsers can complete OAuth in a different tab/context, where
    // local/session storage from the forum tab can be unavailable. Google
    // echoes `state`, and the ID token binds the same nonce, so carrying the
    // validated relative return path there makes the hand-off reliable without
    // allowing an open redirect.
    const returnTo = redirectState?.returnTo ??
      safeReturnPath(pending?.returnTo) ??
      safeReturnPath(sessionStorage.getItem(GOOGLE_REDIRECT_RETURN_KEY));
    if (params.get('error') && returnTo) {
      localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
      sessionStorage.removeItem(GOOGLE_REDIRECT_RETURN_KEY);
      window.location.replace(returnTo);
      return true;
    }
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');
    const claims = idToken ? readTokenClaims(idToken) : null;
    const trustedIssuer = claims?.iss === 'https://accounts.google.com' || claims?.iss === 'accounts.google.com';
    if (
      !accessToken ||
      !idToken ||
      claims?.aud !== GOOGLE_WEB_CLIENT_ID ||
      claims?.nonce !== (pending?.nonce ?? redirectState?.nonce) ||
      !trustedIssuer ||
      !tokenIsFresh(idToken)
    ) {
      return false;
    }

    const message = {
      type: 'oauth-response',
      provider: 'google',
      accessToken: { token: accessToken },
      idToken,
    };

    // Persist the same two values the provider normally stores after receiving
    // its popup message. This makes a full-page redirect resumable and also
    // protects opener-less popup tabs from a message-delivery race.
    localStorage.setItem(GOOGLE_PROVIDER_STATE_KEY, JSON.stringify({ accessToken, idToken }));
    localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);

    // Being a popup decides the hand-off, and it MUST be checked before
    // `returnTo`. `window.open()` clones the opener's sessionStorage, so a tab
    // that ever signed in through the full-page redirect (/community,
    // /app/model-studio) leaves GOOGLE_REDIRECT_RETURN_KEY behind for every
    // later popup to inherit. Ordering these the other way round sent the popup
    // down `window.location.replace()` instead of posting its message — and the
    // provider resolves ONLY on that message, while polling `popup.closed` every
    // second and rejecting with "Popup closed" when the window goes away
    // without one. That is the reported error, exactly.
    //
    // `window.opener` CANNOT be the primary signal, because by the time we run
    // here it is reliably null. `/app/` is served with
    // `Cross-Origin-Opener-Policy: same-origin-allow-popups` (site/_headers).
    // Landing back here from accounts.google.com is a cross-origin navigation
    // INTO a COOP document, and the spec's browsing-context-group check swaps
    // the group unless the two documents share both COOP value and origin —
    // they share neither, so the group is swapped and the opener is severed.
    //
    // "allow-popups" only covers the trip OUT: that hop leaves the initial
    // about:blank, which has its own carve-out, so the popup reaches Google
    // with its opener intact. It is the trip BACK that cuts it. That asymmetry
    // is exactly why this fails only *after* the account is chosen.
    //
    // The plugin hard-codes `state: 'popup'` on the URL it builds, while our own
    // full-page redirect sends versioned JSON, so `state` distinguishes the two
    // flows without depending on the opener surviving. BroadcastChannel is
    // origin-scoped rather than opener-scoped, so it still reaches the waiting
    // tab across the group swap.
    const isPopup = params.get('state') === 'popup' || (() => {
      try {
        return !!window.opener && window.opener !== window;
      } catch {
        return false; // cross-origin opener — treat as a redirect
      }
    })();

    if (isPopup) {
      const channel = (() => {
        try {
          return new BroadcastChannel(`google_oauth_${pending?.nonce ?? redirectState?.nonce}`);
        } catch {
          return null; // unsupported — postMessage alone still delivers
        }
      })();
      const deliver = () => {
        try {
          window.opener?.postMessage(message, window.location.origin);
        } catch {
          /* opener navigated away */
        }
        try {
          channel?.postMessage(message);
        } catch {
          /* channel already closed */
        }
      };
      // Deliver more than once, and do NOT tear the channel down in the same
      // tick: closing a BroadcastChannel immediately after posting can drop the
      // message, and a single post followed by close() is a race against the
      // opener's listener that only shows up on the fast path, when Google skips
      // the consent screen and returns almost instantly.
      deliver();
      const retries = [120, 350, 800].map((ms) => window.setTimeout(deliver, ms));
      // Remove bearer credentials from the address bar/history immediately.
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
      // The provider closes this window once it has the message; self-close is
      // only the fallback for when it never listened at all.
      window.setTimeout(() => {
        retries.forEach((id) => window.clearTimeout(id));
        try {
          channel?.close();
        } catch {
          /* already closed */
        }
        window.close();
        // `window.close()` is only honoured for a script-opened window, and the
        // COOP group swap described above can lose that association — so this
        // window may simply stay. React is deliberately not mounted on this
        // path, which means "stays" renders as a blank black window and reads as
        // a failure even when the hand-off above succeeded. Say what happened
        // instead of showing nothing.
        document.body.textContent = 'Signed in. You can close this window.';
        document.body.setAttribute(
          'style',
          'display:grid;place-items:center;height:100vh;margin:0;font:16px system-ui,sans-serif;color:#111;background:#fff',
        );
      }, 1500);
      return true;
    }

    if (returnTo) {
      sessionStorage.removeItem(GOOGLE_REDIRECT_RETURN_KEY);
      if (claims?.sub) {
        localStorage.setItem(GOOGLE_ACCOUNT_CACHE_KEY, JSON.stringify({
          subject: claims.sub,
          email: claims.email ?? null,
          name: claims.name ?? null,
          imageUrl: claims.picture ?? null,
        }));
      }
      // Replace the callback URL so bearer credentials never remain in history.
      window.location.replace(returnTo);
      return true;
    }

    // Neither a popup nor a redirect with a known return path: the credential is
    // already persisted above, so let the app boot normally on a clean URL.
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    return true;
  } catch {
    return false;
  }
}

function startGooglePageRedirect(): Promise<GoogleAccount> {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const returnTo = `${window.location.pathname}${window.location.search}`;
  localStorage.setItem(GOOGLE_OAUTH_PENDING_KEY, JSON.stringify({
    provider: 'google',
    loginType: 'online',
    nonce,
    returnTo,
  }));
  sessionStorage.setItem(GOOGLE_REDIRECT_RETURN_KEY, returnTo);
  const params = new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URL,
    response_type: 'token id_token',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    // Carry the exact page through mobile OAuth. Some Android browser hand-offs
    // do not preserve the originating tab's storage, so localStorage alone is
    // not a reliable return address.
    state: JSON.stringify({ version: 1, nonce, returnTo } satisfies GoogleRedirectState),
    nonce,
    // Always show the chooser. With an active Google session and no `prompt`,
    // Google skips it and re-issues for whichever account is already signed in,
    // so "sign in" after a sign-out silently returned the PREVIOUS account and
    // switching accounts was impossible.
    prompt: 'select_account',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  // Navigation replaces this page; keeping the promise pending prevents the
  // caller from clearing its busy state during the hand-off.
  return new Promise(() => {});
}

async function initializeGoogle(): Promise<void> {
  if (!isGoogleSignInConfigured()) {
    throw new Error('Google Sign-In is not configured in this build.');
  }
  const google = {
    webClientId: GOOGLE_WEB_CLIENT_ID,
    mode: 'online' as const,
    // The web provider otherwise derives this from the current pathname. Keep
    // production pinned to the URI registered in Google Cloud so navigation
    // to /app/index.html (or another route) cannot cause a redirect mismatch.
    ...(!Capacitor.isNativePlatform() && window.location.hostname === 'homedesignerapp.com'
      ? { redirectUrl: GOOGLE_REDIRECT_URL }
      : {}),
  };
  initializePromise ??= SocialLogin.initialize({
    google: {
      ...google,
    },
  }).catch((error) => {
    // A temporary plugin/browser initialization failure must not poison every
    // later sign-in attempt for the lifetime of the app process.
    initializePromise = null;
    throw error;
  });
  await initializePromise;
}

export async function signInWithGoogle(): Promise<GoogleAccount> {
  await initializeGoogle();
  // The plugin can retain a provider session after the app's local account was
  // cleared (for example, an offline sign-out). Reset that stale session before
  // starting a new login so desktop and Android do not fail with "already
  // signed in" or silently reuse the wrong Google account.
  const existing = await SocialLogin.isLoggedIn({ provider: 'google' }).catch(() => ({ isLoggedIn: false }));
  if (existing.isLoggedIn) {
    await SocialLogin.logout({ provider: 'google' }).catch(() => {});
    currentIdToken = null;
    // Also drop the record WE persisted. Without this, anyone already carrying a
    // stale credential from before that key was cleaned up on sign-out stays
    // stuck: `signOut()` early-returns when no account is cached, so this login
    // path is their only route back to a clean session.
    clearPersistedGoogleCredential();
  }
  const needsFullPageRedirect =
    window.location.pathname.startsWith('/community') ||
    window.location.pathname.startsWith('/app/model-studio');
  if (!Capacitor.isNativePlatform() && needsFullPageRedirect) {
    return startGooglePageRedirect();
  }
  const { result } = await SocialLogin.login({
    provider: 'google',
    // Android adds openid/email/profile itself. Supplying `scopes` here makes
    // the plugin require a custom MainActivity even for those defaults.
    //
    // `prompt` IS safe to pass, unlike `scopes`: the plugin documents it as web
    // only, and mobile keeps using its native chooser. Captured from the real
    // popup, the URL the plugin builds carries client_id, scope, nonce, state
    // and response_type but NO prompt — and Google's default is to prompt "only
    // the first time your project requests access". So with a live Google
    // session it skipped the chooser and re-issued for the account already
    // signed in, which is why signing in as a different address was impossible
    // after a sign-out. Note this is a different code path from
    // `startGooglePageRedirect` below, which builds its own URL: fixing that one
    // did nothing for the popup used by /app/.
    options: { prompt: 'select_account' },
  });
  if (result.responseType !== 'online') {
    throw new Error('Google Sign-In did not return an identity profile.');
  }

  // The native provider has already parsed the signed credential and exposes
  // Google's immutable `sub` as profile.id. The plugin's generic decoder in
  // 8.3.38 rejects valid JWTs, so do not route the credential back through it.
  const subject = result.profile.id;
  if (!subject) throw new Error('Google Sign-In returned no account identifier.');
  currentIdToken = result.idToken;

  return {
    subject,
    email: result.profile.email,
    name: result.profile.name,
    imageUrl: result.profile.imageUrl,
  };
}

export async function hasGoogleSession(): Promise<boolean> {
  await initializeGoogle();
  const { isLoggedIn } = await SocialLogin.isLoggedIn({ provider: 'google' });
  if (!isLoggedIn) {
    currentIdToken = null;
    return false;
  }
  if (Capacitor.isNativePlatform()) return true;

  // The web plugin can report isLoggedIn after its persisted ID token has
  // expired, but it cannot refresh that token. Treat that state as signed out
  // so the desktop UI does not show an account whose sync requests all fail.
  const cached = await SocialLogin.getAuthorizationCode({ provider: 'google' });
  if (cached.jwt && tokenIsFresh(cached.jwt)) {
    currentIdToken = cached.jwt;
    return true;
  }
  currentIdToken = null;
  return false;
}

/** Drop the provider's PERSISTED credential, not just the in-memory copy.
 *
 *  `handleGoogleRedirectCallback` writes GOOGLE_PROVIDER_STATE_KEY itself, to
 *  mimic what the plugin stores after a popup message. Clearing it is therefore
 *  our responsibility too — the plugin's own logout does not reliably remove a
 *  record it did not create.
 *
 *  Observed on the live site while the UI showed "Sign in with Google": the
 *  account cache was null, yet this key still held an UNEXPIRED access + ID
 *  token for the previously signed-in address. Two consequences, both reported:
 *  `isLoggedIn()` reads that token and claims a session, so signing in as a
 *  DIFFERENT account either silently reused the old one or threw on the
 *  unexpected login response; and a live Google credential outlived sign-out in
 *  localStorage, which on a shared machine is a credential leak.
 */
function clearPersistedGoogleCredential(): void {
  try {
    localStorage.removeItem(GOOGLE_PROVIDER_STATE_KEY);
    localStorage.removeItem(GOOGLE_OAUTH_PENDING_KEY);
    sessionStorage.removeItem(GOOGLE_REDIRECT_RETURN_KEY);
  } catch {
    /* storage unavailable — the in-memory token is still cleared below */
  }
}

export async function signOutFromGoogle(): Promise<void> {
  // Clear first so no in-flight cloud request can reuse the credential while
  // the provider is taking time to finish its own logout.
  currentIdToken = null;
  clearPersistedGoogleCredential();
  try {
    await initializeGoogle();
    await SocialLogin.logout({ provider: 'google' });
  } finally {
    // Never let a credential survive a local sign-out, even when the provider's
    // remote logout call is temporarily unavailable. Repeated deliberately: the
    // plugin can re-persist its state while logging out.
    currentIdToken = null;
    clearPersistedGoogleCredential();
  }
}

/** Returns a short-lived Google ID token for server authentication.
 * Tokens remain in memory only and are verified again by the sync Worker. */
export async function getGoogleIdToken(): Promise<string> {
  await initializeGoogle();
  if (currentIdToken && tokenIsFresh(currentIdToken)) return currentIdToken;

  // The web provider persists its ID token and exposes it here. Its refresh()
  // method is deliberately unimplemented, so calling refresh first breaks
  // cloud sync every time the desktop app is reloaded.
  const cached = await withNativeTimeout(
    SocialLogin.getAuthorizationCode({ provider: 'google' }), 'Google sign-in');
  if (cached.jwt && tokenIsFresh(cached.jwt)) {
    currentIdToken = cached.jwt;
    return cached.jwt;
  }

  if (!Capacitor.isNativePlatform()) {
    throw new Error('Google session expired. Sign in again to sync your plans.');
  }

  await withNativeTimeout(
    SocialLogin.refresh({ provider: 'google', options: {} }), 'Google session refresh');
  const refreshed = await withNativeTimeout(
    SocialLogin.getAuthorizationCode({ provider: 'google' }), 'Google sign-in');
  if (!refreshed.jwt) throw new Error('Google session needs to be refreshed.');
  currentIdToken = refreshed.jwt;
  return refreshed.jwt;
}

/** Namespaces Google subjects so future identity providers cannot collide. */
export function revenueCatUserId(account: GoogleAccount): string {
  return `google:${account.subject}`;
}
