// Product-email sender (E6): MIME, consent re-check, cap, stop-on-error,
// refusals and the monthly guard, against the real migration 0012 in SQLite
// with the Gmail API stubbed. Nothing leaves the machine.
//
//   node tests/email-sender.mjs
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const workerTmp = mkdtempSync(join(process.cwd(), 'workers/design-sync/.email-sender-'));
const tmp = mkdtempSync(join(tmpdir(), 'hd-email-sender-'));
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  const src = readFileSync('workers/design-sync/src/email-consent.ts', 'utf8');
  writeFileSync(join(workerTmp, 'email-consent.mjs'), ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const worker = await import(pathToFileURL(join(workerTmp, 'email-consent.mjs')).href);
  const s = await import(pathToFileURL(join(process.cwd(), 'workers/design-sync/scripts/send-product-email.mjs')).href);

  const SECRET = 'test-secret-0123456789abcdef0123456789abcdef';
  const BASE = 'https://homedesigner-sync.nathanjoppich.workers.dev';
  const WORDING = 'optin-v1-2026-11-28';
  const T = Date.UTC(2026, 10, 28, 16);
  const DEC = Date.UTC(2026, 11, 3, 9);

  // ---- Database: the real migration ---------------------------------------
  const fresh = () => {
    const sql = new DatabaseSync(':memory:');
    sql.exec(readFileSync('workers/design-sync/migrations/0012_email_consent.sql', 'utf8'));
    const add = (subject, email, optedIn, lang = 'en', wording = WORDING, source = 'signin') => sql.prepare(
      'INSERT INTO email_consent_log (subject, email, opted_in, wording, lang, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(subject, email, optedIn, wording, lang, source, T);
    let latestCalls = 0;
    const db = {
      recipients: async () => sql.prepare(s.RECIPIENTS_SQL).all(),
      latest: async (subject) => { latestCalls++; return sql.prepare(s.latestSql(subject)).get() ?? null; },
      hook: null,
    };
    // The hook runs inside latest() so a test can flip consent between build and send.
    const origLatest = db.latest;
    db.latest = async (subject) => { if (db.hook) db.hook(subject); return origLatest(subject); };
    return { sql, add, db, calls: () => latestCalls };
  };
  const addr = (i) => `person${i}@example${i}.test`;

  // ---- Email files ---------------------------------------------------------
  const GOOD = `# notes for the sender, ignored
--- lang: en
Subject: What's new in HomeDesigner
Preview: Flat roofs and point packs from $1.99.

Hi,

**New in HomeDesigner**
- F1 Flat roofs: parapets sit cleanly.
- F2 Stairs fixed.

Open HomeDesigner: https://homedesignerapp.com/?utm_source=email

---
Unsubscribe with one click: {{unsubscribe_url}}
Nathan Example, Street 1, 12345 Town
--- lang: de
Subject: Neu in HomeDesigner – und was du mit KI-Punkten machen kannst
Preview: Flachdächer mit Attika.

Hallo,

- Treppen ragen nicht mehr durch das Dach.

---
Mit einem Klick abmelden: {{unsubscribe_url}}
Impressum: Nathan Example, Straße 1, 12345 Stadt
`;
  const file = (name, text) => { const p = join(tmp, name); writeFileSync(p, text); return p; };
  const goodFile = file('good.md', GOOD);
  const tokenFile = file('token.json', JSON.stringify({ access_token: 'ya29.test-access-token-not-real-0123456789' }));
  let stateN = 0;
  const newState = () => join(tmp, `state-${++stateN}.json`);

  const harness = (db, { state = newState(), now = T, fetchImpl, env = {} } = {}) => {
    const out = [];
    const err = [];
    const sends = [];
    const fetch = fetchImpl ?? (async (url, init) => { sends.push({ url, init }); return { status: 200 }; });
    const exec = (argv) => s.run(argv, {
      env: { UNSUBSCRIBE_SECRET: SECRET, GMAIL_TOKEN_FILE: tokenFile, HD_EMAIL_STATE_FILE: state, ...env },
      db, fetch: async (u, i) => { const r = await fetch(u, i); return r; }, now: () => now,
      out: (l) => out.push(l), err: (l) => err.push(l),
    });
    return { exec, out, err, sends, state };
  };
  const dry = (h) => h.exec(['--email', goodFile, '--base', BASE]);
  const send = (h, n, extra = []) => h.exec(['--email', goodFile, '--base', BASE, '--send', '--confirm-batch', String(n), ...extra]);
  const noAddress = (lines, label) => {
    const text = lines.join('\n');
    check(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text), `${label}: no email address in the output`);
    check(!text.includes(SECRET) && !text.includes('ya29.'), `${label}: no secret or token in the output`);
  };

  // ---- Parsing and refusals -----------------------------------------------
  const parsed = s.parseEmailFile(GOOD);
  check(Object.keys(parsed).join(',') === 'en,de' && parsed.de.subject.startsWith('Neu in'), 'email file: en + de sections parsed');
  check(s.pickLanguage(parsed, 'de-AT') === 'de' && s.pickLanguage(parsed, 'DE') === 'de' && s.pickLanguage(parsed, 'fr') === 'en' && s.pickLanguage(parsed, '') === 'en', 'language = primary subtag, fallback en');
  {
    const { db } = fresh();
    for (const [name, text, why] of [
      ['no-placeholder.md', GOOD.replace('Mit einem Klick abmelden: {{unsubscribe_url}}', 'Abmelden in den Einstellungen'), /lacks \{\{unsubscribe_url\}\}/],
      ['imprint.md', GOOD.replace('Nathan Example, Street 1, 12345 Town', '[IMPRINT]'), /IMPRINT/],
      ['impressum.md', GOOD.replace('Impressum: Nathan Example, Straße 1, 12345 Stadt', '[IMPRESSUM]'), /IMPRINT/],
      ['no-en.md', GOOD.replace('--- lang: en', '--- lang: fr'), /no "--- lang: en"/],
      ['other-placeholder.md', GOOD.replace('Hi,', 'Hi {{first_name}},'), /unknown placeholder/],
    ]) {
      const h = harness(db);
      const code = await h.exec(['--email', file(name, text), '--base', BASE]);
      check(code === 2 && why.test(h.err.join('\n')) && h.out.length === 0, `refused: ${name}`);
      const hs = harness(db);
      check(await hs.exec(['--email', join(tmp, name), '--base', BASE, '--send', '--confirm-batch', '0']) === 2 && hs.sends.length === 0, `refused in --send too: ${name}`);
    }
    const h = harness(db, { env: { UNSUBSCRIBE_SECRET: '' } });
    check(await dry(h) === 2 && /UNSUBSCRIBE_SECRET/.test(h.err.join('')), 'refused without UNSUBSCRIBE_SECRET');
    const hb = harness(db);
    check(await hb.exec(['--email', goodFile, '--base', 'http://insecure.test']) === 2, 'refused with a non-https base');
    const hu = harness(db);
    check(await hu.exec(['--help']) === 0 && hu.out.join('').includes('--confirm-batch'), '--help prints the usage');
  }

  // ---- Dry run: MIME -------------------------------------------------------
  {
    const { add, db } = fresh();
    add('100000000000000000001', addr(1), 1, 'en');
    add('100000000000000000002', addr(2), 1, 'de-DE');
    add('100000000000000000003', addr(3), 1, 'fr');
    add('100000000000000000004', addr(4), 1, 'de');
    add('100000000000000000004', addr(4), 0, 'de', WORDING, 'unsubscribe_link'); // newest says no
    add('100000000000000000005', addr(5), 0, 'en');
    add('100000000000000000005', addr(5), 1, 'en', WORDING, 'settings'); // newest says yes
    add('100000000000000000006', addr(6), 1, 'en', 'optin-v0-unknown'); // unknown wording
    const h = harness(db);
    const code = await dry(h);
    check(code === 0, 'dry run exits 0');
    const text = h.out.join('\n');
    check(/recipients opted in: 4 \(de 1, en 3\); skipped for unknown consent wording: 1/.test(text), 'dry run: counts per language from the newest rows (fr falls back to en)');
    check(/would send this run: 4 \(cap 50\) -> --send --confirm-batch 4/.test(text), 'dry run: the count this run would send');
    check(/messages built and validated: 4 ok, 0 failed/.test(text), 'dry run: every message built and validated');
    check(text.includes('List-Unsubscribe-Post: List-Unsubscribe=One-Click') && /List-Unsubscribe: <https:\/\/homedesigner-sync\.nathanjoppich\.workers\.dev\/v1\/email\/unsubscribe\?t=\[token\]>/.test(text), 'dry run: sample shows both List-Unsubscribe headers (token hidden)');
    check(text.includes('From: HomeDesigner <[redacted]>') && text.includes('To: <[redacted]>'), 'dry run: sample addresses redacted');
    noAddress(h.out.concat(h.err), 'dry run');
    check(!existsSync(h.state), 'dry run writes no state file');

    // Build one message directly and take it apart.
    const sub = '100000000000000000002';
    const url = s.unsubscribeUrl(BASE, SECRET, sub);
    const raw = s.buildMessage({ to: addr(2), version: parsed.de, url, now: T });
    check(s.validateMessage(raw, { secret: SECRET, subject: sub, to: addr(2), version: parsed.de }).length === 0, 'built message passes its own validation');
    const hdr = s.parseHeaders(raw);
    check(hdr.get('from')[0] === 'HomeDesigner <nathan@homedesignerapp.com>', 'From is "HomeDesigner <nathan@homedesignerapp.com>"');
    check(hdr.get('list-unsubscribe')[0] === `<${url}>` && hdr.get('list-unsubscribe-post')[0] === 'List-Unsubscribe=One-Click', 'both List-Unsubscribe headers, with this recipient\'s URL');
    const token = new URL(url).searchParams.get('t');
    check(await worker.verifyUnsubscribeToken(SECRET, token) === sub, 'the URL token verifies with the WORKER\'s own verifier');
    check(s.verifyToken(SECRET, token) === sub && s.verifyToken('another-secret-0123456789abcdef0123456789', token) === null, 'script verifier agrees and refuses another secret');
    check(/^=\?UTF-8\?B\?/.test(hdr.get('subject')[0]) && s.decodeHeaderWords(hdr.get('subject')[0]) === parsed.de.subject, 'UTF-8 subject is RFC 2047 encoded and decodes back');
    check(raw.split('\r\n').every((l) => l.length <= 998) && raw.slice(0, raw.indexOf('\r\n\r\n')).split('\r\n').every((l) => l.length <= 78 || l.startsWith('List-Unsubscribe:') || l.startsWith('Content-Type:')), 'header lines folded (encoded words <= 75 chars)');
    check(/^Date: (Sat), 28 Nov 2026 16:00:00 \+0000$/m.test(raw) && /^Message-ID: <[0-9a-f]{24}\.\d+@homedesignerapp\.com>$/m.test(raw) && /^MIME-Version: 1\.0$/m.test(raw), 'Date, Message-ID and MIME-Version present');
    check(/^Content-Type: multipart\/alternative; boundary="/m.test(raw) && raw.indexOf('Content-Type: text/plain; charset=UTF-8') < raw.indexOf('Content-Type: text/html; charset=UTF-8'), 'multipart/alternative with text/plain then text/html');
    check(!raw.includes('\n') || raw.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')), 'every line ends in CRLF');
    const boundary = hdr.get('content-type')[0].match(/boundary="([^"]+)"/)[1];
    const parts = raw.split(`--${boundary}`).slice(1, 3).map((p) => Buffer.from(p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\s+/g, ''), 'base64').toString('utf8'));
    check(parts[0].includes(url) && parts[1].includes(`<a href="${url}">`) && !parts.join('').includes('{{'), 'both parts carry the unsubscribe URL; no placeholder left');
    check(parts[1].includes('<li>Treppen ragen nicht mehr durch das Dach.</li>') && parts[1].includes('Flachdächer mit Attika.') && parts[0].includes('Hallo,'), 'German body in both parts, list and preheader in HTML');
    const en = s.buildMessage({ to: addr(1), version: parsed.en, url: s.unsubscribeUrl(BASE, SECRET, '100000000000000000001'), now: T });
    const enHtml = Buffer.from(en.split(/--=_hd_[0-9a-f]+/)[2].split('\r\n\r\n')[1].replace(/\s+/g, ''), 'base64').toString('utf8');
    check(enHtml.includes('<strong>New in HomeDesigner</strong>') && enHtml.includes('<hr>') && enHtml.includes('$1.99'), 'English HTML: bold, rule, text kept');
    // Header injection: an address with CR/LF is refused.
    let threw = false;
    try { s.buildMessage({ to: 'a@b.test\r\nBcc: x@y.test', version: parsed.en, url, now: T }); } catch { threw = true; }
    check(threw, 'an address with CRLF is refused (no header injection)');
    // A tampered message fails validation.
    // Flip the first signature character in the header (List-Unsubscribe is the only header with ?t=).
    const tampered = raw.replace(/(\?t=[A-Za-z0-9_-]+\.)(.)/, (m, a, c) => a + (c === 'A' ? 'B' : 'A'));
    check(s.validateMessage(tampered, { secret: SECRET, subject: sub, to: addr(2), version: parsed.de }).some((p) => /token/.test(p)), 'validation catches an unsubscribe URL that does not verify');
    const noPost = raw.replace('List-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n', '');
    check(s.validateMessage(noPost, { secret: SECRET, subject: sub, to: addr(2), version: parsed.de }).some((p) => /list-unsubscribe-post/.test(p)), 'validation catches a missing List-Unsubscribe-Post');
  }

  // ---- Send: confirm-batch, consent re-check, payload ----------------------
  {
    const { add, db, calls } = fresh();
    add('100000000000000000001', addr(1), 1, 'en');
    add('100000000000000000002', addr(2), 1, 'de');
    add('100000000000000000003', addr(3), 1, 'en');
    const h = harness(db);
    check(await send(h, 2) === 2 && /--confirm-batch must equal .*\(3\)/.test(h.err.join('')) && h.sends.length === 0 && !existsSync(h.state), 'refused with a wrong --confirm-batch (nothing sent, nothing written)');
    check(await h.exec(['--email', goodFile, '--base', BASE, '--send']) === 2 && h.sends.length === 0, 'refused without --confirm-batch');
    const ht = harness(db, { state: h.state, env: { GMAIL_TOKEN_FILE: '' } });
    check(await send(ht, 3) === 2 && /GMAIL_TOKEN_FILE/.test(ht.err.join('')) && ht.sends.length === 0, 'refused without GMAIL_TOKEN_FILE');

    // Consent for #2 flips to 0 after the list was read, before its message.
    db.hook = (subject) => { if (subject === '100000000000000000002') { add('100000000000000000002', addr(2), 0, 'de', WORDING, 'list_unsubscribe'); db.hook = null; } };
    const before = calls();
    const code = await send(h, 3);
    check(code === 0, 'send exits 0');
    check(calls() - before === 3, 'consent re-read once per recipient, right before each message');
    check(h.sends.length === 2, 'the recipient who opted out between build and send is skipped');
    check(h.out.some((l) => /sent 2, skipped \(no longer opted in\) 1/.test(l)), 'summary counts sent and skipped');
    const req = h.sends[0];
    check(req.url === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' && req.init.method === 'POST', 'POST users.messages.send');
    check(req.init.headers.Authorization === 'Bearer ya29.test-access-token-not-real-0123456789', 'access token read from GMAIL_TOKEN_FILE');
    const sentRaw = Buffer.from(JSON.parse(req.init.body).raw, 'base64url').toString('utf8');
    check(!/[+/=]/.test(JSON.parse(req.init.body).raw) && /^To: <person1@example1\.test>$/m.test(sentRaw), 'raw is base64url MIME for the right person');
    check(/^List-Unsubscribe-Post: List-Unsubscribe=One-Click$/m.test(sentRaw) && sentRaw.includes(`List-Unsubscribe: <${s.unsubscribeUrl(BASE, SECRET, '100000000000000000001')}>`), 'sent message carries its own List-Unsubscribe headers');
    check(!h.sends.some((x) => Buffer.from(JSON.parse(x.init.body).raw, 'base64url').toString().includes(addr(2))), 'nothing went to the opted-out address');
    noAddress(h.out.concat(h.err), 'send');
    const st = JSON.parse(readFileSync(h.state, 'utf8'));
    check(st.sends.length === 1 && st.sends[0].sent === 2 && st.sends[0].skipped === 1 && st.sends[0].done === true && st.sends[0].month === '2026-11', 'state: one entry with counts, done');
    check(!/@/.test(readFileSync(h.state, 'utf8')) && Object.keys(st.sends[0]).sort().join(',') === 'campaign,cursor,done,firstDate,lastDate,month,sent,skipped', 'state file holds only dates, counts, a cursor and the email hash');

    // ---- Monthly guard ----
    const again = harness(db, { state: h.state });
    check(await send(again, 0) === 2 && /already sent to everyone/.test(again.err.join('')) && again.sends.length === 0, 'the same email cannot go to everyone twice');
    const other = file('other.md', GOOD.replace("What's new", 'Second news'));
    const h2 = harness(db, { state: h.state });
    check(await h2.exec(['--email', other, '--base', BASE, '--send', '--confirm-batch', '2']) === 2 && /different product email was already sent this month/.test(h2.err.join('')) && h2.sends.length === 0, 'monthly guard: a second email this month is refused');
    const h2d = harness(db, { state: h.state });
    check(await h2d.exec(['--email', other, '--base', BASE]) === 0 && h2d.out.some((l) => /monthly guard: would refuse/.test(l)), 'dry run reports what the guard would say');
    const h3 = harness(db, { state: h.state });
    check(await h3.exec(['--email', other, '--base', BASE, '--send', '--confirm-batch', '2', '--allow-second-this-month']) === 0 && h3.sends.length === 2, '--allow-second-this-month lets it through');
    check(h3.err.some((l) => /WARNING: .*EXEC's approval/.test(l)), '--allow-second-this-month prints the EXEC warning');
    const h4 = harness(db, { state: h.state, now: DEC });
    check(await h4.exec(['--email', other, '--base', BASE, '--send', '--confirm-batch', '2']) === 0 && h4.sends.length === 2, 'next calendar month: allowed again');
    const hIn = harness(db, { state: join(process.cwd(), 'workers/design-sync/.state.json') });
    check(await send(hIn, 2) === 2 && /outside the shared folder and any git working tree/.test(hIn.err.join('')), 'refused: state file inside the repo');
  }

  // ---- Cap 50 and resume ---------------------------------------------------
  {
    const { add, db } = fresh();
    for (let i = 1; i <= 120; i++) add(`2000000000000000${String(i).padStart(5, '0')}`, addr(i), 1, i % 3 ? 'en' : 'de');
    const h = harness(db);
    await dry(h);
    check(h.out.some((l) => /recipients opted in: 120 \(de 40, en 80\)/.test(l)) && h.out.some((l) => /would send this run: 50 \(cap 50\)/.test(l)), 'dry run: 120 opted in, 50 this run');
    noAddress(h.out, 'dry run 120');
    check(await send(h, 120) === 2 && h.sends.length === 0, '--confirm-batch 120 refused (cap is 50)');
    check(await send(h, 50) === 0 && h.sends.length === 50, 'first run sends exactly 50');
    const second = harness(db, { state: h.state });
    await dry(second);
    check(second.out.some((l) => /already done for this email this month: 50 sent; still to send: 70/.test(l)), 'dry run after run 1 resumes: 70 left');
    check(await send(second, 50) === 0 && second.sends.length === 50, 'second run sends the next 50 (same email, same month)');
    const firstTo = (x) => Buffer.from(JSON.parse(x.init.body).raw, 'base64url').toString().match(/^To: <([^>]+)>$/m)[1];
    check(firstTo(second.sends[0]) === addr(51) && new Set([...h.sends, ...second.sends].map(firstTo)).size === 100, 'no one gets it twice across runs');
    const third = harness(db, { state: h.state });
    check(await send(third, 20) === 0 && third.sends.length === 20, 'third run sends the last 20');
    check(JSON.parse(readFileSync(h.state, 'utf8')).sends[0].done === true, 'campaign marked done');
  }

  // ---- Stop on the first error ---------------------------------------------
  {
    const { add, db } = fresh();
    for (let i = 1; i <= 5; i++) add(`30000000000000000000${i}`, addr(i), 1, 'en');
    let n = 0;
    const tries = [];
    const h = harness(db, { fetchImpl: async (url, init) => { tries.push(init); n++; return { status: n === 3 ? 403 : 200 }; } });
    const code = await send(h, 5);
    check(code === 1 && tries.length === 3, 'stops at the first non-2xx (no 4th attempt)');
    check(h.err.join('\n') === 'send-product-email: stopped: sent 2, HTTP status 403', 'prints only the count sent and the HTTP status');
    noAddress(h.out.concat(h.err), 'stop on error');
    const st = JSON.parse(readFileSync(h.state, 'utf8')).sends[0];
    check(st.sent === 2 && st.done === false, 'state keeps the 2 sent, not done');
    const retry = harness(db, { state: h.state });
    await dry(retry);
    check(retry.out.some((l) => /still to send: 3/.test(l)), 'after the error the failed one and the rest are still to send');
    check(await send(retry, 3) === 0 && retry.sends.length === 3, 'a later run finishes the rest');
    const hn = harness(db, { fetchImpl: async () => { throw new Error('ECONNRESET to person1@example1.test'); } });
    check(await send(hn, 5) === 1 && hn.err.join('') === 'send-product-email: stopped: sent 0, HTTP status network error', 'a network error also stops, without echoing the error text');
  }

  console.log(`email-sender: ${checks} checks passed`);
} finally {
  rmSync(workerTmp, { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
}
