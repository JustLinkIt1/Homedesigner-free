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
  ['Settings button is labelled Delete account and calls deleteAccount', (() => {
    const dlg = readFileSync('src/components/SettingsDialog.tsx', 'utf8');
    return dlg.includes("aria-label={t('Delete account')}") && dlg.includes('void deleteAccount()') && !dlg.includes('Delete cloud backups');
  })()],
  ['Delete confirm names what is deleted, the device copy and the sign-out', (() => {
    const dlg = readFileSync('src/components/SettingsDialog.tsx', 'utf8');
    return /cloud plans, community posts and images, avatar and AI points are deleted and cannot be recovered\. Plans saved on this device stay on this device\. (?:[^']*\. )?You will be signed out/.test(dlg);
  })()],
  ['deleteAccount stops sync first, signs out only after the server delete succeeds', (() => {
    const store = readFileSync('src/store/authStore.ts', 'utf8');
    const a = store.indexOf('deleteAccount: async');
    const body = store.slice(a, store.indexOf('syncNow: async', a));
    const stop = body.indexOf('stopProjectSync?.()');
    const del = body.indexOf('await deleteCloudAccount()');
    const out = body.indexOf('writeAccount(null)');
    const google = body.indexOf('signOutFromGoogle()');
    const restart = body.indexOf('stopProjectSync = startProjectSync()');
    return stop >= 0 && stop < del && del < out && out < google && restart > del && restart < out;
  })()],
  ['cloud delete waits for an in-flight sync and uses DELETE /v1/account', (() => {
    const cloud = readFileSync('src/lib/cloudSync.ts', 'utf8');
    const a = cloud.indexOf('export async function deleteCloudAccount');
    const body = cloud.slice(a, cloud.indexOf('export function startProjectSync'));
    return body.includes('await syncPromise') && body.includes("method: 'DELETE'") && body.includes('/v1/account');
  })()],
];

let failures = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
}
if (failures) process.exit(1);
console.log('\nAUTH: all green');
