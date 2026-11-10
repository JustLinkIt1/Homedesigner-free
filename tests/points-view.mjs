import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(process.cwd(), '.points-view-tests-'));
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
try {
  const out = join(dir, 'pointsStore.mjs');
  writeFileSync(out, ts.transpileModule(readFileSync('src/store/pointsStore.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText);
  const { usePointsStore: store } = await import(pathToFileURL(out).href);
  const snapshot = balance => ({ balance, packs: [], features: {}, cardCheckout: false });
  check(store.getState().balance === null, 'Unknown is not zero');
  store.getState().setSubject('a');
  const revision = store.getState().revision;
  store.getState().observe('a', '/v1/points', snapshot(0), revision);
  check(store.getState().balance === 0, 'Zero balance is displayed');
  store.getState().observe('a', '/v1/points', snapshot(6000), revision);
  check(store.getState().balance === 6000, 'Point pack balances supported');
  store.getState().observe('a', '/v1/ai/room-names', { balance: 5990 }, revision);
  check(store.getState().balance === 5990 && store.getState().state.balance === 5990, 'AI charge refreshes account and wallet');
  store.getState().observe('a', '/v1/points', snapshot(6000), revision);
  check(store.getState().balance === 5990, 'A pre-charge read cannot overwrite the charged balance');
  store.getState().observe('a', '/v1/ai/colour-scheme', { balance: 5965 }, revision);
  check(store.getState().balance === 5990, 'Concurrent mutation response waits for a fresh authoritative read');
  store.getState().observe('a', '/v1/points', snapshot(5965), store.getState().revision);
  check(store.getState().balance === 5965, 'Authoritative read reconciles concurrent charges');
  store.getState().observe('a', '/v1/points/play/claim', { balance: 7990 }, store.getState().revision);
  check(store.getState().balance === 7990, 'Purchase credit refreshes account');
  store.getState().observe('a', '/v1/ai/refund', { balance: -10 }, store.getState().revision);
  check(store.getState().balance === -10, 'Negative balances remain honest');
  for (const balance of [NaN, Infinity, 0.5, '2000', undefined]) {
    store.getState().observe('a', '/v1/points', snapshot(balance), store.getState().revision);
    check(store.getState().balance === -10, 'Malformed balance never appears');
  }
  store.getState().openWallet();
  const generation = store.getState().generation;
  store.getState().setSubject('b');
  check(store.getState().balance === null && store.getState().state === null, 'Account switch clears cached points');
  check(!store.getState().walletOpen, 'Account switch dismisses the old wallet');
  store.getState().observe('a', '/v1/points', snapshot(9999), store.getState().revision);
  check(store.getState().balance === null, 'Foreign-account responses ignored');
  store.getState().setSubject('a');
  check(store.getState().generation > generation, 'Account round trip invalidates old request generation');
  store.getState().setSubject(null);
  check(store.getState().balance === null, 'Sign-out does not retain a displayed balance');
  const api = readFileSync('src/lib/aiRender.ts', 'utf8');
  check(api.includes('accountGeneration !== usePointsStore.getState().generation'), 'Transport rejects account round-trip responses');
  const app = readFileSync('src/App.tsx', 'utf8');
  check(app.includes('usePointsStore.getState().walletOpen') && app.includes('usePointsStore.getState().closeWallet()'), 'Android back dismisses wallet');
  console.log(`Account points display: ${checks} checks passed`);
} finally { rmSync(dir, { recursive: true, force: true }); }
