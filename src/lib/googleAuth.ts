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

  // The native Credential Manager response is authoritative for this local
  // account link. Decode the ID token only to obtain its stable `sub`; never
  // persist access/ID tokens or use the mutable email as a RevenueCat ID.
  let subject = result.profile.id;
  if (result.idToken) {
    const { claims } = await SocialLogin.decodeIdToken({ idToken: result.idToken });
    if (typeof claims.sub === 'string' && claims.sub) subject = claims.sub;
  }
  if (!subject) throw new Error('Google Sign-In returned no account identifier.');

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
}

/** Namespaces Google subjects so future identity providers cannot collide. */
export function revenueCatUserId(account: GoogleAccount): string {
  return `google:${account.subject}`;
}
