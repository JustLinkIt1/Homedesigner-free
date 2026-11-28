#!/usr/bin/env node
// Export the people who said yes to product-update email, for one send.
//
//   UNSUBSCRIBE_SECRET=... node workers/design-sync/scripts/export-optins.mjs --out D:\private\optins.csv > D:\private\optins.csv
//
// - Reads D1 (homedesigner-community) with wrangler: the NEWEST consent row per
//   account, kept only where it says opted_in = 1. Nobody else is ever listed.
// - Prints CSV to stdout ONLY. It never writes a file itself.
// - Refuses to run when its output would land inside C:\Projects\DeepBlue\shared
//   or inside any git working tree (a list of emails must never become a team
//   file or a commit). Printing to a terminal is allowed; when stdout is
//   redirected, --out <path> must name the destination, and for a plain file
//   redirect it is checked to BE the file stdout points at.
// - The signing secret comes from the UNSUBSCRIBE_SECRET environment variable at
//   run time (the same value as the worker secret). It is never printed.
//
// Options:
//   --out <path>   where stdout is redirected (required unless stdout is a terminal)
//   --base <url>   worker base URL (default: VITE_CLOUD_SYNC_URL from .env.production)
//   --local        read the local wrangler D1 instead of production
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { existsSync, fstatSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SHARED_DIR = 'C:\\Projects\\DeepBlue\\shared';

/** Newest row per subject, only where it is a yes. */
export const LATEST_OPTED_IN_SQL = `SELECT l.subject AS subject, l.email AS email
FROM email_consent_log l
JOIN (SELECT subject, MAX(id) AS id FROM email_consent_log GROUP BY subject) newest ON newest.id = l.id
WHERE l.opted_in = 1
ORDER BY l.id`;

export function unsubscribeToken(secret, subject) {
  const sig = createHmac('sha256', secret).update(`unsub:v1:${subject}`).digest('base64url');
  return `${Buffer.from(subject, 'utf8').toString('base64url')}.${sig}`;
}

function csvField(value) {
  // Quoted only when needed. Values are never altered: this feeds a mail tool.
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** rows: [{ subject, email }] -> CSV text with the four columns of the spec. */
export function buildCsv(rows, secret, base) {
  const root = base.replace(/\/+$/, '');
  const lines = ['email,unsubscribe_url,list_unsubscribe_header,list_unsubscribe_post_header'];
  for (const row of rows) {
    const url = `${root}/v1/email/unsubscribe?t=${unsubscribeToken(secret, row.subject)}`;
    lines.push([row.email, url, `<${url}>`, 'List-Unsubscribe=One-Click'].map(csvField).join(','));
  }
  return `${lines.join('\n')}\n`;
}

const norm = (p) => resolve(p).replace(/[\\/]+$/, '').toLowerCase();

/** True when `path` is `dir` or inside it (case-insensitive, for Windows). */
export function isInside(path, dir) {
  const p = norm(path);
  const d = norm(dir);
  return p === d || p.startsWith(d + sep.toLowerCase()) || p.startsWith(`${d}/`) || p.startsWith(`${d}\\`);
}

/** The git working tree containing `path` (a `.git` dir or worktree file in it or a parent), or null. */
export function gitTreeOf(path) {
  let dir = resolve(path);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) dir = dirname(dir);
  for (;;) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Why `out` is not an acceptable destination, or null when it is. */
export function forbiddenOutput(out, sharedDir = SHARED_DIR) {
  if (isInside(out, sharedDir)) return `output path is inside ${sharedDir}`;
  const tree = gitTreeOf(out);
  if (tree) return `output path is inside a git working tree (${tree})`;
  return null;
}

function parseArgs(argv) {
  const args = { out: null, base: null, local: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i] ?? null;
    else if (a === '--base') args.base = argv[++i] ?? null;
    else if (a === '--local') args.local = true;
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

function readRows(workerDir, local) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const out = execFileSync(npx, [
    'wrangler', 'd1', 'execute', 'homedesigner-community', local ? '--local' : '--remote', '--json',
    '--command', LATEST_OPTED_IN_SQL.replace(/\s+/g, ' '),
  ], { cwd: workerDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  const results = Array.isArray(parsed) ? parsed.flatMap((r) => r.results ?? []) : parsed.results ?? [];
  return results.filter((r) => typeof r.subject === 'string' && typeof r.email === 'string');
}

function fail(message) {
  process.stderr.write(`export-optins: refused: ${message}\n`);
  process.exit(2);
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { fail(e.message); }
  const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  // Where does stdout go?
  if (!process.stdout.isTTY) {
    if (!args.out) fail('stdout is redirected; pass --out <path> naming where (it must be outside the shared folder and any git working tree)');
    const why = forbiddenOutput(args.out);
    if (why) fail(why);
    const st = fstatSync(1);
    if (st.isFile()) {
      // A plain file redirect: --out must be that very file, not just a claim.
      let target;
      try { target = statSync(args.out); } catch { fail('--out does not match the file stdout is redirected to'); }
      if (target.ino !== st.ino || target.dev !== st.dev) fail('--out does not match the file stdout is redirected to');
    }
  }
  const secret = process.env.UNSUBSCRIBE_SECRET ?? '';
  if (secret.length < 32) fail('UNSUBSCRIBE_SECRET is not set in the environment (or is too short)');
  const base = args.base ?? defaultBase(workerDir);
  if (!base || !/^https:\/\//.test(base)) fail('no https worker base URL (pass --base)');

  const rows = readRows(workerDir, args.local);
  process.stdout.write(buildCsv(rows, secret, base));
  process.stderr.write(`export-optins: ${rows.length} opted-in address(es)\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
