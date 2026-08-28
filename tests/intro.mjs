import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src', 'lib', 'introPref.ts'), 'utf8')
  .replace(/export /g, '')
  .replace(/: boolean/g, '')
  .replace(/: void/g, '');
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};
const api = new Function(`${source}; return { introEnabled, shouldPlayIntro, markIntroPlayed, setIntroEnabled };`)();
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};
check('intro: recurring animation defaults off', !api.introEnabled());
check('intro: a fresh install receives one automatic play', api.shouldPlayIntro());
api.markIntroPlayed();
check('intro: first play disables future automatic playback', !api.shouldPlayIntro());
api.setIntroEnabled(true);
check('intro: Settings can opt into playback again', api.shouldPlayIntro());
api.setIntroEnabled(false);
check('intro: Settings can turn playback back off', !api.shouldPlayIntro());

const app = readFileSync(join(process.cwd(), 'src', 'App.tsx'), 'utf8');
check('startup: 3D preloads without a hidden canvas',
  app.includes('const Scene3D = lazy(loadScene3D)') && app.includes('void loadScene3D().catch('));
if (failures) process.exit(1);
