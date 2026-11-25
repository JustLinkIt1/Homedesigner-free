// POST /v1/events handler against the real migration in SQLite.
//
//   node tests/hd-events.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const dir = mkdtempSync(join(process.cwd(), 'workers/design-sync/.hd-events-'));
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  const src = readFileSync('workers/design-sync/src/hd-events.ts', 'utf8');
  writeFileSync(join(dir, 'hd-events.mjs'), ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  const { recordHdEvents, purgeOldHdEvents, HD_EVENT_NAMES } = await import(pathToFileURL(join(dir, 'hd-events.mjs')).href);
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('workers/design-sync/migrations/0010_hd_events.sql', 'utf8'));
  const db = {
    prepare(query) {
      const stmt = sql.prepare(query);
      const bound = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        run: async () => ({ meta: { changes: stmt.run(...args).changes } }),
        _run: () => stmt.run(...args),
      });
      return { bind: (...args) => bound(args), ...bound([]) };
    },
    async batch(statements) { sql.exec('BEGIN'); try { statements.forEach((s) => s._run()); sql.exec('COMMIT'); } catch (e) { sql.exec('ROLLBACK'); throw e; } return []; },
  };
  const count = () => sql.prepare('SELECT COUNT(*) AS n FROM hd_events').get().n;
  const post = (body, now) => recordHdEvents(new Request('https://x/v1/events', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }), db, now);
  const install = '3f2b8c1e-5a47-4d9b-8e21-0c6f7a9d1b34';
  const good = { install, app_version: '1.23.0', source: 'google-play:spring_sale', events: [{ event: 'app_first_open' }, { event: 'template_chosen', detail: 'studio-flat' }, { event: 'pro_wall_shown', detail: 'projects:new' }] };
  const T = Date.UTC(2026, 10, 22, 12);

  let r = await post(good, T);
  check(r.status === 202 && count() === 3, 'valid batch is stored');
  const row = sql.prepare("SELECT * FROM hd_events WHERE event = 'template_chosen'").get();
  check(row.detail === 'studio-flat' && row.app_version === '1.23.0' && row.source === 'google-play:spring_sale' && row.day === Math.floor(T / 86400000) && row.created_at === T, 'row carries detail, version, source, UTC day');
  check(Object.keys(row).join() === 'id,install,event,detail,app_version,source,day,created_at', 'no other columns (no IP / user agent)');

  const bad = async (body, label) => { const before = count(); const res = await post(body, T); check(res.status === 400 && count() === before, label); };
  await bad({ ...good, install: 'not-a-uuid' }, 'non-uuid install rejected');
  await bad({ ...good, install: '3f2b8c1e-5a47-1d9b-8e21-0c6f7a9d1b34' }, 'non-v4 uuid rejected');
  await bad({ ...good, events: [{ event: 'screen_view' }] }, 'unknown event name rejected');
  await bad({ ...good, events: [{ event: 'editor_opened' }, { event: 'nope' }] }, 'one bad event rejects the whole request');
  await bad({ ...good, events: [{ event: 'import_result', detail: 'has space' }] }, 'detail with space rejected');
  await bad({ ...good, events: [{ event: 'import_result', detail: 'a@b.com' }] }, 'detail with @ rejected');
  await bad({ ...good, events: [{ event: 'import_result', detail: 'x'.repeat(65) }] }, 'detail over 64 rejected');
  await bad({ ...good, app_version: '1'.repeat(25) }, 'app_version over 24 rejected');
  await bad({ ...good, source: 'a'.repeat(65) }, 'source over 64 rejected');
  await bad({ ...good, events: [] }, 'empty events rejected');
  await bad({ ...good, events: Array.from({ length: 21 }, () => ({ event: 'editor_opened' })) }, 'more than 20 events rejected');
  await bad('{not json', 'malformed JSON rejected');
  await bad([1, 2], 'array body rejected');

  // Daily cap: 60 per install per UTC day; 3 already stored.
  const batch = (n) => ({ ...good, events: Array.from({ length: n }, () => ({ event: 'editor_opened' })) });
  for (let i = 0; i < 2; i++) check((await post(batch(19), T)).status === 202, 'fills toward cap');
  check(count() === 41, '41 stored');
  r = await post(batch(19), T);
  check(r.status === 202 && count() === 60, 'exactly 60 in a day is allowed');
  const before = count();
  r = await post(batch(1), T);
  check(r.status === 429 && count() === before, 'over the daily cap is 429 and stores nothing');
  check((await post({ ...good, install: '9a1d4e60-7b3c-4f58-a2d6-1e8b5c07f923' }, T)).status === 202, 'another install is unaffected');
  check((await post(good, T + 86400000)).status === 202, 'cap resets on the next UTC day');
  // 13-month retention: rows older than today - 396 days go, the boundary day stays.
  const day = Math.floor(T / 86400000);
  const ins = sql.prepare("INSERT INTO hd_events (install, event, day, created_at) VALUES (?, 'editor_opened', ?, 0)");
  ins.run(install, day - 397); ins.run(install, day - 396); ins.run(install, day - 395);
  const total = count();
  const removed = await purgeOldHdEvents(db, T);
  check(removed >= 1 && count() === total - removed, 'purge reports what it deleted');
  check(sql.prepare('SELECT COUNT(*) AS n FROM hd_events WHERE day < ?').get(day - 396).n === 0, 'nothing older than 396 days remains');
  check(sql.prepare('SELECT COUNT(*) AS n FROM hd_events WHERE day = ?').get(day - 396).n === 1, 'the 396-day boundary row is kept');
  check(sql.prepare('SELECT COUNT(*) AS n FROM hd_events WHERE day = ?').get(day).n > 0, 'recent rows are kept');
  check((await post({ ...good, events: [{ event: 'pro_wall_shown', detail: 'pdfExport:ifc' }] }, T + 5 * 86400000)).status === 202, 'pro_wall_shown detail pdfExport:ifc is accepted');
  for (const kind of ['png', 'pdf', 'dxf', 'ifc']) {
    const n = count();
    check((await post({ ...good, install: '5c0e7d2a-91b4-4f6e-b3a8-2d7e4f1a6c90', events: [{ event: 'export', detail: kind }] }, T)).status === 202 && count() === n + 1, `export event with detail ${kind} is stored`);
  }
  // E1: the Pro checkout funnel. Eight names, and pro_checkout's detail is one of five stages.
  check(HD_EVENT_NAMES.size === 8 && HD_EVENT_NAMES.has('pro_checkout') && HD_EVENT_NAMES.has('export'), 'eight event names, pro_checkout among them');
  for (const stage of ['signin_click', 'signin_ok', 'checkout_open', 'paid', 'cancel']) {
    const n = count();
    check((await post({ ...good, install: '9a1d4c7e-2b63-4e08-9f5a-6c3b8d0e7f12', events: [{ event: 'pro_checkout', detail: stage }] }, T)).status === 202 && count() === n + 1, `pro_checkout stage ${stage} is stored`);
  }
  await bad({ ...good, events: [{ event: 'pro_checkout', detail: 'a b' }] }, 'pro_checkout detail with a space is rejected');
  await bad({ ...good, events: [{ event: 'pro_checkoutx', detail: 'paid' }] }, 'a near-miss event name is rejected');
  console.log(`hd-events: ${checks} checks passed`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
