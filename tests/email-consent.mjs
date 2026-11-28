// Email opt-in, worker side: signed unsubscribe token, consent routes and the
// export query, against the real migration in SQLite.
//
//   node tests/email-consent.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const dir = mkdtempSync(join(process.cwd(), 'workers/design-sync/.email-consent-'));
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  const src = readFileSync('workers/design-sync/src/email-consent.ts', 'utf8');
  writeFileSync(join(dir, 'email-consent.mjs'), ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const m = await import(pathToFileURL(join(dir, 'email-consent.mjs')).href);
  const exportScript = await import(pathToFileURL(join(process.cwd(), 'workers/design-sync/scripts/export-optins.mjs')).href);

  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('workers/design-sync/migrations/0011_email_consent.sql', 'utf8'));
  const db = {
    prepare(query) {
      const stmt = sql.prepare(query);
      const bound = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        run: async () => ({ meta: { changes: stmt.run(...args).changes } }),
      });
      return { bind: (...args) => bound(args), ...bound([]) };
    },
  };
  const rows = (subject) => sql.prepare('SELECT * FROM email_consent_log WHERE subject = ? ORDER BY id').all(subject);
  const total = () => sql.prepare('SELECT COUNT(*) AS n FROM email_consent_log').get().n;

  const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
  const SUB = '109876543210987654321';
  const OTHER = '100000000000000000001';
  const T = Date.UTC(2026, 10, 28, 9);

  // ---- Token sign / verify -------------------------------------------------
  const token = await m.unsubscribeToken(SECRET, SUB);
  const [subPart, sigPart] = token.split('.');
  check(Buffer.from(subPart, 'base64url').toString() === SUB && /^[A-Za-z0-9_-]{43}$/.test(sigPart), 'token is base64url(subject).base64url(HMAC-SHA256)');
  check(sigPart === (await import('node:crypto')).createHmac('sha256', SECRET).update(`unsub:v1:${SUB}`).digest('base64url'), 'signature is HMAC-SHA256(secret, "unsub:v1:" + subject)');
  check(await m.verifyUnsubscribeToken(SECRET, token) === SUB, 'a genuine token verifies to its subject');
  check(token === exportScript.unsubscribeToken(SECRET, SUB), 'the export script signs exactly the same token as the worker');
  const flip = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
  check(await m.verifyUnsubscribeToken(SECRET, `${subPart}.${flip(sigPart, 0)}`) === null, 'tampered signature (first char) is refused');
  check(await m.verifyUnsubscribeToken(SECRET, `${subPart}.${flip(sigPart, 41)}`) === null, 'tampered signature (late char) is refused');
  check(await m.verifyUnsubscribeToken(SECRET, `${Buffer.from(OTHER).toString('base64url')}.${sigPart}`) === null, 'a signature moved onto another subject is refused');
  check(await m.verifyUnsubscribeToken('another-secret-0123456789abcdef0123456789', token) === null, 'a token signed with another secret is refused');
  for (const bad of [null, '', 'abc', `${subPart}.`, `.${sigPart}`, `${subPart}.${sigPart}.x`, `${subPart}.${sigPart.slice(0, 20)}`, `${subPart}.${sigPart}AAAA`, `${Buffer.from('a b').toString('base64url')}.${sigPart}`, 'x'.repeat(700)]) {
    check(await m.verifyUnsubscribeToken(SECRET, bad) === null, `malformed token refused: ${String(bad).slice(0, 24)}`);
  }
  check(await m.verifyUnsubscribeToken('', token) === null, 'no secret configured: nothing verifies');
  // Constant time: the comparison folds every byte and never exits early.
  const a = new Uint8Array(32).fill(7);
  check(m.timingSafeEqual(a, new Uint8Array(32).fill(7)) === true, 'equal bytes compare equal');
  check(!m.timingSafeEqual(a, Uint8Array.from(a, (v, i) => (i === 0 ? 8 : v))) && !m.timingSafeEqual(a, Uint8Array.from(a, (v, i) => (i === 31 ? 8 : v))), 'a difference in the first or last byte is caught');
  check(!m.timingSafeEqual(a, a.slice(0, 31)) && !m.timingSafeEqual(a, new Uint8Array(33).fill(7)), 'a length difference is caught');
  {
    const fn = src.slice(src.indexOf('export function timingSafeEqual'), src.indexOf('export async function unsubscribeToken'));
    check(!/return\s+false|break|\bsome\(|\bevery\(|===\s*b\[/.test(fn) && /diff \|= a\[i\] \^/.test(fn), 'timingSafeEqual has no early exit (XOR-fold over every byte)');
    check(src.includes('timingSafeEqual(expected, signature)') && !/expected\s*===|===\s*signature/.test(src), 'verification uses the constant-time compare, not ===');
  }

  // ---- POST /v1/email-consent ---------------------------------------------
  const verified = { subject: SUB, email: 'Person@Example.com', emailVerified: true };
  const post = (identity, body, now = T) => m.postEmailConsent(
    new Request('https://x/v1/email-consent', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), db, identity, now);
  const yes = { optedIn: true, wording: 'optin-v1', lang: 'en', source: 'signin' };

  let r = await post({ ...verified, emailVerified: false }, yes);
  check(r.status === 403 && total() === 0, 'unverified email: 403 and no row');
  r = await post({ ...verified, email: null }, yes);
  check(r.status === 403 && total() === 0, 'no email in the token: 403 and no row');
  for (const [body, label] of [
    [{ ...yes, optedIn: 'true' }, 'optedIn not a boolean'],
    [{ ...yes, wording: 'x'.repeat(33) }, 'wording over 32'],
    [{ ...yes, wording: '' }, 'empty wording'],
    [{ ...yes, lang: 'english-language' }, 'lang not a language tag'],
    [{ ...yes, source: 'unsubscribe_link' }, 'app may not post unsubscribe_link'],
    [{ ...yes, source: 'list_unsubscribe' }, 'app may not post list_unsubscribe'],
    [{ ...yes, source: 'banner' }, 'unknown source'],
    ['{nope', 'malformed JSON'],
    [[yes], 'array body'],
  ]) {
    r = await post(verified, body);
    check(r.status === 400 && total() === 0, `invalid body refused: ${label}`);
  }

  // GET with no row: optedIn false, nothing else.
  r = await m.getEmailConsent(db, verified);
  check(r.status === 200 && r.body.optedIn === false && r.body.wording === null && r.body.updatedAt === null, 'GET with no row is optedIn:false');

  r = await post(verified, yes, T);
  check(r.status === 200 && r.body.changed === true && r.body.optedIn === true && rows(SUB).length === 1, 'a yes appends one row');
  const first = rows(SUB)[0];
  check(first.email === 'person@example.com' && first.opted_in === 1 && first.wording === 'optin-v1' && first.lang === 'en' && first.source === 'signin' && first.created_at === T,
    'row carries the verified email (lower-cased), wording, lang, source, time');
  r = await post(verified, { ...yes, source: 'settings' }, T + 1000);
  check(r.status === 200 && r.body.changed === false && rows(SUB).length === 1, 'unchanged state is a no-op');
  r = await post(verified, { ...yes, optedIn: false, source: 'settings' }, T + 2000);
  check(r.body.changed === true && rows(SUB).length === 2, 'append-only: two changes make two rows');
  check(rows(SUB)[0].opted_in === 1 && rows(SUB)[0].created_at === T, 'the earlier row is never updated');
  r = await m.getEmailConsent(db, verified);
  check(r.body.optedIn === false && r.body.updatedAt === T + 2000 && r.body.wording === 'optin-v1', 'GET returns the newest row');
  await post(verified, { ...yes, source: 'settings', wording: 'optin-v2', lang: 'de' }, T + 3000);
  r = await m.getEmailConsent(db, verified);
  check(r.body.optedIn === true && r.body.wording === 'optin-v2' && r.body.updatedAt === T + 3000, 'GET follows the newest row again');
  // "Not now" with no row yet still writes opted_in = 0 (the record of asking).
  const other = { subject: OTHER, email: 'other@example.com', emailVerified: true };
  r = await post(other, { ...yes, optedIn: false });
  check(r.body.changed === true && rows(OTHER).length === 1 && rows(OTHER)[0].opted_in === 0, 'a first "no" (Not now) writes opted_in=0');
  r = await m.getEmailConsent(db, other);
  check(r.body.optedIn === false && r.body.updatedAt !== null, 'after Not now the server has a row (so the card is not shown again)');

  // ---- Unsubscribe GET / POST -----------------------------------------------
  const u = (t) => new URL(`https://x/v1/email/unsubscribe?t=${encodeURIComponent(t)}`);
  const beforeBad = total();
  let h = await m.unsubscribeLinkPage(u(`${subPart}.${flip(sigPart, 3)}`), db, SECRET, T + 4000);
  check(h.status === 400 && total() === beforeBad && /not valid/i.test(h.body), 'GET with a tampered token: 400 page, no row');
  h = await m.unsubscribeLinkPage(u(token), db, undefined, T + 4000);
  check(h.status === 503 && total() === beforeBad, 'GET with no secret configured: 503, no row');
  h = await m.unsubscribeLinkPage(u(token), db, SECRET, T + 4000);
  const afterGet = rows(SUB).at(-1);
  check(h.status === 200 && h.contentType.startsWith('text/html') && /unsubscribed/i.test(h.body), 'GET returns the plain "unsubscribed" HTML page');
  check(afterGet.opted_in === 0 && afterGet.source === 'unsubscribe_link' && afterGet.email === 'person@example.com' && afterGet.created_at === T + 4000, 'GET appends opted_in=0 with source unsubscribe_link');
  check(!/<style|<script|style=|<link/i.test(h.body) && /lang="en"/.test(h.body), 'page is plain HTML: no styles, no scripts');
  check(!h.body.includes(SUB) && !h.body.includes('person@example.com'), 'page shows neither the account id nor the email');
  const n1 = rows(SUB).length;
  h = await m.unsubscribeLinkPage(u(token), db, SECRET, T + 5000);
  check(h.status === 200 && rows(SUB).length === n1, 'GET is idempotent: a second click adds no row');

  await post(verified, { ...yes, source: 'settings' }, T + 6000); // opted back in, in Settings
  let p = await m.unsubscribeOneClick(u(token), db, SECRET, T + 7000);
  const afterPost = rows(SUB).at(-1);
  check(p.status === 200 && afterPost.opted_in === 0 && afterPost.source === 'list_unsubscribe', 'one-click POST returns 200 and appends list_unsubscribe opted_in=0');
  const n2 = rows(SUB).length;
  p = await m.unsubscribeOneClick(u(token), db, SECRET, T + 8000);
  check(p.status === 200 && rows(SUB).length === n2, 'POST is idempotent');
  p = await m.unsubscribeOneClick(u('garbage.token'), db, SECRET, T + 8000);
  check(p.status === 400 && rows(SUB).length === n2, 'POST with an invalid token: 400, no row');
  const never = await m.unsubscribeToken(SECRET, '123456789');
  const n3 = total();
  check((await m.unsubscribeLinkPage(u(never), db, SECRET)).status === 200 && total() === n3, 'unsubscribing an account with no rows writes nothing (and still says unsubscribed)');
  check((await m.getEmailConsent(db, verified)).body.optedIn === false, 'the link only ever unsubscribes (no re-subscribe by link)');

  // ---- Export: newest row per account, only yes -----------------------------
  const ins = sql.prepare("INSERT INTO email_consent_log (subject, email, opted_in, wording, lang, source, created_at) VALUES (?, ?, ?, 'optin-v1', 'en', 'settings', ?)");
  ins.run('300', 'yes-then-no@example.com', 1, 1); ins.run('300', 'yes-then-no@example.com', 0, 2);
  ins.run('301', 'no-then-yes@example.com', 0, 1); ins.run('301', 'no-then-yes@example.com', 1, 2);
  ins.run('302', 'only-yes@example.com', 1, 1);
  ins.run('303', 'only-no@example.com', 0, 1);
  const listed = sql.prepare(exportScript.LATEST_OPTED_IN_SQL).all();
  const emails = listed.map((x) => x.email).sort();
  check(emails.join() === 'no-then-yes@example.com,only-yes@example.com', 'export lists only accounts whose newest row is a yes');
  check(!emails.includes('person@example.com') && !emails.includes('other@example.com'), 'unsubscribed and Not-now accounts are not exported');
  const csv = exportScript.buildCsv(listed, SECRET, 'https://sync.example.test/');
  const lines = csv.trim().split('\n');
  check(lines[0] === 'email,unsubscribe_url,list_unsubscribe_header,list_unsubscribe_post_header' && lines.length === 3, 'CSV has the four spec columns and one line per address');
  const cols = lines.find((l) => l.startsWith('only-yes@')).split(',');
  const tok = await m.unsubscribeToken(SECRET, '302');
  check(cols[1] === `https://sync.example.test/v1/email/unsubscribe?t=${tok}` && cols[2] === `<${cols[1]}>` && cols[3] === 'List-Unsubscribe=One-Click', 'CSV carries the signed link and the RFC 8058 headers');
  check(await m.verifyUnsubscribeToken(SECRET, new URL(cols[1]).searchParams.get('t')) === '302', 'an exported link verifies in the worker');
  check(!csv.includes(SECRET), 'the secret never appears in the output');

  // Output-path guard.
  const shared = 'C:\\Projects\\DeepBlue\\shared';
  check(exportScript.forbiddenOutput(`${shared}\\notes\\optins.csv`) !== null && exportScript.forbiddenOutput('c:/projects/deepblue/SHARED/x.csv') !== null, 'refuses a path in the shared folder (any case or slash)');
  check(exportScript.forbiddenOutput(join(process.cwd(), 'optins.csv')) !== null && exportScript.forbiddenOutput(join(process.cwd(), 'workers', 'nope', 'x.csv')) !== null, 'refuses a path inside a git working tree');
  check(exportScript.forbiddenOutput(join(tmpdir(), 'hd-optin-test', 'optins.csv')) === null || exportScript.gitTreeOf(tmpdir()) !== null, 'allows a private path outside both');
  {
    const script = join(process.cwd(), 'workers/design-sync/scripts/export-optins.mjs');
    const env = { ...process.env }; delete env.UNSUBSCRIBE_SECRET;
    const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
    let res = run([]);
    check(res.status === 2 && /--out/.test(res.stderr) && res.stdout === '', 'redirected stdout without --out is refused, nothing printed');
    res = run(['--out', join(process.cwd(), 'optins.csv')]);
    check(res.status === 2 && /git working tree/.test(res.stderr) && res.stdout === '', '--out inside the worktree is refused');
    res = run(['--out', `${shared}\\optins.csv`]);
    check(res.status === 2 && /shared/i.test(res.stderr) && res.stdout === '', '--out in the shared folder is refused');
    if (exportScript.gitTreeOf(tmpdir()) === null) {
      res = run(['--out', join(tmpdir(), 'hd-optin-test.csv')]);
      check(res.status === 2 && /UNSUBSCRIBE_SECRET/.test(res.stderr) && res.stdout === '', 'a private path gets as far as the secret check (secret is read from the environment)');
    }
  }

  // ---- Account deletion -----------------------------------------------------
  check(rows(SUB).length > 0, 'rows exist before deletion');
  await m.eraseEmailConsent(db, SUB);
  check(rows(SUB).length === 0 && rows(OTHER).length === 1, 'account deletion removes that account\'s rows only');
  check((await m.getEmailConsent(db, verified)).body.optedIn === false, 'after deletion the account cannot be emailed');
  {
    const index = readFileSync('workers/design-sync/src/index.ts', 'utf8');
    const del = index.slice(index.indexOf("url.pathname === '/v1/account'"), index.indexOf("url.pathname.startsWith('/v1/community/')", index.indexOf("url.pathname === '/v1/account'")));
    check(del.includes('await eraseEmailConsent(env.COMMUNITY, identity.subject)'), 'DELETE /v1/account erases the consent log');
    const gate = index.indexOf('const identity = await authenticate(request, env);');
    const unsub = index.indexOf("url.pathname === '/v1/email/unsubscribe'");
    const consent = index.indexOf("url.pathname === '/v1/email-consent'");
    check(unsub > 0 && unsub < gate, 'unsubscribe routes are matched before the auth gate (no sign-in)');
    check(consent > gate, 'consent routes sit behind authenticate() and its rate limiter');
    check(/UNSUBSCRIBE_SECRET\?: string;/.test(index), 'UNSUBSCRIBE_SECRET is in the Env type');
  }
  console.log(`email-consent: ${checks} checks passed`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
