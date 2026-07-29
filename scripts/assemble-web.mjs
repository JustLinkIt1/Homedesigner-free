import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const appDist = resolve(root, 'dist');
const landing = resolve(root, 'site');
const output = resolve(root, 'site-dist');

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'app'), { recursive: true });
await cp(landing, output, { recursive: true });
await cp(appDist, resolve(output, 'app'), { recursive: true });
await cp(resolve(appDist, 'privacy.html'), resolve(output, 'privacy.html'));
await cp(resolve(appDist, 'CNAME'), resolve(output, 'CNAME'));

console.log(`Assembled web deployment at ${output}`);
