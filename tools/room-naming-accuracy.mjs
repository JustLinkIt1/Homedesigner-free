// Score room auto-naming against the authored names in the shipped samples.
//
// Requires the harness to be running:
//   cd workers/design-sync
//   npx wrangler dev --remote --config wrangler.harness.jsonc --port 8799
//
//   node tools/room-naming-accuracy.mjs [--runs 3]
//
// Rooms are sent GROUPED BY PLAN AND FLOOR, which is how the client will call
// it and is not a detail: the prompt asks the model to pick the Master Bedroom
// by comparing bedrooms to each other, so scoring one room at a time would
// measure a feature nobody is shipping.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ENDPOINT = process.env.HARNESS_URL ?? 'http://127.0.0.1:8799';
const runs = Number(process.argv[process.argv.indexOf('--runs') + 1]) || 1;

/**
 * What counts as right.
 *
 * `accept` is judged against the closed set the model must choose from, not
 * against the authored string — "WC" is not in ROOM_TYPES, so demanding it
 * would measure the vocabulary rather than the model. Where a room is
 * genuinely two things at once (a great room, a studio) every honest reading
 * is accepted, because a human namer would disagree with themselves there too.
 *
 * `near` is a defensible-but-worse answer. Tracked separately rather than
 * folded into either bucket: for a rename suggestion the user can reject, the
 * gap between "wrong" and "not the word I'd use" is the whole story.
 */
const EXPECTED = {
  'Deck': { accept: ['Patio'], near: ['Balcony', 'Garden'] },
  'Terrace': { accept: ['Patio'], near: ['Balcony', 'Garden'] },
  'Lawn': { accept: ['Garden'], near: [] },
  'Front lawn': { accept: ['Garden'], near: [] },
  'Back lawn': { accept: ['Garden'], near: [] },
  'Side lawn': { accept: ['Garden'], near: [] },
  'Great Room': { accept: ['Living Room', 'Kitchen', 'Dining Room'], near: [] },
  'Living Room': { accept: ['Living Room'], near: ['Dining Room'] },
  'Sitting Room': { accept: ['Living Room'], near: ['Study'] },
  'Master Bedroom': { accept: ['Master Bedroom'], near: ['Bedroom'] },
  'Bedroom': { accept: ['Bedroom'], near: ['Master Bedroom'] },
  'Second Bedroom': { accept: ['Bedroom'], near: ['Master Bedroom', 'Office'] },
  'Kids Room': { accept: ['Bedroom'], near: ['Playroom'] },
  "Kids' Room": { accept: ['Bedroom'], near: ['Playroom'] },
  'Bathroom': { accept: ['Bathroom', 'En-suite'], near: ['Toilet'] },
  'WC': { accept: ['Toilet'], near: ['Bathroom'] },
  'Kitchen': { accept: ['Kitchen'], near: ['Dining Room'] },
  'Kitchen & Dining': { accept: ['Kitchen', 'Dining Room'], near: [] },
  'Dining Room': { accept: ['Dining Room'], near: ['Kitchen'] },
  'Hallway': { accept: ['Hallway'], near: ['Landing', 'Entrance'] },
  'Hall': { accept: ['Hallway', 'Entrance'], near: ['Landing'] },
  'Landing': { accept: ['Landing'], near: ['Hallway'] },
  'Laundry': { accept: ['Laundry', 'Utility'], near: [] },
  'Garage': { accept: ['Garage'], near: ['Storage'] },
  'Home Office': { accept: ['Office', 'Study'], near: [] },
  'Den': { accept: ['Office', 'Study'], near: ['Bedroom', 'Playroom'] },
  // A one-room flat that is bed, kitchen, sofa and shower at once. The closed
  // set has no word for it, so anything describing what is actually in there
  // is accepted; this room exists in the scoring to prove the model does not
  // produce something absurd, not to award a point for reading a mind.
  'Studio': { accept: ['Living Room', 'Bedroom', 'Master Bedroom', 'Kitchen'], near: [] },
  'Bonus Room': { accept: ['Playroom', 'Living Room'], near: ['Office', 'Storage'] },
  // No label in ROOM_TYPES means a driveway. Excluded from scoring and
  // reported as a vocabulary gap: the model cannot be right here.
  'Driveway': { unrepresentable: true },
};

