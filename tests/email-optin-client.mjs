// Email opt-in, app side: the consent store the card and Settings toggle bind
// to, run against the REAL worker module and migration (fetch is routed into
// workers/design-sync/src/email-consent.ts over SQLite).
//
//   node tests/email-optin-client.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';
import ts from 'typescript';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hd-optin-client-'));
let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };
const tick = () => new Promise((r) => setTimeout(r, 0));

// ---- Browser-ish globals ----------------------------------------------------
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
const windowListeners = {};
globalThis.window = { setTimeout, clearTimeout, addEventListener: (n, f) => { windowListeners[n] = f; } };
globalThis.document = { visibilityState: 'visible', addEventListener: () => {}, documentElement: {} };

// ---- The real worker over SQLite ---------------------------------------------
const workerSrc = readFileSync('workers/design-sync/src/email-consent.ts', 'utf8');
writeFileSync(join(dir, 'email-consent.mjs'), ts.transpileModule(workerSrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
const worker = await import(pathToFileURL(join(dir, 'email-consent.mjs')).href);
const sql = new DatabaseSync(':memory:');
sql.exec(readFileSync('workers/design-sync/migrations/0011_email_consent.sql', 'utf8'));
const db = {
  prepare(query) {
    const stmt = sql.prepare(query);
    const bound = (args) => ({ first: async () => stmt.get(...args) ?? null, run: async () => ({ meta: { changes: stmt.run(...args).changes } }) });
    return { bind: (...args) => bound(args), ...bound([]) };
  },
};
const rows = (subject) => sql.prepare('SELECT * FROM email_consent_log WHERE subject = ? ORDER BY id').all(subject);

// Who the "Google token" is. The token string is the subject; the identity table says if the email is verified.
const identities = {
  'sub-a': { subject: 'sub-a', email: 'a@example.com', emailVerified: true },
  'sub-b': { subject: 'sub-b', email: 'b@example.com', emailVerified: true },
  'sub-c': { subject: 'sub-c', email: 'c@example.com', emailVerified: true },
  'sub-u': { subject: 'sub-u', email: 'u@example.com', emailVerified: false },
  'sub-off': { subject: 'sub-off', email: 'off@example.com', emailVerified: true },
};
globalThis.__optinTest = { token: 'sub-a', tokenFails: false };
let online = true;
let hang = false;
const calls = [];
const events = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.pathname === '/v1/events') {
    events.push(...JSON.parse(init.body).events);
    return { status: 202 };
  }
  if (hang) return new Promise(() => {});
  if (!online) throw new TypeError('offline');
  const token = (init.headers?.Authorization ?? '').replace('Bearer ', '');
  const identity = identities[token];
  calls.push({ method: init.method ?? 'GET', path: u.pathname, token });
  if (u.pathname !== '/v1/email-consent' || !identity) return new Response('{}', { status: 401 });
  const result = (init.method ?? 'GET') === 'POST'
    ? await worker.postEmailConsent(new Request(url, { method: 'POST', body: init.body }), db, identity)
    : await worker.getEmailConsent(db, identity);
  return new Response(JSON.stringify(result.body), { status: result.status });
};

// ---- Bundle the store, with a stub in place of the Google sign-in module ----------
const entry = join(root, '.email-optin-entry.tmp.ts');
writeFileSync(entry, `export * from '${rootImport}/src/store/emailConsentStore.ts';\nexport * as lib from '${rootImport}/src/lib/emailConsent.ts';\nexport { flush as flushEvents } from '${rootImport}/src/lib/events.ts';\n`);
const out = join(dir, 'bundle.mjs');
let mod;
try {
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
    define: { 'import.meta.env.VITE_CLOUD_SYNC_URL': '"https://sync.example.test/"', __APP_VERSION__: '"1.22.54"' },
    plugins: [{
      name: 'stub-google-auth',
      setup(b) {
        b.onResolve({ filter: /\/googleAuth$/ }, () => ({ path: 'googleAuth-stub', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
          contents: `export async function getGoogleIdToken() { if (globalThis.__optinTest.tokenFails) throw new Error('Google session expired.'); return globalThis.__optinTest.token; }`,
          loader: 'js',
        }));
      },
    }],
  });
  mod = await import(pathToFileURL(out).href);
} finally {
  rmSync(entry, { force: true });
}
const { useEmailConsentStore, startEmailOptinCheck, setEmailConsentAccount, forgetEmailConsentAccount, lib, flushEvents } = mod;
const S = () => useEmailConsentStore.getState();
const as = (sub) => { globalThis.__optinTest.token = sub; };

