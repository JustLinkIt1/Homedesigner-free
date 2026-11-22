// Free-project gate: bundled samples don't count toward the one free project,
// and a user's own 2nd project is still what hits the Pro wall.
//
//   node tests/project-gate.mjs
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const rootImport = root.replaceAll('\\', '/');
const dir = mkdtempSync(join(tmpdir(), 'hdgate-'));
const entry = join(root, '.gate-entry.tmp.ts');
writeFileSync(entry, `export * from '${rootImport}/src/lib/projects.ts';`);
const out = join(dir, 'bundle.mjs');

// projects.ts touches localStorage at import time.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

let mod;
try {
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out });
  mod = await import(pathToFileURL(out).href);
} finally {
  rmSync(entry, { force: true });
}
const { createProject, countOwnProjects, listProjects, deleteProject, noteSampleSave, isSample } = mod;

let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) fails++;
};

check('fresh install has no own projects', countOwnProjects() === 0);
createProject('Studio flat', { sample: true });
createProject('Family house', { sample: true });
check('opened samples are listed but not counted', listProjects().length === 2 && countOwnProjects() === 0);
// The gate in ProjectsScreen is `countOwnProjects() >= 1 && !isPro`.
check('a sample never trips the wall (first own project is free)', !(countOwnProjects() >= 1));
const own = createProject('My home');
check('first own project is counted', countOwnProjects() === 1);
check('the user\'s 2nd own project hits the wall', countOwnProjects() >= 1);
check('samples still do not count beside an own project', listProjects().length === 3 && countOwnProjects() === 1);
deleteProject(own);
check('deleting the own project frees the slot', countOwnProjects() === 0);
const samples = listProjects();
deleteProject(samples[0].id);
check('deleting a sample keeps the count right', countOwnProjects() === 0 && listProjects().length === 1);
check('sample id set is pruned on delete', JSON.parse(store.get('homedesigner.projects.samples.v1')).length === 1);

// Decision 22 Nov: a sample's first saved edit makes it the user's own project.
const sample = createProject('Loft', { sample: true });
const before = countOwnProjects();
check('opening a sample: the first save records it, nothing counted', noteSampleSave(sample, 'A') === false && countOwnProjects() === before);
check('re-saving the unchanged sample does not claim it', noteSampleSave(sample, 'A') === false && isSample(sample));
check('the first edit claims it', noteSampleSave(sample, 'B') === true && !isSample(sample) && countOwnProjects() === before + 1);
check('later saves of a claimed project do nothing', noteSampleSave(sample, 'C') === false && countOwnProjects() === before + 1);

const src = readFileSync(join(root, 'src/components/ProjectsScreen.tsx'), 'utf8');
check('openSample no longer calls requirePro', !/projects:sample'\)/.test(src) && !/openSample[\s\S]{0,300}requirePro/.test(src));
check('new project is gated on the own-project count', /countOwnProjects\(\) >= 1 && !requirePro\('projects', 'projects:new'\)/.test(src));

rmSync(dir, { recursive: true, force: true });
if (fails) { console.error(`\n${fails} check(s) failed`); process.exit(1); }
console.log('\nall project-gate checks passed');
