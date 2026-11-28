#!/usr/bin/env node
// Send one product email to the people who said yes, one message each, through
// the Gmail API (EXEC cycle 287; spec hd-email-optin-spec-2026-11-28).
//
//   UNSUBSCRIBE_SECRET=... node workers/design-sync/scripts/send-product-email.mjs --email <file>
//   UNSUBSCRIBE_SECRET=... GMAIL_TOKEN_FILE=<path> node workers/design-sync/scripts/send-product-email.mjs --email <file> --send --confirm-batch <n>
//
// - Default is a DRY RUN: reads the opted-in list from D1 (read-only SELECT),
//   builds and validates every MIME message in memory, prints counts and one
//   header sample with addresses redacted. It writes nothing and sends nothing.
// - --send sends at most 50 messages per run, re-reading each person's newest
//   consent row right before their message (skip unless it still says yes), and
//   stops at the first non-2xx answer. --confirm-batch must equal the number it
//   intends to send.
// - Monthly guard: a local state file outside the repo (dates, counts and a
//   numeric resume cursor only, never an address) refuses a different email in
//   a month that already had one, unless --allow-second-this-month (EXEC must
//   approve). The same email file may continue in later runs (cap 50 per run).
// - Output is counts only. No address, token or secret is ever printed.
import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { forbiddenOutput, unsubscribeToken } from './export-optins.mjs';

export const FROM = 'HomeDesigner <nathan@homedesignerapp.com>';
export const MESSAGE_ID_DOMAIN = 'homedesignerapp.com';
export const CAP = 50;
export const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
/** Consent wording versions the app has shown. A row with any other id is never mailed. */
export const KNOWN_WORDINGS = new Set(['optin-v1-2026-11-28']);
const SUBJECT_RE = /^[A-Za-z0-9_-]{1,255}$/;
const ADDRESS_RE = /^[^\s<>"@,;:\\()[\]]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;
const PLACEHOLDER = '{{unsubscribe_url}}';
const FORBIDDEN_MARKERS = /\[(?:IMPRINT|IMPRESSUM)\]/;

export const USAGE = `usage: node workers/design-sync/scripts/send-product-email.mjs --email <file> [options]

  --email <file>              the email: one "--- lang: xx" section per language,
                              each "Subject: ..." [+ "Preview: ..."], a blank line,
                              then the body (paragraphs, "- " lists, **bold**,
                              a "---" line for a rule). Must contain ${PLACEHOLDER}
                              in every body and no [IMPRINT]/[IMPRESSUM]. "en" required.
  (default)                   DRY RUN: build and validate every message, print counts.
  --send                      really send (max ${CAP} per run, stops at the first error)
  --confirm-batch <n>         required with --send: must equal the number it will send
  --allow-second-this-month   let a different email go out in a month that already
                              had one (EXEC must approve)
  --local                     read the local wrangler D1 instead of production
  --base <url>                worker base URL (default VITE_CLOUD_SYNC_URL in .env.production)

environment:
  UNSUBSCRIBE_SECRET   signing secret for the unsubscribe links (same as the worker)
  GMAIL_TOKEN_FILE     --send only: file holding an OAuth access token with scope
                       https://www.googleapis.com/auth/gmail.send for nathan@homedesignerapp.com
                       (raw token or JSON {"access_token": ...})
  HD_EMAIL_STATE_FILE  monthly guard state (default %USERPROFILE%\\.secrets\\hd-email-sends.json)
`;

// ---------------------------------------------------------------------------
// Email file

/** Parse the email file into { en: { subject, preview, body }, de: ... }. Throws on refusal. */
export function parseEmailFile(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sections = {};
  let current = null;
  for (const line of lines) {
    const head = line.match(/^--- lang:\s*([A-Za-z]{2,3})\s*$/);
    if (head) {
      const lang = head[1].toLowerCase();
      if (sections[lang]) throw new Error(`language "${lang}" appears twice`);
      current = sections[lang] = { lines: [] };
    } else if (current) current.lines.push(line);
  }
  const out = {};
  for (const [lang, { lines: ls }] of Object.entries(sections)) {
    let i = 0;
    let subject = null;
    let preview = '';
    while (i < ls.length && ls[i].trim() !== '') {
      const m = ls[i].match(/^(Subject|Preview):\s*(.*)$/);
      if (!m) throw new Error(`${lang}: header line must be "Subject:" or "Preview:"`);
      if (m[1] === 'Subject') subject = m[2].trim(); else preview = m[2].trim();
      i++;
    }
    const body = ls.slice(i).join('\n').trim();
    if (!subject) throw new Error(`${lang}: no Subject`);
    if (!body) throw new Error(`${lang}: empty body`);
    if (!body.includes(PLACEHOLDER)) throw new Error(`${lang}: body lacks ${PLACEHOLDER}`);
    for (const part of [subject, preview, body]) {
      if (FORBIDDEN_MARKERS.test(part)) throw new Error(`${lang}: still contains an [IMPRINT]/[IMPRESSUM] placeholder`);
      const other = part.replace(/\{\{unsubscribe_url\}\}/g, '').match(/\{\{[^}]*\}\}/);
      if (other) throw new Error(`${lang}: unknown placeholder ${other[0]}`);
    }
    out[lang] = { subject, preview, body };
  }
  if (!out.en) throw new Error('no "--- lang: en" section (English is the fallback)');
  return out;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inlineHtml(s) {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/https:\/\/[^\s<>"]+[^\s<>".,;:!?)]/g, (url) => `<a href="${url}">${url}</a>`);
}