try {
  check(lib.WORDING_VERSION === 'optin-v1-2026-11-28', "WORDING_VERSION is 'optin-v1-2026-11-28'");

  // ---- First sign-in: the card is raised, never pre-ticked, nothing is sent ----
  as('sub-a');
  await S().checkAfterSignIn('sub-a');
  check(S().emailOptinPrompt === true, 'first sign-in with no server row raises the card');
  check(S().optedIn === false && S().pending === null, 'never pre-ticked: state is "no", nothing pending');
  check(rows('sub-a').length === 0 && !calls.some((c) => c.method === 'POST'), 'raising the card writes nothing to the server (no silent opt-in)');
  check(store.get('homedesigner.emailOptinAsked.v1:sub-a') === '1', 'asked flag stored under homedesigner.emailOptinAsked.v1:<sub>');

  // ---- Once per account ----
  setEmailConsentAccount(null);
  check(S().emailOptinPrompt === false && S().subject === null && S().optedIn === null, 'signing out clears the store');
  calls.length = 0;
  await S().checkAfterSignIn('sub-a');
  check(S().emailOptinPrompt === false && calls.length === 0, 'second sign-in on the same account: no card, no request');

  // ---- "Not now" writes opted_in = 0 ----
  as('sub-b');
  await S().checkAfterSignIn('sub-b');
  check(S().emailOptinPrompt === true, 'another account gets its own card');
  S().markShown('signin');
  check(await S().dismissPrompt() === true, 'Not now resolves true once stored');
  check(S().emailOptinPrompt === false, 'Not now hides the card');
  const b = rows('sub-b');
  check(b.length === 1 && b[0].opted_in === 0 && b[0].source === 'signin' && b[0].wording === 'optin-v1-2026-11-28', 'Not now writes opted_in=0 (source signin, wording optin-v1-2026-11-28)');
  check(S().optedIn === false && S().pending === null, 'store shows the confirmed "no"');

  // ---- Yes on the card, then Settings ----
  as('sub-c');
  await S().checkAfterSignIn('sub-c');
  S().markShown('signin');
  check(await S().setOptIn(true, 'signin') === true && S().optedIn === true && S().emailOptinPrompt === false, 'Yes on the card stores a yes and hides the card');
  check(rows('sub-c').length === 1 && rows('sub-c')[0].opted_in === 1 && rows('sub-c')[0].email === 'c@example.com', 'the yes row carries the token email, not anything the app sent');
  S().markShown('settings');
  await S().setOptIn(false, 'settings');
  check(S().optedIn === false && rows('sub-c').at(-1).source === 'settings', 'Settings toggle off posts source settings');
  await S().setOptIn(true, 'settings');
  check(S().optedIn === true && rows('sub-c').length === 3, 'Settings toggle on again appends a third row');
  check(JSON.parse(store.get('homedesigner.emailConsent.v1:sub-c')).optedIn === true, 'last known state is cached for offline display');

  // A server row from another device: no card on this one.
  setEmailConsentAccount(null);
  store.delete('homedesigner.emailOptinAsked.v1:sub-c');
  await S().checkAfterSignIn('sub-c');
  check(S().emailOptinPrompt === false && store.get('homedesigner.emailOptinAsked.v1:sub-c') === '1', 'server already has a row: no card, and marked asked');

  // ---- Offline: last known state shown, the answer retried on reconnect ----
  setEmailConsentAccount(null);
  setEmailConsentAccount('sub-c');
  check(S().optedIn === true, 'restored account shows the last known state immediately');
  online = false;
  check(await S().setOptIn(false, 'settings') === false, 'offline change resolves false');
  check(S().optedIn === true && S().pending === false, 'offline: confirmed state unchanged, answer held as pending');
  const before = rows('sub-c').length;
  online = true;
  windowListeners.online?.();
  for (let i = 0; i < 5; i++) await tick();
  await S().refresh();
  check(rows('sub-c').length === before + 1 && rows('sub-c').at(-1).opted_in === 0 && S().optedIn === false && S().pending === null, 'reconnect sends the pending answer');

  // Two quick taps: the last one wins.
  await Promise.all([S().setOptIn(true, 'settings'), S().setOptIn(false, 'settings')]);
  check(rows('sub-c').at(-1).opted_in === 0 && S().optedIn === false, 'two quick taps reach the server in order (last wins)');

  // Offline at sign-in: no card now, and the next sign-in tries again.
  setEmailConsentAccount(null);
  as('sub-off');
  online = false;
  await S().checkAfterSignIn('sub-off');
  check(S().emailOptinPrompt === false && !store.has('homedesigner.emailOptinAsked.v1:sub-off'), 'offline check: no card, not marked asked');
  online = true;
  setEmailConsentAccount(null);
  await S().checkAfterSignIn('sub-off');
  check(S().emailOptinPrompt === true, 'next sign-in online raises it');

  // Unverified email: refused, nothing stored, nothing retried.
  setEmailConsentAccount(null);
  as('sub-u');
  await S().checkAfterSignIn('sub-u');
  check(await S().setOptIn(true, 'signin') === false && S().unverified === true && S().pending === null && S().optedIn === false && rows('sub-u').length === 0,
    'unverified email: refused, no row, pending dropped, still "no"');

  // ---- Never blocks or fails sign-in ----
  setEmailConsentAccount(null);
  hang = true;
  const t0 = Date.now();
  startEmailOptinCheck('sub-hang');
  check(Date.now() - t0 < 50, 'startEmailOptinCheck returns at once even if the network hangs');
  hang = false;
  globalThis.__optinTest.tokenFails = true;
  let threw = false;
  try { startEmailOptinCheck('sub-x'); await S().checkAfterSignIn('sub-x'); await S().setOptIn(true, 'settings'); await S().refresh(); } catch { threw = true; }
  check(!threw && S().emailOptinPrompt === false, 'a failing Google token never throws out of the store');
  globalThis.__optinTest.tokenFails = false;
  {
    const auth = readFileSync('src/store/authStore.ts', 'utf8');
    const signIn = auth.slice(auth.indexOf('signIn: async'), auth.indexOf('signOut: async'));
    const w = signIn.indexOf('writeAccount(account);');
    const hook = signIn.indexOf('startEmailOptinCheck(account.subject);');
    check(w >= 0 && hook > w && hook < signIn.indexOf('await bounded(', w), 'signIn starts the check right after writeAccount, before the sync');
    check(!/await\s+startEmailOptinCheck|await\s+useEmailConsentStore/.test(auth), 'authStore never awaits the opt-in');
    check(!/optedIn|emailOptinPrompt/.test(auth), 'authStore never reads the answer');
  }

  // ---- Account deletion forgets the local flags ----
  setEmailConsentAccount('sub-c');
  forgetEmailConsentAccount('sub-c');
  check(![...store.keys()].some((k) => k.endsWith(':sub-c')) && S().subject === null, 'account deletion clears the local opt-in keys');

  // ---- Nothing else depends on the answer ----
  {
    const files = [];
    const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(p); } };
    walk(join(root, 'src'));
    const users = files.filter((f) => /emailConsent(Store)?['"]/.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f).replaceAll('\\', '/'));
    const allowed = (f) => f === 'src/store/authStore.ts' || f === 'src/store/emailConsentStore.ts' || f.startsWith('src/components/');
    check(users.every(allowed), `only the auth hook, the store and UI components use the opt-in (${users.join(', ')})`);
  }

  // ---- Events: only the six details, never an email or account id ----
  await flushEvents();
  const optin = events.filter((e) => e.event === 'email_optin');
  const allowedDetails = ['shown:signin', 'shown:settings', 'yes:signin', 'no:signin', 'yes:settings', 'no:settings'];
  check(optin.length >= 6 && optin.every((e) => allowedDetails.includes(e.detail)), 'every email_optin event carries one of the six details');
  check(['shown:signin', 'shown:settings', 'yes:signin', 'no:signin', 'yes:settings', 'no:settings'].every((d) => optin.some((e) => e.detail === d)), 'all six details were produced by the store');
  check(!JSON.stringify(events).match(/@|sub-[a-z]/), 'no email address or account id in any event');

  console.log(`email-optin-client: ${checks} checks passed`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
