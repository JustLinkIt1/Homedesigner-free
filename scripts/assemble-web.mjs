import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const appDist = resolve(root, 'dist');
const landing = resolve(root, 'site');
const output = resolve(root, 'site-dist');

await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'app'), { recursive: true });
await cp(landing, output, { recursive: true });
await cp(appDist, resolve(output, 'app'), { recursive: true });
const studioDir = resolve(output, 'app', 'model-studio');
await mkdir(studioDir, { recursive: true });
const appHtml = await readFile(resolve(appDist, 'index.html'), 'utf8');
await writeFile(
  resolve(studioDir, 'index.html'),
  appHtml.replace('<head>', '<head>\n    <base href="/app/" />'),
);
await cp(resolve(appDist, 'privacy.html'), resolve(output, 'privacy.html'));
await cp(resolve(appDist, 'CNAME'), resolve(output, 'CNAME'));

// Fail the deployment build if Vite ever stops using a per-deployment asset
// namespace, or if the real 404 page disappears and Cloudflare Pages would
// resume its SPA fallback for missing JavaScript files.
const assetReferences = [...appHtml.matchAll(/(?:src|href)="\.\/assets\/([^/]+)\//g)];
const assetNamespaces = new Set(assetReferences.map((match) => match[1]));
if (assetReferences.length === 0 || assetNamespaces.size !== 1) {
  throw new Error('Expected every app entry asset to share one deployment namespace');
}
await readFile(resolve(output, '404.html'), 'utf8');

console.log(
  `Assembled web deployment at ${output} (asset namespace: ${[...assetNamespaces][0]})`,
);
