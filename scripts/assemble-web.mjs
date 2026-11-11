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

// The same app shell is served at three URLs. Search engines read three
// identical titles as duplicates and pick one at random, so each copy says
// which page it is: its own title and canonical, or noindex for the tool that
// is not meant to be found.
const ORIGIN = 'https://homedesignerapp.com';
const TITLE = /<title>[^<]*<\/title>/;
if (!TITLE.test(appHtml) || !appHtml.includes('</head>')) {
  throw new Error('App index.html has no <title> or </head> to specialise');
}
const forSearch = (html, { title, path, noindex }) =>
  html
    .replace(TITLE, `<title>${title}</title>`)
    .replace(
      '</head>',
      noindex
        ? '  <meta name="robots" content="noindex" />\n  </head>'
        : `  <link rel="canonical" href="${ORIGIN}${path}" />\n  </head>`,
    );
const underApp = (html) => html.replace('<head>', '<head>\n    <base href="/app/" />');

await writeFile(
  resolve(output, 'app', 'index.html'),
  forSearch(appHtml, {
    title: 'HomeDesigner Web App — Draw Floor Plans Online in 2D &amp; 3D',
    path: '/app/',
  }),
);
await writeFile(
  resolve(studioDir, 'index.html'),
  underApp(forSearch(appHtml, { title: 'HomeDesigner Model Studio', noindex: true })),
);
const communityDir = resolve(output, 'community');
await mkdir(communityDir, { recursive: true });
await writeFile(
  resolve(communityDir, 'index.html'),
  underApp(
    forSearch(appHtml, {
      title: 'HomeDesigner Community — Home Designs Shared by Users',
      path: '/community/',
    }),
  ),
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