/** Minimal markdown to HTML: paragraphs, "- " lists, **bold**, links, "---" rules. */
export function bodyToHtml(body, preview = '') {
  const blocks = [];
  let para = [];
  let list = [];
  const flushPara = () => {
    if (para.length) blocks.push(`<p>${para.map(inlineHtml).join('<br>\n')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(`<ul>\n${list.map((l) => `<li>${inlineHtml(l)}</li>`).join('\n')}\n</ul>`);
    list = [];
  };
  const flush = () => { flushPara(); flushList(); };
  for (const line of body.split('\n')) {
    if (line.trim() === '') flush();
    else if (line.trim() === '---') { flush(); blocks.push('<hr>'); }
    else if (/^- /.test(line)) { flushPara(); list.push(line.slice(2)); }
    else { flushList(); para.push(line); }
  }
  flush();
  const pre = preview ? `<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div>\n` : '';
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head>\n<body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:600px">\n${pre}${blocks.join('\n')}\n</body></html>\n`;
}

/** Plain-text part: the body with **bold** markers removed. */
export const bodyToText = (body) => `${body.replace(/\*\*(.+?)\*\*/g, '$1')}\n`;

// ---------------------------------------------------------------------------
// MIME

/** RFC 2047 encoded-words (UTF-8, base64), each at most 75 chars, split on whole characters. */
export function encodeHeaderWord(text) {
  const words = [];
  let chunk = '';
  for (const ch of text) {
    const next = chunk + ch;
    if (Buffer.byteLength(next, 'utf8') > 39) { words.push(chunk); chunk = ch; } else chunk = next;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

export function decodeHeaderWords(value) {
  return value.replace(/\r\n /g, ' ').split(' ').map((w) => {
    const m = w.match(/^=\?UTF-8\?B\?([A-Za-z0-9+/=]*)\?=$/i);
    return m ? Buffer.from(m[1], 'base64').toString('utf8') : null;
  }).reduce((acc, part) => (acc === null || part === null ? null : acc + part), '');
}

const base64Lines = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n').replace(/\r\n$/, '');

/** RFC 5322 date in UTC, e.g. "Sat, 28 Nov 2026 16:20:00 +0000". */
export const rfc5322Date = (ms) => new Date(ms).toUTCString().replace(/GMT$/, '+0000');

export function unsubscribeUrl(base, secret, subject) {
  return `${base.replace(/\/+$/, '')}/v1/email/unsubscribe?t=${unsubscribeToken(secret, subject)}`;
}

/** Same check as the worker's verifyUnsubscribeToken: the subject, or null. */
export function verifyToken(secret, token) {
  if (!secret || typeof token !== 'string' || token.length > 600) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !/^[A-Za-z0-9_-]{43}$/.test(parts[1])) return null;
  const subject = Buffer.from(parts[0], 'base64url').toString('utf8');
  if (!SUBJECT_RE.test(subject)) return null;
  const expected = createHmac('sha256', secret).update(`unsub:v1:${subject}`).digest();
  const got = Buffer.from(parts[1], 'base64url');
  return got.length === expected.length && timingSafeEqual(got, expected) ? subject : null;
}

/** Language section for a consent row's lang tag: its primary subtag if the email has it, else en. */
export function pickLanguage(email, lang) {
  const primary = String(lang ?? '').split('-')[0].toLowerCase();
  return Object.hasOwn(email, primary) ? primary : 'en';
}

/** Build one raw MIME message (CRLF). */
export function buildMessage({ to, version, url, now, messageId }) {
  if (typeof to !== 'string' || !ADDRESS_RE.test(to)) throw new Error('recipient address is not a plain address');
  const boundary = `=_hd_${randomBytes(12).toString('hex')}`;
  const body = version.body.split(PLACEHOLDER).join(url);
  const headers = [
    `From: ${FROM}`,
    `To: <${to}>`,
    `Subject: ${encodeHeaderWord(version.subject)}`,
    `Date: ${rfc5322Date(now)}`,
    `Message-ID: <${messageId ?? `${randomBytes(12).toString('hex')}.${now}`}@${MESSAGE_ID_DOMAIN}>`,
    'MIME-Version: 1.0',
    `List-Unsubscribe: <${url}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];
  const part = (type, content) => [
    `--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', base64Lines(content),
  ].join('\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${part('text/plain', bodyToText(body))}\r\n${part('text/html', bodyToHtml(body, version.preview))}\r\n--${boundary}--\r\n`;
}

/** Parse the headers of a raw message (unfolded) into a Map of lower-case name -> [values]. */
export function parseHeaders(raw) {
  const head = raw.slice(0, raw.indexOf('\r\n\r\n')).replace(/\r\n[ \t]/g, ' ');
  const map = new Map();
  for (const line of head.split('\r\n')) {
    const i = line.indexOf(':');
    const name = line.slice(0, i).toLowerCase();
    map.set(name, [...(map.get(name) ?? []), line.slice(i + 1).trim()]);
  }
  return map;
}

/** Problems with a built message ([] when it is good). */
export function validateMessage(raw, { secret, subject, to, version }) {
  const problems = [];
  const h = parseHeaders(raw);
  const one = (name) => (h.get(name)?.length === 1 ? h.get(name)[0] : null);
  for (const name of ['from', 'to', 'subject', 'date', 'message-id', 'mime-version', 'list-unsubscribe', 'list-unsubscribe-post', 'content-type']) {
    if (!one(name)) problems.push(`header ${name} missing or repeated`);
  }
  if (one('from') !== FROM) problems.push('From is not the HomeDesigner mailbox');
  if (one('to') !== `<${to}>`) problems.push('To does not match the recipient');
  const subj = one('subject');
  if (!subj || !/^=\?UTF-8\?B\?/.test(subj) || decodeHeaderWords(subj) !== version.subject) problems.push('Subject is not RFC 2047 UTF-8 or does not decode back');
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+0000$/.test(one('date') ?? '')) problems.push('Date is not RFC 5322');
  if (!new RegExp(`^<[0-9a-f]{24}\\.\\d+@${MESSAGE_ID_DOMAIN.replace(/\./g, '\\.')}>$`).test(one('message-id') ?? '')) problems.push('Message-ID malformed');
  if (one('list-unsubscribe-post') !== 'List-Unsubscribe=One-Click') problems.push('List-Unsubscribe-Post wrong');
  const lu = (one('list-unsubscribe') ?? '').match(/^<(https:\/\/[^>]+\/v1\/email\/unsubscribe\?t=([A-Za-z0-9_.-]+))>$/);
  if (!lu) problems.push('List-Unsubscribe is not one https unsubscribe URL');
  else if (verifyToken(secret, lu[2]) !== subject) problems.push('unsubscribe token does not verify to this recipient');
  const ct = (one('content-type') ?? '').match(/^multipart\/alternative; boundary="([^"]+)"$/);
  if (!ct) problems.push('not multipart/alternative');
  else {
    const parts = raw.split(`\r\n--${ct[1]}`).slice(1);
    const types = [];
    for (const p of parts) {
      if (p.startsWith('--')) continue;
      const ph = parseHeaders(p.replace(/^\r\n/, ''));
      types.push(ph.get('content-type')?.[0]);
      const decoded = Buffer.from(p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\s+/g, ''), 'base64').toString('utf8');
      if (lu && !decoded.includes(lu[1])) problems.push(`${ph.get('content-type')?.[0]} part lacks the unsubscribe URL`);
      if (decoded.includes('{{')) problems.push('a placeholder was left in a part');
    }
    if (types.join('|') !== 'text/plain; charset=UTF-8|text/html; charset=UTF-8') problems.push('parts are not text/plain then text/html, UTF-8');
    if (!raw.endsWith(`--${ct[1]}--\r\n`)) problems.push('closing boundary missing');
  }
  return problems;
}

/** Header block with every address replaced, for printing. */
export function redactedHeaders(raw) {
  return raw.slice(0, raw.indexOf('\r\n\r\n')).replace(/\r\n[ \t]/g, ' ').split('\r\n')
    .map((line) => line
      .replace(/[^\s<>"]+@[^\s<>"]+/g, '[redacted]')
      .replace(/\?t=[A-Za-z0-9_.-]+/, '?t=[token]'));
}

// ---------------------------------------------------------------------------
// D1 access (read-only SELECTs)

/** Newest row per subject where it says yes, with the subject's first row id as a stable order/cursor. */
export const RECIPIENTS_SQL = `SELECT l.subject AS subject, l.email AS email, l.lang AS lang, l.wording AS wording, n.first_id AS first_id
FROM email_consent_log l
JOIN (SELECT subject, MAX(id) AS id, MIN(id) AS first_id FROM email_consent_log GROUP BY subject) n ON n.id = l.id
WHERE l.opted_in = 1
ORDER BY n.first_id`;

export const latestSql = (subject) => {
  if (!SUBJECT_RE.test(subject)) throw new Error('bad subject');
  return `SELECT opted_in, email, lang, wording FROM email_consent_log WHERE subject = '${subject}' ORDER BY id DESC LIMIT 1`;
};

/** A db over wrangler d1 execute (production or --local). */
export function wranglerDb(workerDir, local) {
  const query = (sql) => {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const out = execFileSync(npx, [
      'wrangler', 'd1', 'execute', 'homedesigner-community', local ? '--local' : '--remote', '--json',
      '--command', sql.replace(/\s+/g, ' '),
    ], { cwd: workerDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed) ? parsed.flatMap((r) => r.results ?? []) : parsed.results ?? [];
  };
  return {
    recipients: async () => query(RECIPIENTS_SQL),
    latest: async (subject) => query(latestSql(subject))[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Monthly guard state (outside the repo; dates, counts and a numeric cursor only)

export const defaultStateFile = () => join(process.env.USERPROFILE || homedir(), '.secrets', 'hd-email-sends.json');
export const monthOf = (ms) => new Date(ms).toISOString().slice(0, 7);

export function loadState(path) {
  if (!existsSync(path)) return { sends: [] };
  const state = JSON.parse(readFileSync(path, 'utf8'));
  if (!state || !Array.isArray(state.sends)) throw new Error('state file is not {"sends": [...]}');
  return state;
}

function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, path);
}

/**
 * What the guard says for this email in this month:
 * { ok, reason, entry } -- entry is the existing same-email entry to resume, or null.
 */
export function monthlyGuard(state, campaign, now, allowSecond) {
  const month = monthOf(now);
  const thisMonth = state.sends.filter((s) => s.month === month && s.sent > 0);
  const same = state.sends.find((s) => s.month === month && s.campaign === campaign) ?? null;
  if (same?.done) return { ok: false, reason: `this email was already sent to everyone on the list this month (${same.sent} sent)`, entry: same };
  if (thisMonth.some((s) => s.campaign !== campaign) && !allowSecond) {
    return { ok: false, reason: `a different product email was already sent this month (${month}); we promise about one a month. Pass --allow-second-this-month only with EXEC's approval`, entry: same };
  }
  return { ok: true, reason: null, entry: same };
}

// ---------------------------------------------------------------------------
// Run

function parseArgs(argv) {
  const args = { email: null, send: false, confirm: null, allowSecond: false, local: false, base: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--email') args.email = argv[++i] ?? null;
    else if (a === '--send') args.send = true;
    else if (a === '--confirm-batch') args.confirm = argv[++i] ?? null;
    else if (a === '--allow-second-this-month') args.allowSecond = true;
    else if (a === '--local') args.local = true;
    else if (a === '--base') args.base = argv[++i] ?? null;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown option ${a}`);
  }
  return args;
}

function defaultBase(workerDir) {
  try {
    const env = readFileSync(join(workerDir, '..', '..', '.env.production'), 'utf8');
    return env.match(/^VITE_CLOUD_SYNC_URL=(\S+)\s*$/m)?.[1] ?? null;
  } catch {
    return null;
  }
}

function readAccessToken(path) {
  if (!path) throw new Error('GMAIL_TOKEN_FILE is not set');
  if (forbiddenOutput(path)) throw new Error('GMAIL_TOKEN_FILE must be outside the shared folder and any git working tree');
  const text = readFileSync(path, 'utf8').trim();
  let token = text;
  if (text.startsWith('{')) token = JSON.parse(text).access_token ?? '';
  if (!/^[A-Za-z0-9._~+/=-]{20,4096}$/.test(token)) throw new Error('GMAIL_TOKEN_FILE does not hold an access token');
  return token;
}

/**
 * The whole program. deps (all optional): env, db, fetch, now() -> ms, out(line), err(line), workerDir.
 * Returns the exit code: 0 ok, 1 stopped on a send error, 2 refused.
 */
export async function run(argv, deps = {}) {
  const env = deps.env ?? process.env;
  const out = deps.out ?? ((l) => process.stdout.write(`${l}\n`));
  const err = deps.err ?? ((l) => process.stderr.write(`${l}\n`));
  const now = deps.now ?? (() => Date.now());
  const doFetch = deps.fetch ?? globalThis.fetch;
  const workerDir = deps.workerDir ?? resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const refuse = (m) => { err(`send-product-email: refused: ${m}`); return 2; };

  let args;
  try { args = parseArgs(argv); } catch (e) { err(USAGE); return refuse(e.message); }
  if (args.help) { out(USAGE); return 0; }
  if (!args.email) { err(USAGE); return refuse('--email <file> is required'); }

  let email;
  let campaign;
  try {
    const text = readFileSync(args.email, 'utf8');
    email = parseEmailFile(text);
    campaign = createHash('sha256').update(text).digest('hex').slice(0, 16);
  } catch (e) { return refuse(`email file: ${e.message}`); }

  const secret = env.UNSUBSCRIBE_SECRET ?? '';
  if (secret.length < 32) return refuse('UNSUBSCRIBE_SECRET is not set in the environment (or is too short)');
  const base = args.base ?? defaultBase(workerDir);
  if (!base || !/^https:\/\/[^/\s]+\/?$/.test(base)) return refuse('no https worker base URL (pass --base)');

  const stateFile = env.HD_EMAIL_STATE_FILE || defaultStateFile();
  if (forbiddenOutput(stateFile)) return refuse('the state file must be outside the shared folder and any git working tree');
  let state;
  try { state = loadState(stateFile); } catch (e) { return refuse(`state file: ${e.message}`); }
  const guard = monthlyGuard(state, campaign, now(), args.allowSecond);

  let accessToken = null;
  if (args.send) {
    if (!guard.ok) return refuse(guard.reason);
    if (args.allowSecond) err('send-product-email: WARNING: --allow-second-this-month: a second product email this month needs EXEC\'s approval first.');
    try { accessToken = readAccessToken(env.GMAIL_TOKEN_FILE); } catch (e) { return refuse(e.message); }
  }

  const db = deps.db ?? wranglerDb(workerDir, args.local);
  const rows = await db.recipients();
  const known = rows.filter((r) => typeof r.subject === 'string' && SUBJECT_RE.test(r.subject)
    && typeof r.email === 'string' && KNOWN_WORDINGS.has(r.wording));
  const unknownWording = rows.length - known.length;
  const cursor = guard.entry?.cursor ?? 0;
  const remaining = known.filter((r) => Number(r.first_id) > cursor);
  const batch = remaining.slice(0, CAP);

  const perLang = {};
  for (const r of known) { const l = pickLanguage(email, r.lang); perLang[l] = (perLang[l] ?? 0) + 1; }
  const langText = Object.entries(perLang).sort().map(([l, n]) => `${l} ${n}`).join(', ') || 'none';

  // Build and validate every message in memory (dry run) -- all recipients, not only this batch.
  const build = (r, at) => {
    const version = email[pickLanguage(email, r.lang)];
    const url = unsubscribeUrl(base, secret, r.subject);
    const raw = buildMessage({ to: r.email, version, url, now: at });
    const problems = validateMessage(raw, { secret, subject: r.subject, to: r.email, version });
    return { raw, problems };
  };

  if (!args.send) {
    let bad = 0;
    let sample = null;
    for (const r of known) {
      let built;
      try { built = build(r, now()); } catch { bad++; continue; }
      if (built.problems.length) bad++;
      else sample ??= built.raw;
    }
    out('send-product-email: DRY RUN (nothing sent, nothing written)');
    out(`recipients opted in: ${known.length} (${langText}); skipped for unknown consent wording: ${unknownWording}`);
    out(`already done for this email this month: ${guard.entry?.sent ?? 0} sent; still to send: ${remaining.length}`);
    out(`would send this run: ${batch.length} (cap ${CAP})${batch.length ? ` -> --send --confirm-batch ${batch.length}` : ''}`);
    out(`monthly guard: ${guard.ok ? 'ok' : `would refuse: ${guard.reason}`}`);
    out(`messages built and validated: ${known.length - bad} ok, ${bad} failed`);
    if (sample) {
      out('sample headers (addresses redacted):');
      for (const line of redactedHeaders(sample)) out(`  ${line}`);
    }
    return bad ? 2 : 0;
  }

  // ---- Send ---------------------------------------------------------------
  if (String(batch.length) !== String(args.confirm ?? '')) {
    return refuse(`--confirm-batch must equal the number this run will send (${batch.length})`);
  }
  if (!batch.length) { out('send-product-email: nobody left to send to'); return 0; }

  const entry = guard.entry ?? { month: monthOf(now()), campaign, firstDate: new Date(now()).toISOString(), sent: 0, skipped: 0, cursor: 0, done: false };
  if (!guard.entry) state.sends.push(entry);
  let sent = 0;
  let skipped = 0;
  const finish = () => {
    entry.lastDate = new Date(now()).toISOString();
    entry.done = remaining.length <= batch.length && Number(entry.cursor) >= Number(batch[batch.length - 1].first_id);
    saveState(stateFile, state);
  };

  for (const r of batch) {
    // Consent is re-read right before each message: the newest row must still say yes.
    let latest;
    try { latest = await db.latest(r.subject); } catch {
      finish();
      err(`send-product-email: stopped: consent re-check failed; sent ${sent}, skipped ${skipped}`);
      return 1;
    }
    if (!latest || Number(latest.opted_in) !== 1 || !KNOWN_WORDINGS.has(latest.wording) || typeof latest.email !== 'string') {
      skipped++; entry.skipped += 1; entry.cursor = Number(r.first_id); saveState(stateFile, state);
      continue;
    }
    let built;
    try { built = build({ ...r, email: latest.email, lang: latest.lang }, now()); } catch { built = { problems: ['build failed'] }; }
    if (built.problems.length) {
      finish();
      err(`send-product-email: stopped: a message failed validation (${built.problems.length} problem(s)); sent ${sent}, skipped ${skipped}`);
      return 1;
    }
    let status;
    try {
      const res = await doFetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: Buffer.from(built.raw, 'utf8').toString('base64url') }),
      });
      status = res.status;
    } catch { status = 0; }
    if (status < 200 || status > 299) {
      finish();
      err(`send-product-email: stopped: sent ${sent}, HTTP status ${status || 'network error'}`);
      return 1;
    }
    sent++; entry.sent += 1; entry.cursor = Number(r.first_id);
    saveState(stateFile, state);
  }
  finish();
  out(`send-product-email: sent ${sent}, skipped (no longer opted in) ${skipped}, still to send after this run: ${Math.max(0, remaining.length - batch.length)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await run(process.argv.slice(2));
}