const fixtures = JSON.parse(readFileSync(join(process.cwd(), 'tools', 'room-naming-fixtures.json'), 'utf8'));

const groups = new Map();
for (const fixture of fixtures) {
  const key = `${fixture.sample}/${fixture.floor}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(fixture);
}

const label = (n) => String(n).padEnd(18);
const tally = { accept: 0, near: 0, wrong: 0, missing: 0, scored: 0, skipped: 0 };
const latencies = [];
const wrongRows = [];
const confusion = new Map();

for (let run = 1; run <= runs; run += 1) {
  if (runs > 1) console.log(`\n──────── run ${run} of ${runs} ────────`);
  for (const [key, rooms] of groups) {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms: rooms.map((r) => r.summary) }),
    });
    const result = await response.json();
    if (!response.ok) {
      console.log(`\n${key}\n  REQUEST FAILED: ${result.error}`);
      tally.missing += rooms.length;
      continue;
    }
    latencies.push(result.ms);
    const byId = new Map(result.suggestions.map((s) => [s.id, s]));
    console.log(`\n${key}  (${rooms.length} rooms, ${result.ms}ms)`);
    for (const room of rooms) {
      const expected = EXPECTED[room.authored];
      const got = byId.get(room.summary.id);
      if (!expected) {
        console.log(`  ?     ${label(room.authored)} no expectation defined`);
        continue;
      }
      if (expected.unrepresentable) {
        tally.skipped += 1;
        console.log(`  skip  ${label(room.authored)} → ${got ? got.name : '(none)'}  [no valid label exists]`);
        continue;
      }
      tally.scored += 1;
      if (!got) {
        tally.missing += 1;
        console.log(`  ---   ${label(room.authored)} no suggestion returned`);
        continue;
      }
      const mark = expected.accept.includes(got.name) ? 'accept'
        : expected.near.includes(got.name) ? 'near' : 'wrong';
      tally[mark] += 1;
      const glyph = mark === 'accept' ? 'ok   ' : mark === 'near' ? '~    ' : 'WRONG';
      console.log(`  ${glyph} ${label(room.authored)} → ${String(got.name).padEnd(16)} ${got.confidence}`);
      if (mark !== 'accept') {
        wrongRows.push({ key, authored: room.authored, got: got.name, confidence: got.confidence, mark });
        const ck = `${room.authored} → ${got.name}`;
        confusion.set(ck, (confusion.get(ck) ?? 0) + 1);
      }
    }
  }
}

const pct = (n) => `${((n / tally.scored) * 100).toFixed(1)}%`;
console.log('\n════════ accuracy ════════');
console.log(`scored          ${tally.scored} rooms over ${runs} run(s)`);
console.log(`accepted        ${tally.accept}  ${pct(tally.accept)}`);
console.log(`near miss       ${tally.near}  ${pct(tally.near)}`);
console.log(`wrong           ${tally.wrong}  ${pct(tally.wrong)}`);
console.log(`no suggestion   ${tally.missing}  ${pct(tally.missing)}`);
console.log(`unscorable      ${tally.skipped}  (no label exists in ROOM_TYPES)`);
if (latencies.length) {
  latencies.sort((a, b) => a - b);
  console.log(`latency         median ${latencies[Math.floor(latencies.length / 2)]}ms, `
    + `worst ${latencies[latencies.length - 1]}ms, per plan`);
}

// The safety claim the prompt makes is that an unclear room comes back "low".
// If wrong answers arrive "high", the confidence field is decoration and the
// client must not lean on it to decide what to apply automatically.
const wrongHigh = wrongRows.filter((r) => r.mark === 'wrong' && r.confidence === 'high');
console.log('\n════════ confidence calibration ════════');
console.log(`wrong-but-confident   ${wrongHigh.length} of ${tally.wrong} wrong answers came back "high"`);
for (const row of wrongHigh) console.log(`  ${row.key}  ${row.authored} → ${row.got}`);

if (confusion.size) {
  console.log('\n════════ what it confuses ════════');
  for (const [pair, count] of [...confusion.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(2)}×  ${pair}`);
  }
}
