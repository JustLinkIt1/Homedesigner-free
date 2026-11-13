// Make a "claim your plan" link from a plan description.
//
//   node tools/share-plan.mjs <blueprint.json> [--days 90] [--note "where it is going"]
//
// The blueprint is the same file tools/make-plan-sample.mjs renders: the AI
// plan format (title, widthCm, depthCm, floors with rooms and openings), with
// an optional "exterior" and "roof".
//
// Nothing is sent anywhere. This writes <blueprint>.share.sql next to the
// blueprint and prints the link it will answer to. Run that SQL against the
// homedesigner-community D1 database to make the link live:
//
//   cd workers/design-sync
//   npx wrangler d1 execute homedesigner-community --remote --file <path>.share.sql
//
// To withdraw a link, delete its row:
//
//   DELETE FROM shared_plans WHERE id = '<id>';
//
// The plan is the other person's. Keep links private to them, and withdraw
// one when asked.
import { randomInt } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args.splice(at, 2)[1] : undefined;
};
const days = Number(flag('--days') ?? 90);
const note = flag('--note') ?? '';
const [file] = args;
if (!file || !Number.isFinite(days) || days < 0) {
  console.error('usage: node tools/share-plan.mjs <blueprint.json> [--days 90] [--note text]');
  process.exit(2);
}

const bp = JSON.parse(readFileSync(file, 'utf8'));
// Only what the app reads. Notes, the model's working and anything else stay behind.
const payload = JSON.stringify({
  title: String(bp.title ?? 'Shared plan'),
  notes: '',
  widthCm: bp.widthCm,
  depthCm: bp.depthCm,
  furnished: bp.furnished !== false,
  floors: (bp.floors ?? []).map((floor) => ({
    rooms: floor.rooms.map(({ id, type, name, x, y, w, h }) => ({ id, type, name, x, y, w, h })),
    openings: floor.openings.map(({ kind, x, y, vertical, width, rooms }) => ({ kind, x, y, vertical, width, rooms })),
  })),
  ...(bp.exterior ? { exterior: bp.exterior } : {}),
  ...(bp.roof ? { roof: bp.roof } : {}),
});
if (payload.length > 60000) {
  console.error(`That plan is ${payload.length} characters; the limit is 60000.`);
  process.exit(1);
}

// 14 characters from a 36-letter alphabet, drawn from the system's secure
// source: about 72 bits, so a link cannot be guessed.
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const id = Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const quote = (text) => `'${String(text).replace(/'/g, "''")}'`;
const now = Date.now();
const expires = days > 0 ? now + days * 86400000 : 'NULL';
const sql = `INSERT INTO shared_plans (id, payload, note, created_at, expires_at) VALUES (${quote(id)}, ${quote(payload)}, ${note ? quote(note.slice(0, 200)) : 'NULL'}, ${now}, ${expires});\n`;
const out = file.replace(/\.json$/i, '') + '.share.sql';
writeFileSync(out, sql);

console.log(`id      ${id}`);
console.log(`link    https://homedesignerapp.com/app/?plan=${id}`);
console.log(`expires ${days > 0 ? new Date(now + days * 86400000).toISOString().slice(0, 10) : 'never'}`);
console.log(`sql     ${out} (${sql.length} characters; not applied)`);
