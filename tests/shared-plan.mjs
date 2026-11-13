// Shared plans: a plan handed to someone by link (/app/?plan=<id>).
//
// The link carries only an id. The Worker returns a small plan description
// stored under it and the app builds the project. Three things matter and none
// needs a browser:
//
//   * the id: only well-formed ids are ever sent to the server;
//   * the response is network input: every field is checked and copied, and a
//     plan the builder could not make is refused rather than half-loaded;
//   * the Worker returns a row only while it exists and has not expired.
//
//   node tests/shared-plan.mjs
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'hdshare-'));
let app, worker, plans;
try {
  const bundle = async (entry, name) => {
    const outfile = join(dir, name);
    await build({
      entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
      define: { 'import.meta.env.VITE_CLOUD_SYNC_URL': '"https://sync.example.com/"', 'import.meta.env.BASE_URL': '"/app/"' },
    });
    return import(pathToFileURL(outfile).href);
  };
  app = await bundle('src/lib/sharedPlan.ts', 'shared.mjs');
  plans = await bundle('src/lib/aiPlan.ts', 'plan.mjs');
  worker = await bundle('workers/design-sync/src/shared-plans.ts', 'worker.mjs');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
const { sharedPlanId, parseSharedPlan, fetchSharedPlan } = app;
const { SHARED_PLAN_PATH, readSharedPlan, countSharedPlanOpen } = worker;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` -- ${detail}`}`);
  if (!ok) failures++;
};

const good = () => ({
  title: 'Two bed cottage', notes: 'from a drawing', widthCm: 800, depthCm: 600, furnished: true,
  floors: [{
    rooms: [
      { id: 'liv', type: 'living', name: 'Living room', x: 0, y: 0, w: 450, h: 600 },
      { id: 'bed', type: 'bedroom', name: 'Bedroom', x: 450, y: 0, w: 350, h: 600 },
    ],
    openings: [
      { kind: 'entrance', x: 200, y: 600, vertical: false, width: 95, rooms: ['liv'] },
      { kind: 'door', x: 450, y: 300, vertical: true, width: 80, rooms: ['liv', 'bed'] },
      { kind: 'bay', x: 225, y: 0, vertical: false, width: 200, rooms: ['liv'] },
    ],
  }],
  exterior: { color: '#9c5a44', material: 'brick_wall_001' },
  roof: { type: 'gable', pitch: 40, overhang: 35, thickness: 18, covering: 'tile', coveringScaleCm: 100, color: '#8c4f38' },
});

// ---- the id
check('id: read from the query string', sharedPlanId('?plan=k3v9q2m8x4tz') === 'k3v9q2m8x4tz');
check('id: other parameters are kept apart', sharedPlanId('?utm_source=x&plan=abcdefghij12&buy=pro') === 'abcdefghij12');
check('id: missing, short, long or odd ids are refused',
  [ '', '?plan=', '?plan=short', `?plan=${'a'.repeat(25)}`, '?plan=ABCDEFGHIJKL', '?plan=../../v1/account', '?plan=abc%2Fdefghijk' ]
    .every((q) => sharedPlanId(q) === null));

// ---- the plan
{
  const parsed = parseSharedPlan(good());
  check('a well-formed plan is accepted', !!parsed && parsed.blueprint.floors[0].rooms.length === 2 && parsed.blueprint.floors[0].openings.length === 3);
  check('finish and roof come through', parsed.exterior.material === 'brick_wall_001' && parsed.roof.type === 'gable' && parsed.roof.pitch === 40);
  check('notes and source never come from a link', parsed.blueprint.notes === '' && parsed.blueprint.source === null);
  const snap = plans.blueprintToSnapshot(parsed.blueprint, { allowPro: false, exterior: parsed.exterior, roof: parsed.roof });
  const geom = Object.values(snap.floorGeom)[0];
  check('the builder makes a furnished project from it',
    geom.rooms.length === 2 && geom.walls.length >= 4 && geom.openings.some((o) => o.style === 'bay') && geom.furniture.length > 0,
    JSON.stringify({ rooms: geom.rooms.length, walls: geom.walls.length, furniture: geom.furniture.length }));

  const extra = good();
  extra.floors[0].rooms[0].script = '<img onerror=alert(1)>';
  extra.roof.texture = { dataUrl: 'data:image/png;base64,AAAA' };
  extra.owner = 'someone';
  const cleaned = parseSharedPlan(extra);
  check('unknown fields are not copied', !('script' in cleaned.blueprint.floors[0].rooms[0]) && !('texture' in cleaned.roof) && !('owner' in cleaned.blueprint));
}
{
  const bad = (edit) => { const p = good(); edit(p); return parseSharedPlan(p); };
  check('not a plan: refused', parseSharedPlan(null) === null && parseSharedPlan('x') === null && parseSharedPlan({ title: 'x' }) === null);
  check('unknown room type: refused', bad((p) => { p.floors[0].rooms[0].type = 'dungeon'; }) === null);
  check('unknown opening kind: refused', bad((p) => { p.floors[0].openings[0].kind = 'portal'; }) === null);
  check('absurd sizes: refused',
    bad((p) => { p.widthCm = 5e6; }) === null && bad((p) => { p.floors[0].rooms[0].w = 99999; }) === null
    && bad((p) => { p.floors[0].openings[0].width = 5000; }) === null && bad((p) => { p.floors[0].rooms[0].x = 1e9; }) === null);
  check('too many rooms: refused', bad((p) => {
    p.floors[0].rooms = Array.from({ length: 61 }, (_, i) => ({ id: `r${i}`, type: 'storage', name: 'Store', x: i * 100, y: 0, w: 100, h: 100 }));
  }) === null);
  check('over-long names: refused', bad((p) => { p.floors[0].rooms[0].name = 'x'.repeat(61); }) === null);
  const plain = bad((p) => { p.exterior = { color: 'red' }; p.roof.pitch = 500; });
  check('a bad finish or roof is dropped, the plan still opens', !!plain && plain.exterior === undefined && plain.roof === undefined);
  const noMat = bad((p) => { p.exterior.material = '../../etc/passwd'; });
  check('a bad material name is dropped, the colour kept', noMat.exterior.color === '#9c5a44' && !('material' in noMat.exterior));
  check('an empty title gets a name', bad((p) => { p.title = '   '; }).blueprint.title === 'Shared plan');
}

// ---- fetching
{
  const realFetch = globalThis.fetch;
  const calls = [];
  const respond = (status, body) => { globalThis.fetch = async (url) => { calls.push(String(url)); return new Response(JSON.stringify(body), { status }); }; };
  try {
    respond(200, { plan: good() });
    const ok = await fetchSharedPlan('k3v9q2m8x4tz');
    check('fetch: asks the Worker for that id only', ok.ok === true && calls.at(-1) === 'https://sync.example.com/v1/plans/shared/k3v9q2m8x4tz');
    respond(404, { error: 'gone' });
    const gone = await fetchSharedPlan('k3v9q2m8x4tz');
    check('fetch: a withdrawn link is "gone"', gone.ok === false && gone.reason === 'gone');
    respond(200, { plan: { title: 'nonsense' } });
    const junk = await fetchSharedPlan('k3v9q2m8x4tz');
    check('fetch: an unreadable plan is "gone", not a crash', junk.ok === false && junk.reason === 'gone');
    respond(503, { error: 'later' });
    const later = await fetchSharedPlan('k3v9q2m8x4tz');
    check('fetch: a server error is worth retrying', later.ok === false && later.reason === 'failed');
    globalThis.fetch = async () => { throw new TypeError('offline'); };
    const offline = await fetchSharedPlan('k3v9q2m8x4tz');
    check('fetch: offline is worth retrying', offline.ok === false && offline.reason === 'failed');
    const before = calls.length;
    respond(200, { plan: good() });
    const odd = await fetchSharedPlan('../account');
    check('fetch: a malformed id is never sent', odd.ok === false && calls.length === before);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---- the Worker
{
  check('route: matches a shared plan id', '/v1/plans/shared/k3v9q2m8x4tz'.match(SHARED_PLAN_PATH)?.[1] === 'k3v9q2m8x4tz');
  check('route: nothing else',
    ['/v1/plans/shared/', '/v1/plans/shared/short', '/v1/plans/shared/ABCDEFGHIJKL', '/v1/plans/shared/abcdefghijkl/x', '/v1/plans/shared/abc..defghij']
      .every((path) => !SHARED_PLAN_PATH.test(path)));

  // A stand-in for D1 holding rows the way the migration defines them.
  const rows = new Map([
    ['liveplan000001', { payload: JSON.stringify(good()), expires_at: null, opened: 0, last_opened_at: null }],
    ['oldplan0000001', { payload: JSON.stringify(good()), expires_at: 1000, opened: 0, last_opened_at: null }],
    ['brokenplan0001', { payload: '{not json', expires_at: null, opened: 0, last_opened_at: null }],
  ]);
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (!sql.startsWith('SELECT payload FROM shared_plans')) throw new Error(`unexpected read: ${sql}`);
              const [id, now] = args;
              const row = rows.get(id);
              return row && (row.expires_at === null || row.expires_at > now) ? { payload: row.payload } : null;
            },
            async run() {
              if (!sql.startsWith('UPDATE shared_plans SET opened = opened + 1')) throw new Error(`unexpected write: ${sql}`);
              const [now, id] = args;
              const row = rows.get(id);
              if (row) { row.opened += 1; row.last_opened_at = now; }
            },
          };
        },
      };
    },
  };
  const live = await readSharedPlan(db, 'liveplan000001', 5000);
  check('worker: returns a stored plan the app accepts', !!parseSharedPlan(live));
  check('worker: unknown id is nothing', await readSharedPlan(db, 'nosuchplan0001', 5000) === null);
  check('worker: an expired link is nothing', await readSharedPlan(db, 'oldplan0000001', 5000) === null);
  check('worker: an unreadable row is nothing', await readSharedPlan(db, 'brokenplan0001', 5000) === null);
  await countSharedPlanOpen(db, 'liveplan000001', 7000);
  check('worker: opens are counted', rows.get('liveplan000001').opened === 1 && rows.get('liveplan000001').last_opened_at === 7000);
}

console.log(failures === 0 ? '\nSHARED PLAN: all green' : `\nSHARED PLAN: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
