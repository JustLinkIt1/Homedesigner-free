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
  for (const name of ['index', 'community', 'points', 'ai-features', 'stripe', 'ai-render', 'entitlements']) {
    let source = readFileSync(`workers/design-sync/src/${name}.ts`, 'utf8');
    if (name === 'index') source += '\nexport { stripeWebhook, claimPlayPoints };\nexport function primeTestToken() { playAccessToken = { value: "test-only", expiresAt: Date.now() + 3600000 }; }';
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    writeFileSync(join(dir, `${name}.mjs`), compiled.replace(/from '(\.\/[a-z-]+)'/g, "from '$1.mjs'"));
  }
  const { stripeWebhook, claimPlayPoints, primeTestToken } = await import(pathToFileURL(join(dir, 'index.mjs')).href);
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
  sql.close();
  console.log(`Point routes: ${checks} checks passed`);
} finally { globalThis.fetch = originalFetch; rmSync(dir, { recursive: true, force: true }); }
