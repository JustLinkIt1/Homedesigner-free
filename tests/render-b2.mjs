// B2 (AI render never produced anything): dispatch inside the POST under one
// deadline, stale-reservation sweep, and the complete-but-undelivered refund.
// Actual Worker modules and handlers + real migrations in SQLite; every
// provider HTTP call is stubbed, never live or paid.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const dir = mkdtempSync(join(process.cwd(), 'workers/design-sync/.render-b2-'));
const originalFetch = globalThis.fetch;
const originalError = console.error;
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  for (const name of ['index', 'community', 'points', 'ai-features', 'ai-advisor', 'ai-providers', 'ai-plan', 'stripe', 'ai-render', 'entitlements', 'shared-plans', 'hd-events']) {
    let source = readFileSync(`workers/design-sync/src/${name}.ts`, 'utf8');
    // Google sign-in and the entitlement lookup are replaced; everything after them is the real handler.
    if (name === 'index') source += '\nexport function testHooks(auth, pro) { authenticate = auth; isProSubject = pro; }';
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    writeFileSync(join(dir, `${name}.mjs`), compiled.replace(/from '(\.\/[a-z-]+)'/g, "from '$1.mjs'"));
  }
  const worker = await import(pathToFileURL(join(dir, 'index.mjs')).href);
  const render = await import(pathToFileURL(join(dir, 'ai-render.mjs')).href);
  const { reserveRender, readRender, failRender, dispatchRender, sweepStaleRenders, deliverRender, refundUndeliveredRender,
    freeRenderAvailable, refreshRender, STALE_RESERVED_MS, DELIVERY_ATTEMPTS, RENDER_POST_DEADLINE_MS } = render;
  worker.testHooks(async request => ({ subject: request.headers.get('X-Test-Subject'), email: null, emailVerified: true }), async () => true);

  const sql = new DatabaseSync(':memory:');
  for (const file of ['0004_points.sql', '0005_ai_renders.sql', '0006_ai_render_styles.sql', '0007_purchase_settlement.sql',
    '0008_ai_render_watermark.sql', '0011_ai_render_delivery.sql']) sql.exec(readFileSync(`workers/design-sync/migrations/${file}`, 'utf8'));
  const db = { prepare(query) {
    const stmt = sql.prepare(query);
    const bound = args => ({ first: async () => stmt.get(...args) ?? null,
      run: async () => ({ meta: { changes: stmt.run(...args).changes } }), all: async () => ({ results: stmt.all(...args) }) });
    return { ...bound([]), bind: (...args) => bound(args) };
  } };
  const allow = { limit: async () => ({ success: true }) };
  const env = { COMMUNITY: db, AI_RENDER_ENABLED: 'true', FAL_KEY: 'fal-test', ELEVENLABS_API_KEY: 'el-test',
    USER_READ_LIMITER: allow, USER_WRITE_LIMITER: allow };
  const ctx = { waitUntil: () => { throw new Error('render work must not be deferred to waitUntil'); } };
  const call = (subject, path, body) => worker.default.fetch(new Request(`https://test.local${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer test-only', 'X-Test-Subject': subject, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, ctx);
  const id = () => crypto.randomUUID();
  const image = 'data:image/jpeg;base64,/9j/AAAA';
  const balance = subject => sql.prepare('SELECT balance FROM point_accounts WHERE subject = ?').get(subject)?.balance ?? 0;
  const fund = (subject, points) => {
    sql.prepare('INSERT INTO point_accounts(subject, balance, created_at, updated_at) VALUES (?, ?, 0, 0) ON CONFLICT(subject) DO UPDATE SET balance = excluded.balance').run(subject, points);
  };
  const ledger = (subject, kind) => sql.prepare('SELECT COUNT(*) AS n FROM point_ledger WHERE subject = ? AND kind = ?').get(subject, kind).n;
  const job = (subject, jobId) => sql.prepare('SELECT * FROM ai_render_jobs WHERE subject = ? AND id = ?').get(subject, jobId);
  // Spend a Pro account's free render so the next one is paid.
  const paidAccount = async (subject, points = 400) => {
    const free = await reserveRender(db, subject, id(), 0);
    sql.prepare("UPDATE ai_render_jobs SET status = 'complete', delivered_at = 1 WHERE subject = ? AND id = ?").run(subject, free.job.id);
    fund(subject, points);
  };
  const logs = [];
  console.error = (...args) => { logs.push(args.join(' ')); };

  // Provider stubs. `hang` ignores nothing: it settles only when the caller aborts.
  const hang = init => new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal.reason ?? new DOMException('aborted', 'AbortError')));
  });
  let el = () => Response.json({ id: 'gen_ok' });
  let fal = () => Response.json({ request_id: 'fal-ok' });
  let falCalls = [];
  let host = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'Content-Type': 'image/jpeg' } });
  let elStatus = () => Response.json({ status: 'completed', content_url: 'https://storage.googleapis.com/bucket/out.png' });
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url instanceof Request ? url.url : url);
    if (href === 'https://api.elevenlabs.io/v1/flows/image') return el(init);
    if (href.startsWith('https://api.elevenlabs.io/v1/flows/image/')) return elStatus(init);
    if (href.startsWith('https://queue.fal.run/')) { falCalls.push({ href, init }); return fal(init); }
    if (href.startsWith('https://v3.fal.media/') || href.startsWith('https://storage.googleapis.com/')) return host(init);
    throw new Error(`unexpected request ${href}`);
  };

  // 1. Dispatch deadline: the job ends failed and refunded before dispatch returns.
  {
    await paidAccount('t-timeout');
    const paid = (await reserveRender(db, 't-timeout', id(), 150)).job;
    check(balance('t-timeout') === 250, 'Paid render debited at reserve');
    // ElevenLabs uses up its share of the deadline; too little is left to try fal.
    el = init => new Promise(resolve => setTimeout(() => resolve(Response.json({}, { status: 504 })), 300));
    fal = init => hang(init);
    const started = Date.now();
    const result = await dispatchRender(db, { fal: 'fal-test', elevenlabs: 'el-test' }, paid, image, 'interior', Date.now() + 2_100);
    const took = Date.now() - started;
    check(result.status === 'failed' && job('t-timeout', paid.id).status === 'failed', 'Deadline spent ends the job failed');
    check(took < 1_000, `Dispatch stops once too little time is left (${took} ms)`);
    check(balance('t-timeout') === 400 && ledger('t-timeout', 'refund') === 1, 'Timed-out paid render refunded once');
    check(logs.some(l => l.includes('stage=elevenlabs-submit refused')) && logs.some(l => l.includes('stage=fal-submit skipped: deadline nearly spent')),
      'Each failure stage is logged');
    // A provider that honours its abort: the per-provider timeout is capped by the deadline.
    await paidAccount('t-timeout-abort');
    const aborted = (await reserveRender(db, 't-timeout-abort', id(), 150)).job;
    el = init => hang(init);
    const t1 = Date.now();
    const abortedResult = await dispatchRender(db, { fal: 'fal-test', elevenlabs: 'el-test' }, aborted, image, 'interior', Date.now() + 400);
    check(abortedResult.status === 'failed' && Date.now() - t1 < 1_500 && balance('t-timeout-abort') === 400
      && ledger('t-timeout-abort', 'refund') === 1, 'Provider timeout inside the deadline: failed and refunded once');
    check(!logs.some(l => l.includes('/9j/') || l.includes('el-test') || l.includes('fal-test')), 'Logs carry no image data or keys');

    // A provider call that ignores its abort signal is still cut off by the overall deadline.
    const free = (await reserveRender(db, 't-timeout-free', id(), 0)).job;
    el = () => new Promise(() => undefined);
    const t0 = Date.now();
    const stuck = await dispatchRender(db, { elevenlabs: 'el-test', fal: 'fal-test' }, free, image, 'interior', Date.now() + 300);
    check(stuck.status === 'failed' && Date.now() - t0 < 1500, 'A hung provider cannot outlive the deadline');
    check(await freeRenderAvailable(db, 't-timeout-free'), 'Timed-out free render restores the allowance');
    check(logs.some(l => l.includes('stage=dispatch failed') && l.includes('dispatch deadline passed')), 'Deadline failure is logged');
    check(RENDER_POST_DEADLINE_MS === 25_000 && RENDER_POST_DEADLINE_MS + 5_000 <= 30_000, 'POST deadline leaves margin inside the app 30 s timeout');
  }

  // 2. Provider refuses: failed, refunded.
  {
    await paidAccount('t-refuse');
    const paid = (await reserveRender(db, 't-refuse', id(), 150)).job;
    el = () => Response.json({ detail: 'nope' }, { status: 422 });
    fal = () => Response.json({ detail: 'bad input' }, { status: 400 });
    const result = await dispatchRender(db, { elevenlabs: 'el-test', fal: 'fal-test' }, paid, image);
    check(result.status === 'failed' && result.request_id === null, 'Both providers refusing ends failed');
    check(balance('t-refuse') === 400 && ledger('t-refuse', 'refund') === 1, 'Refused paid render refunded once');
    check(logs.some(l => l.includes('stage=elevenlabs-submit refused')) && logs.some(l => l.includes('stage=fal-submit refused')), 'Refusals logged by stage');
  }

  // 3. Success: queued with the provider request id; a data: URI submit is exactly one request.
  {
    el = () => Response.json({ detail: 'busy' }, { status: 503 });
    fal = () => Response.json({ request_id: 'fal-req-1' });
    falCalls = [];
    const free = (await reserveRender(db, 't-ok', id(), 0)).job;
    const result = await dispatchRender(db, { elevenlabs: 'el-test', fal: 'fal-test' }, free, image);
    check(result.status === 'queued' && result.request_id === 'fal-req-1', 'fal success queues the job with its request id');
    check(falCalls.length === 1 && falCalls[0].init.method === 'POST' && JSON.parse(falCalls[0].init.body).image_url === image,
      'The data: URI goes inline in the single queue POST (no storage upload)');
    el = () => Response.json({ id: 'gen_7' });
    const second = (await reserveRender(db, 't-ok-el', id(), 0)).job;
    check((await dispatchRender(db, { elevenlabs: 'el-test', fal: 'fal-test' }, second, image)).request_id === 'el:gen_7',
      'ElevenLabs success queues the job with its prefixed id');
  }

  // 4. Routes: POST dispatches before it answers, under the deadline.
  {
    el = () => Response.json({ id: 'gen_route' });
    const ok = await call('t-route', '/v1/ai/renders', { id: id(), image, style: 'modern', expectedCharge: 0 });
    const okBody = await ok.json();
    check(ok.status === 202 && okBody.status === 'queued', 'POST answers with the queued job (dispatch awaited, not deferred)');
    sql.prepare("UPDATE ai_render_jobs SET status = 'complete', delivered_at = 1 WHERE subject = 't-route'").run();
    fund('t-route', 400);
    el = () => Response.json({}, { status: 500 }); fal = () => Response.json({}, { status: 422 });
    const failedId = id();
    const bad = await call('t-route', '/v1/ai/renders', { id: failedId, image, style: 'modern', expectedCharge: 150 });
    const badBody = await bad.json();
    check(bad.status === 502 && badBody.status === 'failed' && badBody.error.includes('could not start'), 'Failed start answers 502 with the job and its reason');
    check(balance('t-route') === 400 && ledger('t-route', 'refund') === 1, 'Failed POST refunded before the answer');
    const replay = await call('t-route', '/v1/ai/renders', { id: failedId, image, style: 'modern', expectedCharge: 150 });
    check(replay.status === 202 && (await replay.json()).status === 'failed' && ledger('t-route', 'spend') === 1, 'Replaying the id never dispatches or charges again');
  }

  // 5. Stale sweep: list GET and POST fail reserved jobs older than 120 s; repeat adds nothing.
  {
    await paidAccount('t-stale');
    const stale = (await reserveRender(db, 't-stale', id(), 150)).job;
    sql.prepare('UPDATE ai_render_jobs SET created_at = ? WHERE subject = ? AND id = ?').run(Date.now() - STALE_RESERVED_MS - 1_000, 't-stale', stale.id);
    await assert.rejects(reserveRender(db, 't-stale', id(), 150), /already in progress/); checks++;
    const list = await call('t-stale', '/v1/ai/renders');
    const listBody = await list.json();
    check(list.status === 200 && listBody.enabled === true && job('t-stale', stale.id).status === 'failed'
      && job('t-stale', stale.id).error.includes('did not start'), 'List GET sweeps the stale job');
    check(balance('t-stale') === 400 && ledger('t-stale', 'refund') === 1, 'Swept paid job refunded');
    const rows = sql.prepare('SELECT COUNT(*) AS n FROM point_ledger').get().n;
    await call('t-stale', '/v1/ai/renders');
    check(await sweepStaleRenders(db, 't-stale') === 0, 'Second sweep finds nothing');
    check(sql.prepare('SELECT COUNT(*) AS n FROM point_ledger').get().n === rows && balance('t-stale') === 400, 'Second sweep adds no rows or refunds');
    check((await reserveRender(db, 't-stale', id(), 150)).created, 'Trigger no longer blocks a new render after the sweep');

    // Free allowance job stuck reserved (the production case): POST sweeps it, then renders.
    const stuck = (await reserveRender(db, 't-stale-free', id(), 0)).job;
    sql.prepare('UPDATE ai_render_jobs SET created_at = ? WHERE id = ?').run(Date.now() - 24 * 3600_000, stuck.id);
    const young = (await reserveRender(db, 't-young', id(), 0)).job;
    check(await sweepStaleRenders(db, 't-young') === 0 && job('t-young', young.id).status === 'reserved', 'A job under 120 s old is left alone');
    el = () => Response.json({ id: 'gen_after_sweep' });
    const post = await call('t-stale-free', '/v1/ai/renders', { id: id(), image, style: 'modern', expectedCharge: 0 });
    const postBody = await post.json();
    check(job('t-stale-free', stuck.id).status === 'failed' && job('t-stale-free', stuck.id).error.includes('did not start'), 'POST sweeps the stuck job first');
    check(post.status === 202 && postBody.status === 'queued' && postBody.charged === 0, 'New render proceeds, on the restored free allowance');
    check(sql.prepare("SELECT COUNT(*) AS n FROM point_ledger WHERE subject = 't-stale-free'").get().n === 0, 'Free-allowance sweep writes no ledger rows');
    // The per-id GET still refreshes a stale job as before.
    const old = (await reserveRender(db, 't-stale-id', id(), 0)).job;
    sql.prepare('UPDATE ai_render_jobs SET created_at = ? WHERE id = ?').run(Date.now() - STALE_RESERVED_MS - 1, old.id);
    check((await (await call('t-stale-id', `/v1/ai/renders/${old.id}`)).json()).status === 'failed', 'Per-id GET still fails a stale job');
  }

  // 6. Complete but undelivered.
  {
    const complete = (subject, jobId, url = 'https://v3.fal.media/files/out.jpg') =>
      sql.prepare("UPDATE ai_render_jobs SET status = 'complete', request_id = 'fal-x', result_url = ? WHERE subject = ? AND id = ?").run(url, subject, jobId);
    // Transient failures: no refund until the third failed download.
    await paidAccount('t-deliver');
    const paid = (await reserveRender(db, 't-deliver', id(), 150)).job;
    complete('t-deliver', paid.id);
    host = () => new Response('busy', { status: 503 });
    const first = await deliverRender(db, 'fal-test', await readRender(db, 't-deliver', paid.id));
    check(!first.ok && first.status === 502 && job('t-deliver', paid.id).status === 'complete' && balance('t-deliver') === 250,
      'First transient download failure does not refund');
    host = () => { throw new TypeError('network down'); };
    await deliverRender(db, 'fal-test', await readRender(db, 't-deliver', paid.id));
    check(job('t-deliver', paid.id).delivery_failures === 2 && balance('t-deliver') === 250, 'Second failure still no refund');
    host = () => new Response('<html>', { headers: { 'Content-Type': 'text/html' } });
    const third = await deliverRender(db, 'fal-test', await readRender(db, 't-deliver', paid.id));
    check(!third.ok && third.status === 410 && job('t-deliver', paid.id).status === 'failed', `Failure ${DELIVERY_ATTEMPTS} is terminal`);
    check(balance('t-deliver') === 400 && ledger('t-deliver', 'refund') === 1, 'Undelivered paid render refunded exactly once');
    check(!(await refundUndeliveredRender(db, 't-deliver', paid.id)) && ledger('t-deliver', 'refund') === 1 && balance('t-deliver') === 400,
      'Refunding the same job again does nothing');
    await failRender(db, 't-deliver', paid.id, 'late failure');
    check(ledger('t-deliver', 'refund') === 1 && balance('t-deliver') === 400, 'failRender after a delivery refund adds nothing');

    // Already refunded through the failed-trigger path: delivery refund cannot run again.
    await paidAccount('t-double');
    const twice = (await reserveRender(db, 't-double', id(), 150)).job;
    await failRender(db, 't-double', twice.id, 'provider failed');
    check(!(await refundUndeliveredRender(db, 't-double', twice.id)) && ledger('t-double', 'refund') === 1 && balance('t-double') === 400,
      'A job refunded on failure is never refunded by the delivery path');

    // Invalid stored result URL: terminal at once.
    await paidAccount('t-badurl');
    const badUrl = (await reserveRender(db, 't-badurl', id(), 150)).job;
    complete('t-badurl', badUrl.id, 'https://evil.test/out.jpg');
    const gone = await deliverRender(db, 'fal-test', await readRender(db, 't-badurl', badUrl.id));
    check(!gone.ok && gone.status === 410 && balance('t-badurl') === 400 && ledger('t-badurl', 'refund') === 1, 'Invalid result URL refunds at once');

    // Charged without a spend row (not a real charge): no refund.
    await paidAccount('t-nospend');
    const noSpend = (await reserveRender(db, 't-nospend', id(), 150)).job;
    sql.prepare("DELETE FROM point_ledger WHERE subject = 't-nospend' AND kind = 'spend' AND ref = ?").run(noSpend.id);
    complete('t-nospend', noSpend.id, 'https://evil.test/out.jpg');
    const noRefund = await deliverRender(db, 'fal-test', await readRender(db, 't-nospend', noSpend.id));
    check(!noRefund.ok && job('t-nospend', noSpend.id).status === 'complete' && ledger('t-nospend', 'refund') === 0 && balance('t-nospend') === 250,
      'No spend row, no refund');

    // A refund row already on the ledger (manual correction) blocks the delivery refund.
    await paidAccount('t-prior');
    const prior = (await reserveRender(db, 't-prior', id(), 150)).job;
    complete('t-prior', prior.id, 'not a url');
    sql.prepare("INSERT INTO point_ledger(id, subject, kind, delta, feature, balance_after, ref, created_at) VALUES (?, 't-prior', 'refund', 150, 'ai_render', 400, ?, 0)")
      .run(`refund:ai_render:t-prior:${prior.id}`, prior.id);
    check(!(await refundUndeliveredRender(db, 't-prior', prior.id)) && job('t-prior', prior.id).status === 'complete' && balance('t-prior') === 250,
      'Existing refund row: no second refund');

    // Free-allowance job: the allowance comes back, as failRender would do; no ledger rows.
    const free = (await reserveRender(db, 't-deliver-free', id(), 0)).job;
    complete('t-deliver-free', free.id, 'not a url');
    check(!(await freeRenderAvailable(db, 't-deliver-free')), 'Free allowance in use');
    await deliverRender(db, 'fal-test', await readRender(db, 't-deliver-free', free.id));
    check(await freeRenderAvailable(db, 't-deliver-free') && sql.prepare("SELECT COUNT(*) AS n FROM point_ledger WHERE subject = 't-deliver-free'").get().n === 0,
      'Undelivered free render restores the allowance');

    // Delivered once: never refunded, even after the link later fails.
    await paidAccount('t-delivered');
    const delivered = (await reserveRender(db, 't-delivered', id(), 150)).job;
    complete('t-delivered', delivered.id);
    host = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'Content-Type': 'image/jpeg' } });
    const okDelivery = await deliverRender(db, 'fal-test', await readRender(db, 't-delivered', delivered.id));
    check(okDelivery.ok && okDelivery.contentType === 'image/jpeg' && okDelivery.bytes.length === 4 && job('t-delivered', delivered.id).delivered_at > 0,
      'Successful download marks the job delivered');
    host = () => new Response('gone', { status: 404 });
    for (let i = 0; i < DELIVERY_ATTEMPTS + 1; i++) await deliverRender(db, 'fal-test', await readRender(db, 't-delivered', delivered.id));
    check(job('t-delivered', delivered.id).status === 'complete' && ledger('t-delivered', 'refund') === 0 && balance('t-delivered') === 250,
      'A delivered render is never refunded');

    // ElevenLabs: an unreachable status API is not counted; a vanished generation is terminal.
    await paidAccount('t-el');
    const elJob = (await reserveRender(db, 't-el', id(), 150)).job;
    sql.prepare("UPDATE ai_render_jobs SET status = 'complete', request_id = 'el:gen_x', result_url = 'https://storage.googleapis.com/b/x.png' WHERE id = ?").run(elJob.id);
    elStatus = () => Response.json({}, { status: 503 });
    for (let i = 0; i < DELIVERY_ATTEMPTS + 1; i++) await deliverRender(db, { elevenlabs: 'el-test' }, await readRender(db, 't-el', elJob.id));
    check(job('t-el', elJob.id).status === 'complete' && job('t-el', elJob.id).delivery_failures === 0 && balance('t-el') === 250,
      'ElevenLabs status outage never refunds');
    check((await deliverRender(db, { fal: 'fal-test' }, await readRender(db, 't-el', elJob.id))).status === 503 && balance('t-el') === 250,
      'Missing provider key never refunds');
    elStatus = () => Response.json({}, { status: 404 });
    const elGone = await deliverRender(db, { elevenlabs: 'el-test' }, await readRender(db, 't-el', elJob.id));
    check(elGone.status === 410 && balance('t-el') === 400 && ledger('t-el', 'refund') === 1, 'Vanished ElevenLabs generation refunds once');
    // Delivered from ElevenLabs once, generation later gone: terminal, but never refunded.
    await paidAccount('t-el-delivered');
    const elDelivered = (await reserveRender(db, 't-el-delivered', id(), 150)).job;
    sql.prepare("UPDATE ai_render_jobs SET status = 'complete', request_id = 'el:gen_y' WHERE id = ?").run(elDelivered.id);
    elStatus = () => Response.json({ status: 'completed', content_url: 'https://storage.googleapis.com/bucket/y.png' });
    host = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'Content-Type': 'image/png' } });
    check((await deliverRender(db, { elevenlabs: 'el-test' }, await readRender(db, 't-el-delivered', elDelivered.id))).ok, 'ElevenLabs image delivered');
    elStatus = () => Response.json({}, { status: 404 });
    const later = await deliverRender(db, { elevenlabs: 'el-test' }, await readRender(db, 't-el-delivered', elDelivered.id));
    check(!later.ok && later.status === 502 && job('t-el-delivered', elDelivered.id).status === 'complete'
      && ledger('t-el-delivered', 'refund') === 0 && balance('t-el-delivered') === 250, 'Delivered, then expired: no refund');

    // Image route end to end.
    await paidAccount('t-img');
    const routeJob = (await reserveRender(db, 't-img', id(), 150)).job;
    complete('t-img', routeJob.id);
    host = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'Content-Type': 'image/jpeg' } });
    const img = await call('t-img', `/v1/ai/renders/${routeJob.id}/image`);
    check(img.status === 200 && img.headers.get('Content-Type') === 'image/jpeg' && (await img.arrayBuffer()).byteLength === 4, 'Image route serves the image');
    const notReady = (await reserveRender(db, 't-img2', id(), 0)).job;
    check((await call('t-img2', `/v1/ai/renders/${notReady.id}/image`)).status === 409, 'Image route: not ready');
    check(typeof refreshRender === 'function', 'refreshRender still exported');
  }

  sql.close();
  console.error = originalError;
  console.log(`Render B2 tests: ${checks} checks passed`);
} finally {
  console.error = originalError;
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
