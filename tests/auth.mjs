import { readFileSync } from 'node:fs';

const source = readFileSync('src/lib/googleAuth.ts', 'utf8');
const start = source.indexOf('export async function signInWithGoogle');
const end = source.indexOf('export async function hasGoogleSession', start);
const body = source.slice(start, end);
const webBranch = body.indexOf('if (!Capacitor.isNativePlatform())');
const directRedirect = body.indexOf('return startGooglePageRedirect()', webBranch);
const providerInit = body.indexOf('await initializeGoogle()');

const checks = [
  ['web takes the same-tab branch', webBranch >= 0],
  ['web redirect starts before provider initialization', directRedirect > webBranch && directRedirect < providerInit],
  ['web clears stale provider credentials before redirect', body.indexOf('clearPersistedGoogleCredential()', webBranch) < directRedirect],
  ['native provider initialization remains after the web branch', providerInit > directRedirect],
  ['OAuth uses the registered production callback', source.includes("const GOOGLE_REDIRECT_URL = 'https://homedesignerapp.com/app/'")],
  ['OAuth callback binds state to a nonce', source.includes("claims?.nonce !== (pending?.nonce ?? redirectState?.nonce)")],
  ['OAuth callback verifies the client audience', source.includes('claims?.aud !== GOOGLE_WEB_CLIENT_ID')],
  ['OAuth callback removes credentials from browser history', source.includes("history.replaceState(null, '',")],
];

let failures = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
}
if (failures) process.exit(1);
console.log('\nAUTH: all green');
