// Repeatable AI quality gate. Never deploys, purchases, or calls an AI provider.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = process.argv.includes('--release');
const steps = [
  ['AI assistant regressions', ['tests/ai-features.mjs']],
  ['SQLite points/accounting regressions', ['tests/points.mjs']],
  ['Account balance display regressions', ['tests/points-view.mjs']],
  ['Point purchase recovery', ['tests/point-purchases.mjs']],
  ['Worker purchase routes', ['tests/point-routes.mjs']],
  ['Capture and AI-render regressions', ['tests/render.mjs']],
  ['Translation coverage', ['tests/i18n.mjs']],
  ['App typecheck', ['node_modules/typescript/bin/tsc', '--noEmit']],
  ['Worker typecheck', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'workers/design-sync/tsconfig.json']],
  ['Repository lint', ['node_modules/eslint/bin/eslint.js', '.', '--max-warnings', '0']],
];
if (release) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const command of pkg.scripts['test:ci'].split('&&').map(value => value.trim())) {
    const match = command.match(/^node (tests\/[a-zA-Z0-9_-]+\.mjs)$/);
    if (!match) throw new Error(`Review the changed CI command before running: ${command}`);
    steps.push([`Full CI: ${match[1]}`, [match[1]]]);
  }
  steps.push(
    ['Release typecheck', ['node_modules/typescript/bin/tsc', '-b']],
    ['Production build', ['node_modules/vite/bin/vite.js', 'build']],
    ['Web assembly', ['scripts/assemble-web.mjs']],
  );
}
for (const [label, args] of steps) {
  console.log(`\n${label}`);
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error(`${label} did not pass. Stop: this is not release approval.`);
    if (result.error) console.error(result.error.message);
    process.exit(result.status || 1);
  }
}
console.log(release
  ? '\nLocal release checks passed. Live device, billing and provider gates still apply.'
  : '\nFocused AI checks passed. Use --release for full CI/build; this is not release approval.');
