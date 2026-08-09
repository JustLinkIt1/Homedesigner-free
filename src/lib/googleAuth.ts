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

    window.opener?.postMessage(message, window.location.origin);
    const channel = new BroadcastChannel(`google_oauth_${pending?.nonce ?? redirectState?.nonce}`);
    channel.postMessage(message);
    channel.close();

    // Remove bearer credentials from the address bar/history immediately.
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    window.setTimeout(() => window.close(), 0);
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
    options: {},
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

export async function signOutFromGoogle(): Promise<void> {
  // Clear first so no in-flight cloud request can reuse the credential while
  // the provider is taking time to finish its own logout.
  currentIdToken = null;
  try {
    await initializeGoogle();
    await SocialLogin.logout({ provider: 'google' });
  } finally {
    // Never let an in-memory credential survive a local sign-out, even when
    // the provider's remote logout call is temporarily unavailable.
    currentIdToken = null;
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
  const cached = await SocialLogin.getAuthorizationCode({ provider: 'google' });
  if (cached.jwt && tokenIsFresh(cached.jwt)) {
    currentIdToken = cached.jwt;
    return cached.jwt;
  }

  if (!Capacitor.isNativePlatform()) {
    throw new Error('Google session expired. Sign in again to sync your plans.');
  }

  await SocialLogin.refresh({ provider: 'google', options: {} });
  const refreshed = await SocialLogin.getAuthorizationCode({ provider: 'google' });
  if (!refreshed.jwt) throw new Error('Google session needs to be refreshed.');
  currentIdToken = refreshed.jwt;
  return refreshed.jwt;
}

/** Namespaces Google subjects so future identity providers cannot collide. */
export function revenueCatUserId(account: GoogleAccount): string {
  return `google:${account.subject}`;
}
