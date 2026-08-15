import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [access, appInfo, toolbar, projects, app, worker] = await Promise.all([
  readFile(join(root, 'src', 'lib', 'communityAccess.ts'), 'utf8'),
  readFile(join(root, 'src', 'lib', 'appInfo.ts'), 'utf8'),
  readFile(join(root, 'src', 'components', 'Toolbar.tsx'), 'utf8'),
  readFile(join(root, 'src', 'components', 'ProjectsScreen.tsx'), 'utf8'),
  readFile(join(root, 'src', 'community', 'CommunityApp.tsx'), 'utf8'),
  readFile(join(root, 'workers', 'design-sync', 'src', 'community.ts'), 'utf8'),
]);

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

check(
  'Android opens the canonical hosted community through Capacitor Browser',
  access.includes('await Browser.open({ url: COMMUNITY_URL })') &&
    appInfo.includes("https://homedesignerapp.com/community/"),
);
check(
  'community is directly reachable from project home and the editor menu',
  projects.includes('void openCommunityForum()') &&
    projects.includes("t('Community & support')") &&
    toolbar.includes('void openCommunityForum()') &&
    toolbar.includes("t('Community & support')"),
);
check(
  'client limits each post to four screenshots of at most 5 MB',
  app.includes('const MAX_SCREENSHOTS = 4') &&
    app.includes('const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024') &&
    app.includes('selected.length > MAX_SCREENSHOTS') &&
    app.includes('maximum 5 MB each'),
);
check(
  'Worker independently enforces count, bytes and decoded image type',
  worker.includes('const MAX_POST_IMAGES = 4') &&
    worker.includes('const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024') &&
    worker.includes('body.byteLength > maxBytes') &&
    worker.includes("if (!mimeType) throw new CommunityError('Use a PNG, JPEG or WebP image.', 415)"),
);
check(
  'post images are available to signed-in members, not only moderators',
  !worker.includes('Only moderators can add images to posts right now.') &&
    !app.includes('canPostImages'),
);

console.log(failures === 0 ? '\nCOMMUNITY: all green' : `\nCOMMUNITY: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
