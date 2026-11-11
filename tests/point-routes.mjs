// Actual Worker handlers + SQLite; provider HTTP is stubbed, never paid/live.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const dir = mkdtempSync(join(process.cwd(), 'workers/design-sync/.point-routes-'));
const originalFetch = globalThis.fetch;
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
try {
  for (const name of ['index', 'community', 'points', 'ai-features', 'ai-advisor', 'ai-providers', 'ai-plan', 'stripe', 'ai-render', 'entitlements']) {
    let source = readFileSync(`workers/design-sync/src/${name}.ts`, 'utf8');
    if (name === 'index') source += '\nexport { stripeWebhook, claimPlayPoints, reviewDesign, narrateTour, designPlan };\nexport function primeTestToken() { playAccessToken = { value: "test-only", expiresAt: Date.now() + 3600000 }; }';
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    writeFileSync(join(dir, `${name}.mjs`), compiled.replace(/from '(\.\/[a-z-]+)'/g, "from '$1.mjs'"));
  }
  const { stripeWebhook, claimPlayPoints, reviewDesign, narrateTour, designPlan, primeTestToken } = await import(pathToFileURL(join(dir, 'index.mjs')).href);
  const { creditPurchase } = await import(pathToFileURL(join(dir, 'points.mjs')).href);
  primeTestToken();
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0003_play_purchases.sql', '0004_points.sql', '0007_purchase_settlement.sql']) sql.exec(readFileSync(`workers/design-sync/migrations/${file}`, 'utf8'));
  const db = {
    prepare(query) {
      const stmt = sql.prepare(query);
      const bound = args => ({
        first: async () => stmt.get(...args) ?? null,
        all: async () => ({ results: stmt.all(...args) }),
        run: async () => ({ meta: { changes: stmt.run(...args).changes } }),
        execute: () => ({ meta: { changes: stmt.run(...args).changes } }),
      });
      return { ...bound([]), bind: (...args) => bound(args) };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results = statements.map(s => s.execute()); sql.exec('COMMIT'); return results; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  const env = { COMMUNITY: db, STRIPE_WEBHOOK_SECRET: 'test-only-secret', REVENUECAT_PROJECT_ID: 'test', REVENUECAT_SECRET_KEY: 'test-only' };
  const balance = subject => sql.prepare('SELECT balance FROM point_accounts WHERE subject = ?').get(subject)?.balance ?? 0;
  async function stripe(type, session, valid = true) {
    const payload = JSON.stringify({ type, data: { object: session } });
    const timestamp = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
    const signature = Buffer.from(mac).toString('hex');
    return stripeWebhook(new Request('https://test.local/v1/points/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${timestamp},v1=${valid ? signature : 'bad'}` }, body: payload }), env);
  }
  const session = { id: 'test-session', payment_status: 'unpaid', amount_total: 199, metadata: { subject: 'stripe-owner', packId: 'points_2000' } };
  check((await stripe('checkout.session.completed', session)).status === 200 && balance('stripe-owner') === 0, 'Unpaid completion never credits');
  session.payment_status = 'paid';
  check((await stripe('checkout.session.async_payment_succeeded', session)).status === 200 && balance('stripe-owner') === 2000, 'Delayed success credits');
  await stripe('checkout.session.completed', session);
  await stripe('checkout.session.async_payment_succeeded', session);
  check(balance('stripe-owner') === 2000, 'Both event types replay without double credit');
  check((await stripe('checkout.session.completed', { ...session, id: 'forged' }, false)).status === 400, 'Invalid signature rejected');
  check((await stripe('checkout.session.completed', { ...session, metadata: { ...session.metadata, subject: 'other' } })).status === 503 && balance('other') === 0, 'Conflicting paid receipt is not acknowledged as fulfilled');

  const subject = 'play-owner';
  const binding = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`homedesigner-play:${subject}`))).toString('hex');
  const token = 'test-token-12345678901234567890';
  let productId = 'points_2000_pro';
  let accountId = binding;
  let state = 'PURCHASED';
  let consumed = false;
  let consumeCalls = 0;
  let entitlementCalls = 0;
  globalThis.fetch = async url => {
    const address = String(url);
    if (address.includes('/purchases/productsv2/tokens/')) return Response.json({
      purchaseStateContext: { purchaseState: state }, obfuscatedExternalAccountId: accountId,
      productLineItem: [{ productId, productOfferDetails: { quantity: 1, consumptionState: consumed ? 'CONSUMPTION_STATE_CONSUMED' : 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED' } }],
    });
    if (address.endsWith(':consume')) {
      check(sql.prepare('SELECT purchase_settled FROM point_ledger WHERE id = ?').get(`purchase:play:${token}`)?.purchase_settled === 1, 'Consumption only occurs after settled credit');
      consumeCalls++; consumed = true; return new Response(null, { status: 204 });
    }
    if (address.startsWith('https://api.revenuecat.com/')) { entitlementCalls++; return new Response(null, { status: 404 }); }
    throw new Error(`Unexpected network request: ${address}`);
  };
  const claim = () => claimPlayPoints(new Request('https://test.local/v1/points/play/claim', { method: 'POST', body: JSON.stringify({ purchaseToken: token }) }), env, { subject, email: null, emailVerified: true });
  check((await claim()).status === 403 && balance(subject) === 0, 'Uncredited Pro SKU still requires Pro');
  await creditPurchase(db, subject, 'points_2000', 'play', token, 140);
  entitlementCalls = 0;
  check((await claim()).status === 200 && consumeCalls === 1 && entitlementCalls === 0, 'Settled Pro receipt restores after Pro expires');
  check((await claim()).status === 200 && consumeCalls === 1 && balance(subject) === 2000, 'Consumed replay neither consumes nor credits twice');
  accountId = 'different-account';
  check((await claim()).status === 409 && consumeCalls === 1, 'Cross-account receipt is never consumed');
  accountId = binding; state = 'PENDING';
  check((await claim()).status === 402 && consumeCalls === 1, 'Pending payment cannot credit or consume');
  state = 'PURCHASED'; productId = 'pro_lifetime';
  check((await claim()).status === 402, 'Non-point product cannot become points');

  // ---- Designer review and voice tour: charge, refund and the Pro gate ----
  // Claude and ElevenLabs are stubbed at fetch; nothing here is a live call.
  const aiUser = { subject: 'ai-owner', email: null, emailVerified: true };
  await creditPurchase(db, aiUser.subject, 'points_2000', 'stripe', 'test-ai-topup', 199);
  const planBody = (extra = {}) => JSON.stringify({
    rooms: [{ id: 'living', areaSqm: 20, widthCm: 500, depthCm: 400, furniture: ['sofa'] }],
    roomNames: { living: 'Lounge' }, language: 'en', idempotencyKey: crypto.randomUUID(), ...extra,
  });
  const post = (path, body) => new Request(`https://test.local${path}`, { method: 'POST', body });
  const claudeMessage = (payload, stop = 'end_turn') => Response.json({
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 },
  });
  const reviewPayload = {
    score: 6, summary: 'A compact plan with one furnished living room and little else so far.',
    suggestions: [
      { room_id: 'living', title: 'Add a dining spot', detail: 'A small table by the window gives the room a second use.', impact: 'high' },
      { room_id: '', title: 'Plan a bedroom', detail: 'The home has nowhere to sleep yet; add a room of about nine square metres.', impact: 'medium' },
    ],
  };
  let claudeCalls = 0, voiceCalls = 0, claudeReply = () => claudeMessage(reviewPayload), sentToClaude = null;
  globalThis.fetch = async (url, init) => {
    const address = String(url instanceof Request ? url.url : url);
    if (address.startsWith('https://api.anthropic.com/')) {
      claudeCalls++;
      sentToClaude = JSON.parse(typeof init?.body === 'string' ? init.body : await new Response(init?.body ?? (url instanceof Request ? url.body : null)).text());
      return claudeReply();
    }
    if (address.startsWith('https://api.elevenlabs.io/')) {
      voiceCalls++;
      return new Response(new Uint8Array(4000).fill(7), { headers: { 'Content-Type': 'audio/mpeg' } });
    }
    if (address.startsWith('https://api.revenuecat.com/')) return new Response(null, { status: 404 });
    throw new Error(`Unexpected network request: ${address}`);
  };

  const noKeys = await reviewDesign(post('/v1/ai/design-review', planBody()), env, aiUser);
  check(noKeys.status === 503 && balance(aiUser.subject) === 2000 && claudeCalls === 0, 'Review without a provider key neither charges nor calls out');

  const aiEnv = { ...env, ANTHROPIC_API_KEY: 'test-only', ELEVENLABS_API_KEY: 'test-only' };
  const badPicture = await reviewDesign(post('/v1/ai/design-review', planBody({ image: 'https://example.com/plan.jpg' })), aiEnv, aiUser);
  check(badPicture.status === 400 && balance(aiUser.subject) === 2000 && claudeCalls === 0, 'A refused picture is rejected before any charge');

  const reviewed = await reviewDesign(post('/v1/ai/design-review', planBody({ focus: 'two kids' })), aiEnv, aiUser);
  const reviewJson = await reviewed.json();
  check(reviewed.status === 200 && reviewJson.charged === 200 && balance(aiUser.subject) === 1800, 'A successful review charges its listed price once');
  check(reviewJson.review.suggestions.length === 2 && reviewJson.review.suggestions[1].roomId === null, 'The review is validated before it is returned');
  check(sentToClaude.model === 'claude-opus-5-5' && sentToClaude.max_tokens === 2400
    && sentToClaude.output_config.format.type === 'json_schema' && !('thinking' in sentToClaude) && !('temperature' in sentToClaude),
    'Claude is asked for schema-bound JSON within the priced token ceiling');
  check(JSON.stringify(sentToClaude.messages).includes('two kids') && JSON.stringify(sentToClaude.messages).includes('Lounge')
    && !sentToClaude.system.includes('Lounge'), 'User text travels in the user turn, never the system prompt');

  claudeReply = () => Response.json({ type: 'error', error: { type: 'api_error', message: 'boom' } }, { status: 500 });
  const failed = await reviewDesign(post('/v1/ai/design-review', planBody()), aiEnv, aiUser);
  check(failed.status === 502 && (await failed.json()).refunded === true && balance(aiUser.subject) === 1800, 'A provider failure refunds the review');

  claudeReply = () => claudeMessage({}, 'refusal');
  const refused = await reviewDesign(post('/v1/ai/design-review', planBody()), aiEnv, aiUser);
  check(refused.status === 502 && balance(aiUser.subject) === 1800, 'A declined review is refunded');

  claudeReply = () => claudeMessage({ ...reviewPayload, suggestions: [] });
  const empty = await reviewDesign(post('/v1/ai/design-review', planBody()), aiEnv, aiUser);
  check(empty.status === 502 && balance(aiUser.subject) === 1800, 'An unusable review is refunded, not sold');

  const tourScript = 'Welcome to this home. The living room is about twenty square metres and is furnished with a sofa. '
    + 'It is the only room so far, so there is plenty of space to plan the rest of the home around it.';
  claudeReply = () => claudeMessage({ script: tourScript });
  const before = claudeCalls;
  const notPro = await narrateTour(post('/v1/ai/voice-tour', planBody()), aiEnv, aiUser);
  check(notPro.status === 403 && balance(aiUser.subject) === 1800 && claudeCalls === before && voiceCalls === 0,
    'Voice tour refuses a free account before charging or calling a provider');

  sql.prepare("INSERT INTO play_purchases(purchase_token, product_id, account_subject, status, last_verified_at) VALUES ('test-pro', 'pro_lifetime', ?, 'active', ?)")
    .run(aiUser.subject, Date.now());
  const toured = await narrateTour(post('/v1/ai/voice-tour', planBody({ projectName: 'My Home' })), aiEnv, aiUser);
  const tourJson = await toured.json();
  check(toured.status === 200 && tourJson.charged === 250 && balance(aiUser.subject) === 1550 && voiceCalls === 1, 'A Pro voice tour charges once and records once');
  check(tourJson.tour.mime === 'audio/mpeg' && Buffer.from(tourJson.tour.audio, 'base64').length === 4000 && tourJson.tour.script === tourScript,
    'The tour returns the script and the recording');

  claudeReply = () => claudeMessage({ script: 'Hi.' });
  const tooShort = await narrateTour(post('/v1/ai/voice-tour', planBody()), aiEnv, aiUser);
  check(tooShort.status === 502 && balance(aiUser.subject) === 1550 && voiceCalls === 1, 'A script not worth recording is refunded before any narration is bought');

  // ---- AI plan: one price per generation, Pro for more than one storey ----
  const planner = await import(pathToFileURL(join(dir, 'ai-plan.mjs')).href);
  const planBriefOf = (patch = {}) => ({ storeys: 1, bedrooms: 3, bathrooms: 1, areaSqm: 112, furnished: true, garage: false, wishes: 'bright and calm', ...patch });
  const modelPlan = JSON.parse(planner.planPrompt(planBriefOf(), 'en').system.split('\n').find((line) => line.startsWith('{"title"')));
  const planUser = { subject: 'plan-free', email: null, emailVerified: true };
  await creditPurchase(db, planUser.subject, 'points_2000', 'stripe', 'test-plan-topup', 199);
  const planRequest = (extra = {}, patch = {}) => post('/v1/ai/plan', JSON.stringify({
    brief: planBriefOf(patch), language: 'en', idempotencyKey: crypto.randomUUID(), ...extra,
  }));
  claudeReply = () => claudeMessage(modelPlan);
  let callsBefore = claudeCalls;

  check((await designPlan(planRequest(), env, planUser)).status === 503 && claudeCalls === callsBefore, 'Plan without a provider key neither charges nor calls out');
  check((await designPlan(planRequest({}, { bedrooms: 6, areaSqm: 40 }), aiEnv, planUser)).status === 400
    && balance(planUser.subject) === 2000 && claudeCalls === callsBefore, 'An impossible brief is refused before any charge');
  check((await designPlan(planRequest({}, { storeys: 2, areaSqm: 160 }), aiEnv, planUser)).status === 403
    && balance(planUser.subject) === 2000 && claudeCalls === callsBefore, 'A free account cannot buy a multi-storey plan');

  const drawn = await designPlan(planRequest(), aiEnv, planUser);
  const drawnJson = await drawn.json();
  check(drawn.status === 200 && drawnJson.charged === 300 && balance(planUser.subject) === 1700, 'A new plan charges its listed price once');
  check(drawnJson.plan.floors[0].rooms.length === 10 && drawnJson.plan.furnished === true
    && drawnJson.plan.floors[0].openings.some((opening) => opening.kind === 'entrance'), 'The plan comes back as exact, connected geometry');
  check(sentToClaude.max_tokens === 4000 && sentToClaude.output_config.effort === 'medium'
    && sentToClaude.output_config.format.type === 'json_schema' && JSON.stringify(sentToClaude.messages).includes('bright and calm')
    && !sentToClaude.system.includes('bright and calm'), 'Claude gets the brief in the user turn, within the priced ceiling');

  const revised = await designPlan(planRequest({ previous: drawnJson.plan.source, change: 'make the kitchen bigger' }), aiEnv, planUser);
  check(revised.status === 200 && balance(planUser.subject) === 1400
    && JSON.stringify(sentToClaude.messages).includes('make the kitchen bigger') && JSON.stringify(sentToClaude.messages).includes('r7'),
    'A revision sends the current plan and the change, and costs the same');

  callsBefore = claudeCalls;
  check((await designPlan(planRequest({ previous: { title: 'nonsense' }, change: 'bigger' }), aiEnv, planUser)).status === 400
    && (await designPlan(planRequest({ previous: drawnJson.plan.source, change: 'x' }), aiEnv, planUser)).status === 400
    && balance(planUser.subject) === 1400 && claudeCalls === callsBefore, 'A malformed revision is refused before any charge');
  const twoFloors = { ...drawnJson.plan.source, floors: [drawnJson.plan.source.floors[0], drawnJson.plan.source.floors[0]] };
  check((await designPlan(planRequest({ previous: twoFloors, change: 'make it bigger' }), aiEnv, planUser)).status === 400
    && claudeCalls === callsBefore, 'A revision cannot smuggle in duplicate rooms');

  claudeReply = () => claudeMessage({ ...modelPlan, floors: [] });
  const unusable = await designPlan(planRequest(), aiEnv, planUser);
  check(unusable.status === 502 && (await unusable.json()).refunded === true && balance(planUser.subject) === 1400, 'A plan that cannot be built is refunded, not sold');

  const openRequest = new Request('https://test.local/v1/ai/capabilities');
  const worker = (await import(pathToFileURL(join(dir, 'index.mjs')).href)).default;
  const capabilities = await (await worker.fetch(openRequest, aiEnv, { waitUntil() {} })).json();
  const none = await (await worker.fetch(openRequest, env, { waitUntil() {} })).json();
  check(capabilities.plan_design === true && capabilities.voice_tour === true && none.plan_design === false && none.design_review === false,
    'Anyone can ask which AI tools are switched on, and learns nothing else');

  sql.close();
  console.log(`Point routes: ${checks} checks passed`);
} finally { globalThis.fetch = originalFetch; rmSync(dir, { recursive: true, force: true }); }
