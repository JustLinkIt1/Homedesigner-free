import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// Keep runtime package resolution under this repo; no native esbuild process
// is necessary to exercise the real capture and Worker modules.
const dir = mkdtempSync(join(process.cwd(), '.render-tests-'));
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  const out = join(dir, 'tests.mjs');
  for (const [name, path] of [
    ['renderCapture', 'src/lib/renderCapture.ts'],
    ['points', 'workers/design-sync/src/points.ts'],
    ['ai-render', 'workers/design-sync/src/ai-render.ts'],
  ]) {
    const source = readFileSync(join(process.cwd(), path), 'utf8');
    const compiled = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replace("from './points'", "from './points.mjs'");
    writeFileSync(join(dir, `${name}.mjs`), compiled);
  }
  writeFileSync(out, "export * from './renderCapture.mjs'; export * from './ai-render.mjs';");
  const { captureDimensions, captureRenderer, reserveRender, readRender, failRender, freeRenderAvailable,
    validRenderImage, validRenderId, validResultUrl, validRenderStyle, renderPrompt, dispatchRender, refreshRender } = await import(pathToFileURL(out).href);
  for (const [w, h] of [[390, 844], [844, 390], [1440, 3200], [4096, 2160]]) {
    for (const scale of [2, 3, 4]) {
      const d = captureDimensions(w, h, scale, true);
      check(d.width * d.height <= 2_000_000 && Math.max(d.width, d.height) <= 2048, 'All mobile qualities fit GPU budget');
      check(Math.abs(d.width / d.height - w / h) < 0.01, 'Capture preserves framing');
    }
  }
  assert.throws(() => captureDimensions(0, 100, 2, true)); checks++;
  check(captureDimensions(1000, 1000, 4, false, 1024).width === 1024, 'GPU hardware limit wins');
  const fixture = ({ encodeFails = false, renderFails = false, lost = false } = {}) => {
    let ratio = 2; let target = 'original'; let dimensions = [400, 800];
    const context = { isContextLost: () => lost, MAX_VIEWPORT_DIMS: 1, MAX_RENDERBUFFER_SIZE: 2,
      getParameter: n => n === 1 ? [4096, 4096] : 4096 };
    const gl = { getContext: () => context, capabilities: { maxTextureSize: 4096 }, getPixelRatio: () => ratio,
      setPixelRatio: n => { ratio = n; }, getRenderTarget: () => target, setRenderTarget: t => { target = t; },
      setSize: (w, h) => { dimensions = [w, h]; }, render: () => { if (renderFails) throw new Error('driver failure'); },
      domElement: { toDataURL: () => { if (encodeFails) throw new Error('encode failure'); return 'data:image/png;base64,' + 'A'.repeat(200); } } };
    return { gl, restored: () => ratio === 2 && target === 'original' && dimensions[0] === 400 && dimensions[1] === 800 };
  };
  for (const failure of [{ encodeFails: true }, { renderFails: true }]) {
    const f = fixture(failure);
    assert.throws(() => captureRenderer(f.gl, {}, {}, { width: 400, height: 800 }, null, 4, true));
    check(f.restored(), 'Failure always restores live renderer');
  }
  const f = fixture(); let composerSize;
  captureRenderer(f.gl, {}, {}, { width: 400, height: 800 }, { setSize: (...n) => {
    composerSize = n;
    // Match postprocessing: setSize also resizes the shared renderer.
    f.gl.setSize(n[0], n[1]);
  }, render: () => { throw new Error('composer'); } }, 3, false);
  check(f.restored(), 'Broken composer falls back to plain renderer');
  check(composerSize[0] === 400 && composerSize[1] === 800 && composerSize[2] === false, 'Composer restores CSS dimensions without multiplying DPR or changing CSS');
  assert.throws(() => captureRenderer(fixture({ lost: true }).gl, {}, {}, { width: 400, height: 800 }, null, 2, true)); checks++;

  const sql = new DatabaseSync(':memory:');
  for (const file of ['0004_points.sql', '0005_ai_renders.sql', '0006_ai_render_styles.sql', '0007_purchase_settlement.sql', '0008_ai_render_watermark.sql']) sql.exec(readFileSync(`workers/design-sync/migrations/${file}`, 'utf8'));
  const db = { prepare(query) {
    const stmt = sql.prepare(query);
    const bound = args => ({ first: async () => stmt.get(...args) ?? null,
      run: async () => ({ meta: { changes: stmt.run(...args).changes } }), all: async () => ({ results: stmt.all(...args) }) });
    return { ...bound([]), bind: (...args) => bound(args) };
  } };
  const id = () => crypto.randomUUID();
  const firstId = id();
  const first = await reserveRender(db, 'pro-a', firstId, 0);
  check(first.created && first.job.charge === 0, 'First render is free without points');
  check(!(await freeRenderAvailable(db, 'pro-a')), 'Free allowance reserved before dispatch');
  const replay = await reserveRender(db, 'pro-a', firstId, 0);
  check(!replay.created, 'Repeated POST never dispatches again');
  await assert.rejects(reserveRender(db, 'pro-a', id(), 150), /already in progress/); checks++;
  await failRender(db, 'pro-a', firstId, 'failure');
  check(await freeRenderAvailable(db, 'pro-a'), 'Failed free render restores allowance');
  check(!(await reserveRender(db, 'pro-a', firstId, 0)).created, 'Failed key cannot be reused');
  const second = await reserveRender(db, 'pro-a', id(), 0);
  sql.prepare("UPDATE ai_render_jobs SET status = 'complete' WHERE subject = ? AND id = ?").run('pro-a', second.job.id);
  await assert.rejects(reserveRender(db, 'pro-a', id(), 0), /price or free allowance changed/); checks++;
  await assert.rejects(reserveRender(db, 'pro-a', id(), 150), /Not enough/); checks++;
  sql.prepare('UPDATE point_accounts SET balance = 400 WHERE subject = ?').run('pro-a');
  const paid = await reserveRender(db, 'pro-a', id(), 150);
  check(paid.job.charge === 150 && sql.prepare('SELECT balance FROM point_accounts WHERE subject = ?').get('pro-a').balance === 250, 'Paid job debits exactly once');
  await Promise.all([failRender(db, 'pro-a', paid.job.id, 'failed'), failRender(db, 'pro-a', paid.job.id, 'failed')]);
  check(sql.prepare('SELECT balance FROM point_accounts WHERE subject = ?').get('pro-a').balance === 400, 'Concurrent refunds credit once');
  check(sql.prepare("SELECT COUNT(*) AS n FROM point_ledger WHERE kind='refund'").get().n === 1, 'Exactly one refund audit row');
  check(!(await freeRenderAvailable(db, 'pro-a')), 'Paid failure does not grant a second free render');
  check(await readRender(db, 'other-account', firstId) === null, 'Other account cannot read a job');
  const raceId = id();
  const raced = await Promise.all([reserveRender(db, 'pro-race', raceId, 0), reserveRender(db, 'pro-race', raceId, 0)]);
  check(raced.filter(r => r.created).length === 1, 'Concurrent duplicate submission has one dispatch owner');
  check(sql.prepare('SELECT COUNT(*) AS n FROM ai_render_allowances WHERE subject = ?').get('pro-race').n === 0, 'Allowance stores a hash, not the raw account ID');
  // Watermark terms: free accounts pay less with the watermark, a premium without; Pro is clean at the base price.
  const { renderTerms, publicRender } = await import(pathToFileURL(out).href);
  const freeMarked = renderTerms({ isPro: false, watermark: true });
  const freeClean = renderTerms({ isPro: false, watermark: false });
  const proTerms = renderTerms({ isPro: true, watermark: true });
  check(freeMarked.marked && freeMarked.price === 150 && !freeMarked.freeEligible, 'Free account: watermarked render at the base price, never free');
  check(!freeClean.marked && freeClean.price === 200 && !freeClean.freeEligible, 'Free account: clean render costs the premium and is never the free one');
  check(!proTerms.marked && proTerms.price === 150 && proTerms.freeEligible, 'Pro: always clean at the base price');
  check(!renderTerms().marked && renderTerms().price === 150, 'An older app (no options) renders clean, as Pro did');
  sql.prepare('INSERT INTO point_accounts(subject, balance, created_at, updated_at) VALUES (?, 400, 0, 0)').run('free-a');
  await assert.rejects(reserveRender(db, 'free-a', id(), 0, 'photorealistic', { isPro: false, watermark: true }), /price or free allowance changed/); checks++;
  await assert.rejects(reserveRender(db, 'free-a', id(), 150, 'photorealistic', { isPro: false, watermark: false }), /price or free allowance changed/); checks++;
  const cleanPaid = await reserveRender(db, 'free-a', id(), 200, 'photorealistic', { isPro: false, watermark: false });
  check(cleanPaid.job.charge === 200 && cleanPaid.job.watermark === 0 && publicRender(cleanPaid.job).watermark === false
    && sql.prepare('SELECT balance FROM point_accounts WHERE subject = ?').get('free-a').balance === 200, 'Clean render debits the premium');
  sql.prepare("UPDATE ai_render_jobs SET status = 'complete' WHERE subject = ?").run('free-a');
  const markedPaid = await reserveRender(db, 'free-a', id(), 150, 'photorealistic', { isPro: false, watermark: true });
  check(markedPaid.job.charge === 150 && markedPaid.job.watermark === 1
    && publicRender(markedPaid.job).watermark === true
    && sql.prepare('SELECT balance FROM point_accounts WHERE subject = ?').get('free-a').balance === 50, 'Watermarked render debits the lower price');
  sql.prepare("UPDATE ai_render_jobs SET status = 'complete' WHERE subject = ?").run('free-a');
  // A free account never uses up the free render that Pro would later give it.
  check(await freeRenderAvailable(db, 'free-a'), 'Paid renders on a free account leave the Pro free render untouched');
  const upgraded = await reserveRender(db, 'free-a', id(), 0, 'photorealistic', { isPro: true, watermark: true });
  check(upgraded.job.charge === 0 && upgraded.job.watermark === 0, 'After upgrading, the first Pro render is free and clean');
  check(validRenderImage('data:image/jpeg;base64,/9j/AAAA'), 'Accept bounded JPEG input');
  for (const input of ['https://internal/image', 'data:image/svg+xml;base64,AAAA', 'data:image/jpeg;base64,/9j/' + 'A'.repeat(2_800_000)]) check(!validRenderImage(input), 'Reject remote URLs, wrong types and oversized input');
  check(validRenderId(id()) && !validRenderId('../../account'), 'Validate job identifiers');
  check(validRenderStyle('modern') && !validRenderStyle('custom prompt'), 'Only server-owned render styles are accepted');
  check(renderPrompt('scandinavian').includes('Scandinavian') && renderPrompt('scandinavian').includes('exact same room layout'), 'Style prompt preserves geometry');
  for (const url of ['https://evil.test/a', 'http://fal.media/a', 'https://fal.media.evil.test/a', 'https://user:pass@fal.media/a']) check(!validResultUrl(url), 'Reject unsafe generated asset URL');
  check(validResultUrl('https://v3b.fal.media/files/a.jpg'), 'Allow fal result host');

  // Real SDK, stubbed HTTP: no vendor charge or account data involved.
  const originalFetch = globalThis.fetch;
  let calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/status')) return Response.json({ status: 'COMPLETED' });
    if (String(url).includes('/requests/')) return Response.json({ images: [{ url: 'https://v3.fal.media/result.jpg' }], has_nsfw_concepts: [false] });
    return Response.json({ request_id: 'test-vendor-request' });
  };
  try {
    await dispatchRender(db, 'test-key', raced[0].job, 'data:image/jpeg;base64,/9j/AAAA');
    const queued = await readRender(db, 'pro-race', raceId);
    check(queued.status === 'queued' && queued.request_id === 'test-vendor-request', 'Submission stores vendor job ID');
    const payload = JSON.parse(calls[0].init.body);
    check(payload.num_images === 1 && payload.guidance_scale === 3.5 && payload.safety_tolerance === '2', 'Provider input fixes cost and safety options');
    check(!('subject' in payload), 'No account identity sent to fal');
    check(payload.prompt.includes('Photorealistic') || payload.prompt.includes('Preserve the existing colours'), 'Selected style is expanded only on the server');
    const done = await refreshRender(db, 'test-key', queued);
    check(done.status === 'complete', 'Completed job is reusable without another charge');
    const rejected = await reserveRender(db, 'pro-rejected', id(), 0);
    let attempts = 0;
    globalThis.fetch = async () => { attempts++; return Response.json({ detail: 'unavailable' }, { status: 503 }); };
    await dispatchRender(db, 'test-key', rejected.job, 'data:image/jpeg;base64,/9j/AAAA');
    check(attempts === 1, 'SDK retry cannot submit a second billable request');
    check((await readRender(db, 'pro-rejected', rejected.job.id)).status === 'failed', 'Rejected submission is terminal');
    check(await freeRenderAvailable(db, 'pro-rejected'), 'Rejected submission refunds the free allowance');
    const stale = await reserveRender(db, 'pro-stale', id(), 0);
    sql.prepare("UPDATE ai_render_jobs SET status = 'queued', request_id = 'stale', created_at = ? WHERE subject = ?").run(Date.now() - 31 * 60_000, 'pro-stale');
    check((await refreshRender(db, 'test-key', await readRender(db, 'pro-stale', stale.job.id))).status === 'failed', 'A stuck job cannot block the account forever');
    check(await freeRenderAvailable(db, 'pro-stale'), 'Timed-out job returns allowance');

    // ElevenLabs first, fal as the backup. Stubbed HTTP only.
    const { renderAspect, renderAvailable, renderImageUrl, validElevenLabsAssetUrl, ELEVENLABS_IMAGE_MODEL } = await import(pathToFileURL(out).href);
    const portrait = (() => {
      const bytes = [0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 844 >> 8, 844 & 255, 390 >> 8, 390 & 255, 3, ...new Array(24).fill(0)];
      return 'data:image/jpeg;base64,' + Buffer.from(bytes).toString('base64');
    })();
    check(portrait.startsWith('data:image/jpeg;base64,/9j/'), 'Fixture is a JPEG data URL');
    const keys = { fal: 'fal-test', elevenlabs: 'el-test' };
    let elCalls = []; let falCalls = 0; let elStatus = { status: 'completed', content_url: 'https://storage.googleapis.com/bucket/one.png' };
    let elCreate = () => Response.json({ id: 'gen_1', status: 'pending' });
    globalThis.fetch = async (url, init = {}) => {
      const href = String(url);
      if (href.startsWith('https://api.elevenlabs.io/')) {
        elCalls.push({ href, init });
        return init.method === 'POST' ? elCreate() : Response.json(elStatus);
      }
      falCalls++;
      if (href.includes('/status')) return Response.json({ status: 'COMPLETED' });
      if (href.includes('/requests/')) return Response.json({ images: [{ url: 'https://v3.fal.media/backup.jpg' }], has_nsfw_concepts: [false] });
      return Response.json({ request_id: 'fal-backup-request' });
    };
    const elJob = (await reserveRender(db, 'pro-el', id(), 0)).job;
    await dispatchRender(db, keys, elJob, portrait);
    const elQueued = await readRender(db, 'pro-el', elJob.id);
    check(elQueued.status === 'queued' && elQueued.request_id === 'el:gen_1', 'ElevenLabs generation id is stored with its prefix');
    check(falCalls === 0, 'fal is not called when ElevenLabs accepts the render');
    const elBody = JSON.parse(elCalls[0].init.body);
    check(elBody.model_id === ELEVENLABS_IMAGE_MODEL && elBody.resolution === '1K' && elBody.aspect_ratio === '9:16', 'Fixed model, size and the capture aspect ratio');
    check(elBody.images[0].type === 'inline_base64' && elBody.images[0].content_base64 === portrait.split(',')[1], 'The capture is sent inline, never as a URL');
    check(elCalls[0].init.headers['xi-api-key'] === 'el-test' && !('subject' in elBody), 'Key in the header, no account identity sent');
    check(elBody.prompt === renderPrompt('photorealistic'), 'Same server-owned prompt as fal');
    const elDone = await refreshRender(db, keys, elQueued);
    check(elDone.status === 'complete', 'Completed ElevenLabs generation completes the job');
    elStatus = { status: 'completed', content_url: 'https://storage.googleapis.com/bucket/fresh.png' };
    check(await renderImageUrl(keys, elDone) === 'https://storage.googleapis.com/bucket/fresh.png', 'Image route asks ElevenLabs for a fresh signed link');
    elStatus = { status: 'completed', content_url: 'https://evil.test/one.png' };
    check(await renderImageUrl(keys, elDone) === null, 'A link to an unexpected host is never fetched');
    check(await renderImageUrl({ fal: 'fal-test' }, elDone) === null, 'No ElevenLabs key, no ElevenLabs download');

    elCalls = []; falCalls = 0;
    elCreate = () => Response.json({ detail: [{ msg: 'model unavailable' }] }, { status: 422 });
    const backupJob = (await reserveRender(db, 'pro-backup', id(), 0)).job;
    await dispatchRender(db, keys, backupJob, portrait);
    const backup = await readRender(db, 'pro-backup', backupJob.id);
    check(elCalls.length === 1 && backup.status === 'queued' && backup.request_id === 'fal-backup-request', 'Refused by ElevenLabs, rendered by fal');
    check((await refreshRender(db, keys, backup)).status === 'complete', 'fal backup job completes as before');
    elCreate = () => { throw new TypeError('network down'); };
    const offlineJob = (await reserveRender(db, 'pro-offline', id(), 0)).job;
    await dispatchRender(db, keys, offlineJob, portrait);
    check((await readRender(db, 'pro-offline', offlineJob.id)).request_id === 'fal-backup-request', 'Unreachable ElevenLabs also falls back to fal');
    const noBackupJob = (await reserveRender(db, 'pro-nobackup', id(), 0)).job;
    await dispatchRender(db, { elevenlabs: 'el-test' }, noBackupJob, portrait);
    check((await readRender(db, 'pro-nobackup', noBackupJob.id)).status === 'failed' && await freeRenderAvailable(db, 'pro-nobackup'),
      'No provider could start it: job fails and the allowance returns');

    elCreate = () => Response.json({ id: 'gen_bad' });
    elStatus = { status: 'failed', failure_reason: 'moderated' };
    const failedJob = (await reserveRender(db, 'pro-elfail', id(), 0)).job;
    await dispatchRender(db, keys, failedJob, portrait);
    const failed = await refreshRender(db, keys, await readRender(db, 'pro-elfail', failedJob.id));
    check(failed.status === 'failed' && await freeRenderAvailable(db, 'pro-elfail'), 'Failed ElevenLabs generation refunds');
    elStatus = { status: 'generating' };
    const slowJob = (await reserveRender(db, 'pro-slow', id(), 0)).job;
    await dispatchRender(db, keys, slowJob, portrait);
    check((await refreshRender(db, keys, await readRender(db, 'pro-slow', slowJob.id))).status === 'queued', 'Still generating stays queued');

    check(renderAspect(1600, 900) === '16:9' && renderAspect(1000, 1000) === '1:1' && renderAspect(390, 844) === '9:16' && renderAspect(1200, 800) === '3:2',
      'Nearest supported aspect ratio');
    check(renderAvailable({ elevenlabs: 'k' }) && renderAvailable({ fal: 'k' }) && !renderAvailable({ fal: ' ' }), 'Either provider enables rendering');
    for (const url of ['https://evil.test/a.png', 'http://storage.googleapis.com/a.png', 'https://storage.googleapis.com.evil.test/a', 'https://u:p@storage.googleapis.com/a'])
      check(!validElevenLabsAssetUrl(url), 'Reject unsafe ElevenLabs asset URL');
  } finally { globalThis.fetch = originalFetch; }
  sql.close();
  console.log(`Render tests: ${checks} checks passed`);
} finally { rmSync(dir, { recursive: true, force: true }); }
