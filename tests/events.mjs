// Client side of the anonymous first-session events: install id, source,
// once-per-session rules, batching and the offline queue.
//
//   node tests/events.mjs
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdevents-'));
const entry = join(root, '.events-entry.tmp.ts');
writeFileSync(entry, `export * from '${rootImport}/src/lib/events.ts';`);
const out = join(dir, 'bundle.mjs');

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
const listeners = {};
globalThis.document = { visibilityState: 'visible', addEventListener: (n, f) => { listeners[n] = f; } };
globalThis.window = { setTimeout, clearTimeout, addEventListener: () => {} };
const sent = [];
let online = true;
globalThis.fetch = async (url, init) => {
  if (!online) throw new TypeError('offline');
  sent.push({ url, body: JSON.parse(init.body) });
  return { status: 202 };
};

let mod;
try {
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out,
    define: { 'import.meta.env.VITE_CLOUD_SYNC_URL': '"https://sync.example.test/"', __APP_VERSION__: '"1.23.0"' },
  });
  mod = await import(pathToFileURL(out).href);
} finally {
  rmSync(entry, { force: true });
}
const { sourceFromReferrer, trackEvent, initEvents, flush } = mod;

let checks = 0;
const check = (v, label) => { assert.ok(v, label); checks++; };

check(sourceFromReferrer('') === 'organic', 'empty referrer is organic');
check(sourceFromReferrer('utm_source=google-play&utm_medium=organic') === 'organic', 'Play organic referrer is organic');
check(sourceFromReferrer('utm_source=google-play&utm_campaign=Spring Sale') === 'google-play:spring-sale', 'source:campaign, slugged');
check(sourceFromReferrer('utm_source=newsletter') === 'newsletter', 'source alone');
check(sourceFromReferrer('utm_source=(not set)&utm_medium=(not set)') === 'organic', '(not set) is organic');
check(sourceFromReferrer('utm_source=' + 'a'.repeat(200)).length <= 64, 'capped at 64');

initEvents();
check(store.get('homedesigner.firstOpen.v1') === '1', 'first open remembered');
trackEvent('template_chosen', 'Open Plan', { once: true });
trackEvent('template_chosen', 'family-house', { once: true });
trackEvent('editor_opened', undefined, { once: true });
trackEvent('editor_opened', undefined, { once: true });
trackEvent('view_3d_opened', undefined, { once: true });
trackEvent('import_result', 'ok');
trackEvent('pro_wall_shown', 'projects:new');
trackEvent('pro_wall_shown', 'projects:new');
for (const kind of ['png', 'pdf', 'dxf', 'ifc']) trackEvent('export', kind);
await flush();
check(sent.length === 1, 'one batched request');
const body = sent[0].body;
check(sent[0].url === 'https://sync.example.test/v1/events', 'posts to the worker base URL');
check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.install) && body.install === store.get('homedesigner.install.v1'), 'v4 install id, stored');
check(body.app_version === '1.23.0' && body.source === 'web', 'version and web source');
const names = body.events.map((e) => e.event);
check(names.join() === 'app_first_open,template_chosen,editor_opened,view_3d_opened,import_result,pro_wall_shown,pro_wall_shown,export,export,export,export', 'once-per-session steps fire once; import/pro wall/export are not deduped');
check(body.events.slice(-4).map((e) => e.detail).join() === 'png,pdf,dxf,ifc', 'export carries its kind as the detail');
check(body.events[1].detail === 'open-plan', 'detail is slugged');
check(Object.keys(body).sort().join() === 'app_version,events,install,source', 'body carries nothing else');

// A second launch keeps the install id and does not repeat app_first_open.
const id = store.get('homedesigner.install.v1');
sent.length = 0;
initEvents();
check(store.get('homedesigner.install.v1') === id, 'install id is stable');
await flush();
check(sent.length === 0, 'no second app_first_open');

// Offline: events wait, then go out; the queue is capped at 50.
online = false;
for (let i = 0; i < 70; i++) trackEvent('import_result', 'fail');
await flush();
check(sent.length === 0, 'offline sends nothing and does not throw');
online = true;
await flush();
await flush();
await flush();
const total = sent.reduce((n, r) => n + r.body.events.length, 0);
check(total === 50 && sent.every((r) => r.body.events.length <= 20), 'queue capped at 50, requests at 20 events');
// The first launch after an update (projects already on the phone) is an
// upgrade: remembered, not reported as app_first_open.
sent.length = 0;
store.delete('homedesigner.firstOpen.v1');
store.set('homedesigner.projects.index.v1', '[]');
initEvents();
await flush();
check(store.get('homedesigner.firstOpen.v1') === 'upgrade', 'upgrade remembered as such');
check(!sent.some((r) => r.body.events.some((e) => e.event === 'app_first_open')), 'an upgrade sends no app_first_open');

// More than one request's worth queued: the rest goes out without another event.
sent.length = 0;
for (let i = 0; i < 50; i++) trackEvent('import_result', 'ok');
await flush();
await new Promise((resolve) => setTimeout(resolve, 3_400)); // the pending 2 s flush, then the re-armed one
check(sent.reduce((n, r) => n + r.body.events.length, 0) === 50, 'a long queue drains on its own');
// The Pro checkout funnel: one event name, the stage as the detail, nothing else.
sent.length = 0;
const { trackProCheckout, PRO_CHECKOUT_STAGES } = mod;
for (const stage of PRO_CHECKOUT_STAGES) trackProCheckout(stage);
trackEvent('pro_checkout', 'yearly');
trackEvent('pro_checkout', '9.99-eur');
trackEvent('pro_checkout', 'google:12345');
trackEvent('pro_checkout');
await flush();
const funnel = sent.flatMap((r) => r.body.events).filter((e) => e.event === 'pro_checkout');
check(funnel.map((e) => e.detail).join() === 'signin_click,signin_ok,checkout_open,paid,cancel', 'pro_checkout sends the five stages and drops anything else');
check(funnel.every((e) => Object.keys(e).sort().join() === 'detail,event'), 'a pro_checkout event is only { event, detail }');
console.log(`events: ${checks} checks passed`);
