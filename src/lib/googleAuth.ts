import { SocialLogin } from '@capgo/capacitor-social-login';

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

let initializePromise: Promise<void> | null = null;
let currentIdToken: string | null = null;

function tokenIsFresh(token: string): boolean {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as { exp?: number };
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
}

export function isGoogleSignInConfigured(): boolean {
  return GOOGLE_WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com');
}

async function initializeGoogle(): Promise<void> {
  if (!isGoogleSignInConfigured()) {
    throw new Error('Google Sign-In is not configured in this build.');
  }
  initializePromise ??= SocialLogin.initialize({
    google: {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      mode: 'online',
    },
  });
  await initializePromise;
}

export async function signInWithGoogle(): Promise<GoogleAccount> {
  await initializeGoogle();
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
  return isLoggedIn;
}

export async function signOutFromGoogle(): Promise<void> {
  await initializeGoogle();
  await SocialLogin.logout({ provider: 'google' });
  currentIdToken = null;
}

/** Returns a short-lived Google ID token for server authentication.
 * Tokens remain in memory only and are verified again by the sync Worker. */
export async function getGoogleIdToken(): Promise<string> {
  await initializeGoogle();
  if (currentIdToken && tokenIsFresh(currentIdToken)) return currentIdToken;

  await SocialLogin.refresh({ provider: 'google', options: {} });
  const auth = await SocialLogin.getAuthorizationCode({ provider: 'google' });
  if (!auth.jwt) throw new Error('Google session needs to be refreshed.');
  currentIdToken = auth.jwt;
  return auth.jwt;
}

/** Namespaces Google subjects so future identity providers cannot collide. */
export function revenueCatUserId(account: GoogleAccount): string {
  return `google:${account.subject}`;
}
