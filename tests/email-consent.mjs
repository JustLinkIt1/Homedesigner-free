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

  // ---- Unsubscribe: GET shows a confirm page and writes nothing; POST unsubscribes ----
  // EXEC cycle 297: mail scanners prefetch links, so the GET may never write.
  const u = (t) => new URL(`https://x/v1/email/unsubscribe?t=${encodeURIComponent(t)}`);
  const pageText = (body) => body.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const CONFIRM_BODY = 'confirm=1';
  const ONE_CLICK_BODY = 'List-Unsubscribe=One-Click';
  const DONE = {
    en: "You're unsubscribed. HomeDesigner won't send you product emails any more. You can turn them back on in Settings.",
    de: 'Du bist abgemeldet. HomeDesigner schickt dir keine Produkt-E-Mails mehr. In den Einstellungen kannst du sie wieder einschalten.',
    fr: "Vous êtes désabonné. HomeDesigner ne vous enverra plus d'e-mails sur l'app. Vous pouvez les réactiver dans les Réglages.",
    es: 'Te has dado de baja. HomeDesigner ya no te enviará correos de novedades. Puedes volver a activarlos en Ajustes.',
  };
  const ASK = {
    en: { text: "Unsubscribe from HomeDesigner emails? You'll stop getting product emails from HomeDesigner. Unsubscribe", button: 'Unsubscribe' },
    de: { text: 'Von HomeDesigner-E-Mails abmelden? Du bekommst dann keine Produkt-E-Mails von HomeDesigner mehr. Abmelden', button: 'Abmelden' },
    fr: { text: "Se désabonner des e-mails HomeDesigner ? Vous ne recevrez plus d'e-mails sur l'app HomeDesigner. Se désabonner", button: 'Se désabonner' },
    es: { text: '¿Darte de baja de los correos de HomeDesigner? Dejarás de recibir correos de novedades de HomeDesigner. Darme de baja', button: 'Darme de baja' },
  };
  // The confirm form: one POST form back to the same ?t= URL, a hidden confirm=1 and one button.
  const formOf = (body) => {
    const forms = body.match(/<form\b[^>]*>[\s\S]*?<\/form>/g) ?? [];
    if (forms.length !== 1) return null;
    const f = forms[0];
    return {
      method: (f.match(/\bmethod="([^"]*)"/) ?? [])[1],
      action: (f.match(/\baction="([^"]*)"/) ?? [])[1],
      hiddenConfirm: /<input type="hidden" name="confirm" value="1">/.test(f),
      buttons: (f.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []).map((b) => pageText(`<body>${b}</body>`)),
      inputs: (f.match(/<input\b/g) ?? []).length,
    };
  };
  const unescapeAttr = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const privateOk = (body, subject, email) => !body.includes(subject) && !body.includes(email);

  const beforeBad = total();
  let h = await m.unsubscribeLinkPage(u(`${subPart}.${flip(sigPart, 3)}`), db, SECRET);
  check(h.status === 400 && total() === beforeBad && /not valid/i.test(h.body) && formOf(h.body) === null, 'GET with a tampered token: 400 page, no form, no row');
  h = await m.unsubscribeLinkPage(u(token), db, undefined);
  check(h.status === 503 && total() === beforeBad && formOf(h.body) === null, 'GET with no secret configured: 503, no form, no row');
  const evil = `"><script>alert(1)</script>${token}`;
  h = await m.unsubscribeLinkPage(u(evil), db, SECRET);
  check(h.status === 400 && !h.body.includes('<script') && !h.body.includes(token) && total() === beforeBad, 'a token with markup in it is refused and never echoed');

  // SUB is opted in; its newest row with a language is the T+3000 'de' opt-in.
  const n0 = rows(SUB).length;
  h = await m.unsubscribeLinkPage(u(token), db, SECRET);
  const f = formOf(h.body);
  check(rows(SUB).length === n0 && total() === beforeBad, 'GET for an opted-in account writes NO row');
  check(h.status === 200 && h.contentType.startsWith('text/html') && /<html lang="de">/.test(h.body) && pageText(h.body) === ASK.de.text, 'GET shows the confirm page in de');
  check(f && f.method === 'post' && f.hiddenConfirm && f.inputs === 1 && f.buttons.length === 1 && f.buttons[0] === ASK.de.button, 'confirm page: one POST form, hidden confirm=1, one "Abmelden" button');
  check(f.action === `?t=${encodeURIComponent(token)}` && /^\?t=[A-Za-z0-9._~%-]+$/.test(f.action), 'form action is the relative ?t= URL with the token URL-encoded (no raw quotes or markup)');
  check(new URL(unescapeAttr(f.action), u(token)).href === u(token).href, 'form action resolves back to the same unsubscribe URL (path and token)');
  check(!/<style|<script|style=|<link/i.test(h.body), 'confirm page is plain HTML: no styles, no scripts');
  check(privateOk(h.body, SUB, 'person@example.com'), 'confirm page shows neither the account id nor the email');
  check(!pageText(h.body).includes(DONE.de.split('.')[0]), 'confirm page does not claim the account is unsubscribed');
  for (let i = 0; i < 3; i++) await m.unsubscribeLinkPage(u(token), db, SECRET);
  check(rows(SUB).length === n0 && (await m.getEmailConsent(db, verified)).body.optedIn === true, 'repeated GETs (scanner prefetch) still write nothing; account stays opted in');

  // The button: POST confirm=1.
  let p = await m.unsubscribeOneClick(u(token), db, SECRET, T + 4000, CONFIRM_BODY);
  const afterConfirm = rows(SUB).at(-1);
  check(rows(SUB).length === n0 + 1, 'POST confirm=1 appends exactly one row');
  check(afterConfirm.opted_in === 0 && afterConfirm.source === 'unsubscribe_link' && afterConfirm.email === 'person@example.com' && afterConfirm.created_at === T + 4000,
    'POST confirm=1 row: opted_in=0, source unsubscribe_link');
  check(afterConfirm.lang === 'de', 'the unsubscribe row carries the newest real language (de), not und');
  check(p.status === 200 && p.contentType.startsWith('text/html') && /<html lang="de">/.test(p.body) && pageText(p.body) === DONE.de && formOf(p.body) === null,
    'POST confirm=1 returns the K4 "unsubscribed" HTML page in de, without a form');
  check(!/<style|<script|style=|<link/i.test(p.body) && privateOk(p.body, SUB, 'person@example.com'), 'unsubscribed page: plain HTML, no account id or email');
  const n1 = rows(SUB).length;
  p = await m.unsubscribeOneClick(u(token), db, SECRET, T + 5000, CONFIRM_BODY);
  check(p.status === 200 && rows(SUB).length === n1 && pageText(p.body) === DONE.de, 'repeated POST confirm=1 is idempotent: no row, same page');
  h = await m.unsubscribeLinkPage(u(token), db, SECRET);
  check(h.status === 200 && rows(SUB).length === n1 && pageText(h.body) === DONE.de && /<html lang="de">/.test(h.body) && formOf(h.body) === null,
    'GET when already unsubscribed: K4 "unsubscribed" page, no form, no row');

  // RFC 8058 one-click from the mail client.
  await post(verified, { ...yes, source: 'settings' }, T + 6000); // opted back in, in Settings (lang en)
  h = await m.unsubscribeLinkPage(u(token), db, SECRET);
  check(/<html lang="en">/.test(h.body) && pageText(h.body) === ASK.en.text && formOf(h.body)?.buttons[0] === 'Unsubscribe'
    && h.body.includes('You&#39;ll') && !/You'll/.test(h.body), 'en confirm page: draft text, apostrophe HTML-escaped');
  const n2 = rows(SUB).length;
  p = await m.unsubscribeOneClick(u(token), db, SECRET, T + 7000, ONE_CLICK_BODY);
  const afterPost = rows(SUB).at(-1);
  check(rows(SUB).length === n2 + 1 && afterPost.opted_in === 0 && afterPost.source === 'list_unsubscribe', 'one-click POST appends one list_unsubscribe opted_in=0 row');
  check(p.status === 200 && p.contentType.startsWith('text/plain') && p.body === 'Unsubscribed', 'one-click POST returns plain-text 200');
  check(afterPost.lang === 'en', 'the one-click row carries the newest real language (en)');
  h = await m.unsubscribeLinkPage(u(token), db, SECRET);
  check(pageText(h.body) === DONE.en && h.body.includes('You&#39;re') && !/You're/.test(h.body), 'en unsubscribed page: K4 text, apostrophes HTML-escaped');
  const n3 = rows(SUB).length;
  p = await m.unsubscribeOneClick(u(token), db, SECRET, T + 8000, ONE_CLICK_BODY);
  check(p.status === 200 && p.body === 'Unsubscribed' && rows(SUB).length === n3, 'repeated one-click POST is idempotent');
  await post(verified, { ...yes, source: 'settings' }, T + 8500);
  p = await m.unsubscribeOneClick(u(token), db, SECRET, T + 9000);
  check(p.status === 200 && p.contentType.startsWith('text/plain') && rows(SUB).at(-1).source === 'list_unsubscribe' && rows(SUB).at(-1).opted_in === 0,
    'a POST with an empty body still unsubscribes as one-click (the token is the authorisation)');
  await post(verified, { ...yes, source: 'settings' }, T + 9500);
  p = await m.unsubscribeOneClick(u(token), db, SECRET, T + 9600, 'confirm=0');
  check(p.contentType.startsWith('text/plain') && rows(SUB).at(-1).source === 'list_unsubscribe', 'confirm other than 1 is treated as one-click');

  // Bad token / no secret on both POST kinds.
  const n4 = total();
  p = await m.unsubscribeOneClick(u('garbage.token'), db, SECRET, T + 10000, ONE_CLICK_BODY);
  check(p.status === 400 && p.contentType.startsWith('text/plain') && total() === n4, 'one-click POST with an invalid token: plain 400, no row');
  p = await m.unsubscribeOneClick(u(`${subPart}.${flip(sigPart, 3)}`), db, SECRET, T + 10000, CONFIRM_BODY);
  check(p.status === 400 && p.contentType.startsWith('text/html') && /not valid/i.test(p.body) && total() === n4, 'confirm POST with a tampered token: 400 HTML page, no row');
  p = await m.unsubscribeOneClick(u(evil), db, SECRET, T + 10000, CONFIRM_BODY);
  check(p.status === 400 && !p.body.includes('<script') && !p.body.includes(token) && total() === n4, 'confirm POST with markup in the token: refused, never echoed');
  p = await m.unsubscribeOneClick(u(token), db, undefined, T + 10000, CONFIRM_BODY);
  check(p.status === 503 && p.contentType.startsWith('text/html') && total() === n4, 'confirm POST with no secret: 503 page, no row');
  p = await m.unsubscribeOneClick(u(token), db, undefined, T + 10000, ONE_CLICK_BODY);
  check(p.status === 503 && p.contentType.startsWith('text/plain') && total() === n4, 'one-click POST with no secret: plain 503, no row');

  // Never subscribed: GET and POST write nothing, and nothing ever subscribes.
  const never = await m.unsubscribeToken(SECRET, '123456789');
  h = await m.unsubscribeLinkPage(u(never), db, SECRET);
  check(h.status === 200 && total() === n4 && pageText(h.body) === DONE.en && formOf(h.body) === null && /<html lang="en">/.test(h.body),
    'GET for an account with no rows: English "unsubscribed" page, no form, no row');
  p = await m.unsubscribeOneClick(u(never), db, SECRET, T + 11000, CONFIRM_BODY);
  check(p.status === 200 && total() === n4 && pageText(p.body) === DONE.en, 'confirm POST for an account with no rows writes nothing');
  p = await m.unsubscribeOneClick(u(never), db, SECRET, T + 11000, ONE_CLICK_BODY);
  check(p.status === 200 && total() === n4, 'one-click POST for an account with no rows writes nothing');
  check(sql.prepare("SELECT COUNT(*) AS n FROM email_consent_log WHERE source IN ('unsubscribe_link', 'list_unsubscribe') AND opted_in = 1").get().n === 0,
    'no unsubscribe path ever wrote an opted_in=1 row');

  // ---- Unsubscribe page language per account --------------------------------
  {
    const langIns = sql.prepare("INSERT INTO email_consent_log (subject, email, opted_in, wording, lang, source, created_at) VALUES (?, ?, ?, 'optin-v1', ?, ?, ?)");
    const cases = [
      // [subject, rows [opted_in, lang, source], expected page lang, expected unsubscribe-row lang]
      ['200', [[1, 'fr', 'signin']], 'fr', 'fr'],
      ['201', [[1, 'es-MX', 'settings']], 'es', 'es-MX'],
      ['202', [[1, 'DE-at', 'signin']], 'de', 'DE-at'],
      ['203', [[1, 'it', 'signin']], 'en', 'it'],
      // An old 'und' unsubscribe row is skipped: the language comes from the row before it.
      ['204', [[1, 'fr', 'signin'], [0, 'und', 'unsubscribe_link'], [1, 'und', 'settings']], 'fr', 'fr'],
      // Only 'und' rows: English page, and the row stays 'und'.
      ['205', [[1, 'und', 'signin']], 'en', 'und'],
    ];
    for (const [subject, seed, pageLang, rowLang] of cases) {
      seed.forEach(([opted, lang, source], i) => langIns.run(subject, `${subject}@example.com`, opted, lang, source, i + 1));
      const before = rows(subject).length;
      const tok = await m.unsubscribeToken(SECRET, subject);
      const ask = await m.unsubscribeLinkPage(u(tok), db, SECRET);
      const af = formOf(ask.body);
      check(ask.status === 200 && new RegExp(`<html lang="${pageLang}">`).test(ask.body) && pageText(ask.body) === ASK[pageLang].text
        && af && af.method === 'post' && af.hiddenConfirm && af.buttons.length === 1 && af.buttons[0] === ASK[pageLang].button && af.action === `?t=${encodeURIComponent(tok)}`,
        `account ${subject} (${seed.at(-1)[1]}): GET confirm page in ${pageLang} with its button`);
      check(rows(subject).length === before, `account ${subject}: GET writes no row`);
      const done = await m.unsubscribeOneClick(u(tok), db, SECRET, T + 12000, CONFIRM_BODY);
      const last = rows(subject).at(-1);
      check(done.status === 200 && new RegExp(`<html lang="${pageLang}">`).test(done.body) && pageText(done.body) === DONE[pageLang],
        `account ${subject}: POST confirm=1 page in ${pageLang} with the K4 text`);
      check(rows(subject).length === before + 1 && last.opted_in === 0 && last.source === 'unsubscribe_link' && last.lang === rowLang, `account ${subject}: unsubscribe row stores lang ${rowLang}`);
      check(privateOk(ask.body, subject, `${subject}@example.com`) && privateOk(done.body, subject, `${subject}@example.com`), `account ${subject}: pages show no account id or email`);
    }
    check(m.unsubscribePageLang('fr-CA') === 'fr' && m.unsubscribePageLang('pt-BR') === 'en' && m.unsubscribePageLang('und') === 'en' && m.unsubscribePageLang(null) === 'en'
      && m.unsubscribePageLang('constructor') === 'en', 'page language: primary subtag, en/de/fr/es only, everything else English');
    const bad = await m.unsubscribeLinkPage(u('garbage.token'), db, SECRET);
    check(bad.status === 400 && /<html lang="en">/.test(bad.body) && /not valid/i.test(bad.body), 'bad token page stays English');
  }

  // ---- Worker wiring and headers --------------------------------------------
  {
    const index = readFileSync('workers/design-sync/src/index.ts', 'utf8');
    const route = index.slice(index.indexOf("url.pathname === '/v1/email/unsubscribe'"), index.indexOf('return new Response(result.body'));
    check(/request\.method === 'GET'\s*\?\s*await unsubscribeLinkPage\(url, env\.COMMUNITY, env\.UNSUBSCRIBE_SECRET\)/.test(route), 'GET calls the write-free confirm page');
    check(/boundedBody\(request, 1024\)\.catch\(\(\) => new ArrayBuffer\(0\)\)/.test(route), 'POST body is bounded (1 KB); a missing or oversized body reads as one-click, not a 503');
    const csp = m.UNSUBSCRIBE_HEADERS['Content-Security-Policy'];
    check(/default-src 'none'/.test(csp) && !/form-action 'none'/.test(csp), "CSP keeps default-src 'none' and does not block the form POST (form-action has no default-src fallback)");
    check(m.UNSUBSCRIBE_HEADERS['Cache-Control'] === 'no-store' && m.UNSUBSCRIBE_HEADERS['Referrer-Policy'] === 'no-referrer', 'unsubscribe responses are no-store, no-referrer');
  }

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
