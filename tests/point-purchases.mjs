import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'hd-point-purchases-'));
try {
  const out = join(dir, 'pointPurchases.mjs');
  writeFileSync(out, ts.transpileModule(readFileSync('src/lib/pointPurchases.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText);
  const { restorePointPurchases, withPointBalanceRefresh } = await import(pathToFileURL(out).href);
  const pack = (token, state = 1, product = 'points_2000') => ({ purchaseToken: token, purchaseState: state, products: [product] });
  const claimed = [];
  await assert.rejects(restorePointPurchases([
    pack('pending', 2), pack('foreign'), pack('valid'), pack('pro', 1, 'points_6000_pro'), pack('not-points', 1, 'pro_lifetime'),
  ], async p => {
    if (p.purchaseState !== 1) throw new Error('Payment pending.');
    if (p.purchaseToken === 'foreign') throw new Error('Different account.');
    claimed.push(p.purchaseToken);
  }, () => true), /2 point purchase\(s\).*Payment pending/);
  assert.deepEqual(claimed, ['valid', 'pro']);
  let sameAccount = true;
  const switching = [];
  await assert.rejects(restorePointPurchases([pack('first'), pack('second')], async p => {
    switching.push(p.purchaseToken); sameAccount = false;
  }, () => sameAccount), /Account changed/);
  assert.deepEqual(switching, ['first']);
  await restorePointPurchases([], async () => assert.fail('No purchases to claim'), () => true);
  let refreshed = 0;
  const failure = new Error('Receipt consume timed out');
  await assert.rejects(withPointBalanceRefresh(async () => { throw failure; }, async () => { refreshed++; }), e => e === failure);
  assert.equal(refreshed, 1);
  await assert.rejects(withPointBalanceRefresh(async () => { throw failure; }, async () => { throw new Error('Offline'); }), e => e === failure);
  await withPointBalanceRefresh(async () => {}, async () => { refreshed++; });
  assert.equal(refreshed, 2);
  await assert.rejects(withPointBalanceRefresh(async () => {}, async () => { throw new Error('Refresh failed'); }), /Refresh failed/);
  console.log('Point purchase recovery: 11 checks passed');
} finally { rmSync(dir, { recursive: true, force: true }); }
