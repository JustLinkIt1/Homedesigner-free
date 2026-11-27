// When the app asks Google Play for its in-app review card.
//
// Play never reports whether the card was shown, and it is against Play policy
// to ask too often or to wrap the card in the app's own questions, so the only
// thing the app controls is WHEN it asks. That lives in src/lib/reviewPolicy.ts
// as plain functions, and these checks run them directly:
//
//   * right after the first thing that goes well, on the first day (EXEC
//     cycle 249), but never on a sample's or the first-3D auto-open's frame;
//   * once in a lifetime: an install with any request on record, including
//     states from older builds with counts up to 3, is never asked again;
//   * nothing on the web, nothing while a paywall is open;
//   * unreadable storage means "do not ask", never "ask again";
//   * no failure escapes to the export or render that triggered it.
//
//   node tests/review-policy.mjs
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const dir = mkdtempSync(join(tmpdir(), 'hdreview-'));
let mod;
try {
  const out = join(dir, 'reviewPolicy.mjs');
  writeFileSync(out, ts.transpileModule(readFileSync('src/lib/reviewPolicy.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText);
  mod = await import(pathToFileURL(out).href);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const {
  REVIEW_COOLDOWN_MS, REVIEW_MAX_REQUESTS, REVIEW_MIN_DAYS, REVIEW_MIN_MOMENTS,
  createImportMoment, createReviewPrompt, legacyReviewState, localDay, parseReviewState, serializeReviewState,
  shouldRequestReview, withMoment, withOpen, withRequest,
} = mod;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Local noon, so adding whole days always lands on the next calendar day.
const T0 = new Date(2026, 0, 10, 12).getTime();
const day = (n) => T0 + n * DAY_MS;
const fresh = () => parseReviewState(null, T0);
const ctx = (now, extra = {}) => ({ android: true, now, dialogOpen: false, askedThisSession: false, ...extra });
/** Opened on `days` consecutive days, with `moments` good moments on the last. */
const engaged = (days, moments) => {
  let state = fresh();
  for (let i = 0; i < days; i++) state = withOpen(state, day(i));
  for (let i = 0; i < moments; i++) state = withMoment(state, day(days - 1));
  return state;
};

// ---- the numbers themselves -------------------------------------------------
check('thresholds: 1 day, 1 moment, 1 in a lifetime (90-day cooldown kept)',
  REVIEW_MIN_DAYS === 1 && REVIEW_MIN_MOMENTS === 1 && REVIEW_COOLDOWN_MS === 90 * DAY_MS && REVIEW_MAX_REQUESTS === 1);
check('a calendar day is the local date', localDay(new Date(2026, 2, 5, 23, 59).getTime()) === '2026-03-05'
  && localDay(new Date(2026, 2, 6, 0, 1).getTime()) === '2026-03-06');

// ---- engagement gates -------------------------------------------------------
{
  const first = withMoment(withOpen(fresh(), T0), T0 + 60_000);
  check('first day, one moment: asks', shouldRequestReview(first, ctx(T0 + 60_000)));
  check('first day, opened but nothing went well: does not ask', !shouldRequestReview(withOpen(fresh(), T0), ctx(T0)));
  check('a moment with no open recorded still counts its day and asks',
    shouldRequestReview(withMoment(fresh(), T0), ctx(T0)));
  check('no days, one moment (impossible state): does not ask',
    !shouldRequestReview({ days: [], moments: 1, requests: 0, lastRequestAt: null }, ctx(T0)));
  check('two days and two moments still ask', shouldRequestReview(engaged(2, 2), ctx(day(1))));

  let sameDay = fresh();
  for (let i = 0; i < 6; i++) sameDay = withOpen(sameDay, T0 + i * 3_600_000);
  check('reopening on the same day counts one day', sameDay.days.length === 1);

  let moments = fresh();
  moments = withMoment(withMoment(moments, day(0)), day(1));
  moments = withMoment(moments, day(1));
  check('a moment counts its own day when no open was recorded', moments.days.length === 1 && moments.moments === 3);

  const many = engaged(40, 2);
  check('only the first day is kept', many.days.length === 1 && many.days[0] === localDay(day(0)));
  check('an open that changes nothing returns the same state', withOpen(many, day(50)) === many);
}

// ---- where and when it may not ask ------------------------------------------
{
  const ready = engaged(2, 2);
  check('web and other platforms never ask', !shouldRequestReview(ready, ctx(day(1), { android: false })));
  check('not while a paywall or other dialog is open', !shouldRequestReview(ready, ctx(day(1), { dialogOpen: true })));
  check('once per app launch', !shouldRequestReview(ready, ctx(day(1), { askedThisSession: true })));
}

// ---- the lifetime cap: once per install ---------------------------------------
{
  const asked = withRequest(engaged(1, 1), day(0));
  check('a request is recorded', asked.requests === 1 && asked.lastRequestAt === day(0));
  check('already asked once: not the next day', !shouldRequestReview(withMoment(asked, day(1)), ctx(day(1))));
  check('already asked once: not 90 days later', !shouldRequestReview(asked, ctx(day(0) + REVIEW_COOLDOWN_MS)));
  check('already asked once: not ten years later', !shouldRequestReview(asked, ctx(day(3650))));
  check('clock moved back before the last request: does not ask', !shouldRequestReview(asked, ctx(day(0) - DAY_MS)));

  let state = engaged(2, 2);
  let now = day(1);
  let granted = 0;
  for (let i = 0; i < 12; i++) {
    if (shouldRequestReview(state, ctx(now))) { granted += 1; state = withRequest(state, now); }
    now += REVIEW_COOLDOWN_MS;
  }
  check('lifetime cap: one request over three years of trying', granted === 1 && state.requests === 1, `granted ${granted}`);
  check('after the cap it never asks, however long it waits', !shouldRequestReview(state, ctx(now + 20 * REVIEW_COOLDOWN_MS)));

  // States written by builds with the old 2-day / 3-request policy.
  for (const requests of [1, 2, 3]) {
    const old = parseReviewState(JSON.stringify({
      v: 1, days: ['2026-01-10', '2026-01-11'], moments: 7, requests, lastRequestAt: day(-400),
    }), day(0));
    check(`old state asked ${requests}x a year ago: never asked again`, old.requests === requests
      && !shouldRequestReview(withMoment(old, day(0)), ctx(day(0))) && !shouldRequestReview(old, ctx(day(3000))));
  }
  const oldUnasked = parseReviewState(JSON.stringify({
    v: 1, days: ['2026-01-10', '2026-01-11'], moments: 1, requests: 0, lastRequestAt: null,
  }), day(5));
  check('old state, two days kept, never asked: trimmed to one day, next moment asks',
    oldUnasked.days.join() === '2026-01-10' && shouldRequestReview(withMoment(oldUnasked, day(5)), ctx(day(5))));
}

// ---- storage ----------------------------------------------------------------
{
  const ready = engaged(2, 2);
  const round = parseReviewState(serializeReviewState(ready), day(1));
  check('state survives a round trip', JSON.stringify(round) === JSON.stringify(ready));

  for (const empty of [null, undefined, '']) {
    const state = parseReviewState(empty, T0);
    check(`missing storage (${JSON.stringify(empty)}) is a new install`,
      state.days.length === 0 && state.moments === 0 && state.requests === 0 && state.lastRequestAt === null);
  }

  for (const junk of ['{', 'not json', '42', '"text"', 'null', '[]', 'true']) {
    const state = parseReviewState(junk, T0);
    check(`corrupt storage ${junk}: counts as asked just now`,
      state.requests >= 1 && state.lastRequestAt === T0 && !shouldRequestReview(withMoment(withMoment(state, T0), T0), ctx(T0)));
    // Even once the engagement gates are met again, the 90 days still apply.
    let later = state;
    for (let i = 0; i < 3; i++) later = withMoment(later, day(i));
    check(`corrupt storage ${junk}: no request inside 90 days`, !shouldRequestReview(later, ctx(T0 + REVIEW_COOLDOWN_MS - 1)));
  }

  const fields = parseReviewState(JSON.stringify({
    days: ['2026-01-10', '2026-01-10', 'yesterday', 7, null, '2026-01-11'], moments: 'lots', requests: 0, lastRequestAt: null,
  }), T0);
  check('bad fields are dropped, good ones kept',
    fields.days.join() === '2026-01-10' && fields.moments === 0 && fields.requests === 0 && fields.lastRequestAt === null);

  const wrongTypes = parseReviewState(JSON.stringify({ days: 'x', moments: -4, requests: 0 }), T0);
  check('wrong types read as zero engagement', wrongTypes.days.length === 0 && wrongTypes.moments === 0);

  const badCount = parseReviewState(JSON.stringify({ days: ready.days, moments: 9, requests: 'two', lastRequestAt: 5 }), day(400));
  check('unreadable request count: treated as the cap reached', badCount.requests === REVIEW_MAX_REQUESTS
    && !shouldRequestReview(badCount, ctx(day(4000))));

  const badTime = parseReviewState(JSON.stringify({ days: ready.days, moments: 9, requests: 1, lastRequestAt: 'tuesday' }), day(5));
  check('unreadable request time: treated as just now', badTime.lastRequestAt === day(5)
    && !shouldRequestReview(badTime, ctx(day(5) + REVIEW_COOLDOWN_MS - 1)));

  const lostTime = parseReviewState(JSON.stringify({ days: ready.days, moments: 9, requests: 2 }), day(5));
  check('request count without a time: treated as just now', lostTime.requests === 2 && lostTime.lastRequestAt === day(5));

  const lostCount = parseReviewState(JSON.stringify({ days: ready.days, moments: 9, requests: 0, lastRequestAt: day(1) }), day(5));
  check('request time without a count: one request assumed', lostCount.requests === 1 && lostCount.lastRequestAt === day(1));

  const future = parseReviewState(JSON.stringify({ days: ready.days, moments: 9, requests: 1, lastRequestAt: day(900) }), day(5));
  check('request time in the future: pulled back to now', future.lastRequestAt === day(5));

  // Builds that only stored the time of the last request.
  check('no old key: nothing to carry over', legacyReviewState(null) === null && legacyReviewState('') === null);
  const carried = parseReviewState(legacyReviewState(String(day(0))), day(30));
  check('old key: the earlier request still counts', carried.requests === 1 && carried.lastRequestAt === day(0));
  const carriedJunk = parseReviewState(legacyReviewState('garbage'), day(30));
  check('old key unreadable: treated as asked just now', carriedJunk.requests === 1 && carriedJunk.lastRequestAt === day(30));
}

// ---- the wrapper: what reaches Play, and what cannot go wrong ----------------
const device = (overrides = {}) => {
  const env = {
    stored: null, now: T0, launches: 0, writes: 0, dialog: false, platformAndroid: true,
    android() { return env.platformAndroid; },
    nowFn() { return env.now; },
    read() { return env.stored; },
    write(value) { env.writes += 1; env.stored = value; },
    dialogOpen() { return env.dialog; },
    async launch() { env.launches += 1; },
    ...overrides,
  };
  const prompt = createReviewPrompt({
    android: () => env.android(), now: () => env.nowFn(), read: () => env.read(), write: (v) => env.write(v),
    dialogOpen: () => env.dialogOpen(), launch: () => env.launch(),
  });
  return { env, prompt };
};
/** A fresh launch on each of `n` days. */
const openOn = (target, n) => { for (let i = 0; i < n; i++) { target.env.now = day(i); target.prompt.opened(); } };

{
  const web = device({ platformAndroid: false });
  openOn(web, 5);
  const asked = [await web.prompt.moment(), await web.prompt.moment(), await web.prompt.moment()];
  check('web: nothing is asked, nothing is stored', !asked.some(Boolean) && web.env.launches === 0 && web.env.writes === 0 && web.env.stored === null);
}
{
  const phone = device();
  phone.prompt.opened();
  check('opening the app never asks by itself', phone.env.launches === 0);
  check('phone, install day: the first good moment asks Play', (await phone.prompt.moment()) && phone.env.launches === 1);
  const after = parseReviewState(phone.env.stored, T0);
  check('the request is on record', after.requests === 1 && after.lastRequestAt === T0);
  check('same launch: no second request', !(await phone.prompt.moment()) && phone.env.launches === 1);

  // Later launches read the same storage and never ask again.
  const nextLaunch = device({ stored: phone.env.stored, now: day(2) });
  nextLaunch.prompt.opened();
  check('next launch, two days later: never again', !(await nextLaunch.prompt.moment()) && nextLaunch.env.launches === 0);
  const muchLater = device({ stored: nextLaunch.env.stored, now: T0 + 2 * REVIEW_COOLDOWN_MS });
  check('a launch 180 days later: never again', !(await muchLater.prompt.moment()) && muchLater.env.launches === 0);

  // An install the old build already asked three times.
  const oldInstall = device({ stored: JSON.stringify({ v: 1, days: ['2025-01-01', '2025-01-02'], moments: 9, requests: 3, lastRequestAt: day(-500) }), now: day(0) });
  oldInstall.prompt.opened();
  check('old install asked 3x: never again', !(await oldInstall.prompt.moment()) && oldInstall.env.launches === 0);
}
{
  const ready = serializeReviewState(engaged(1, 0));
  const paywall = device({ stored: ready, now: day(0), dialog: true });
  check('paywall open: counted, not asked', !(await paywall.prompt.moment()) && paywall.env.launches === 0
    && parseReviewState(paywall.env.stored, day(0)).moments === 1);
  paywall.env.dialog = false;
  check('paywall closed: the next moment asks', (await paywall.prompt.moment()) && paywall.env.launches === 1);

  const playDown = device({ stored: ready, now: day(1), async launch() { playDown.env.launches += 1; throw new Error('Play Store not found'); } });
  let threw = false;
  let result;
  try { result = await playDown.prompt.moment(); } catch { threw = true; }
  check('Play unavailable: silent, and the attempt is still on record', !threw && result === true
    && parseReviewState(playDown.env.stored, day(1)).requests === 1);

  const noRead = device({ stored: ready, now: day(1), read() { throw new Error('SecurityError'); } });
  threw = false;
  try { noRead.prompt.opened(); result = await noRead.prompt.moment(); } catch { threw = true; }
  check('storage cannot be read: silent, Play is not called', !threw && result === false && noRead.env.launches === 0);

  const noWrite = device({ stored: ready, now: day(1), write() { throw new Error('QuotaExceededError'); } });
  threw = false;
  try {
    noWrite.prompt.opened();
    result = [await noWrite.prompt.moment(), await noWrite.prompt.moment()];
  } catch { threw = true; }
  check('storage cannot be written: silent, Play is not called (it could not be rate limited)',
    !threw && !result.some(Boolean) && noWrite.env.launches === 0);

  const corrupt = device({ stored: '{"days":[', now: day(1) });
  corrupt.prompt.opened();
  check('corrupt storage: no request, and it is rewritten readable', !(await corrupt.prompt.moment()) && corrupt.env.launches === 0
    && parseReviewState(corrupt.env.stored, day(1)).lastRequestAt === day(1));

  const brokenProbe = device({ stored: ready, now: day(1), android() { throw new Error('no bridge'); } });
  threw = false;
  try { brokenProbe.prompt.opened(); result = await brokenProbe.prompt.moment(); } catch { threw = true; }
  check('platform probe throws: silent', !threw && result === false && brokenProbe.env.launches === 0);
}

// ---- an import counts once it has been seen in 3D ---------------------------
{
  let moments = 0;
  const gate = createImportMoment(() => { moments += 1; });
  check('3D drawn with no import: no moment', gate.rendered3D() === false && moments === 0);
  gate.imported();
  check('an import alone is not a moment yet', moments === 0);
  check('the first 3D frame after it counts', gate.rendered3D() === true && moments === 1);
  check('later 3D views do not count it again', gate.rendered3D() === false && moments === 1);
  gate.imported(); gate.imported();
  gate.rendered3D();
  check('two imports before one 3D view are one moment', moments === 2);
  const throwing = createImportMoment(() => { throw new Error('boom'); });
  throwing.imported();
  let escaped = false;
  try { throwing.rendered3D(); } catch { escaped = true; }
  check('a failing review call never escapes into 3D', !escaped);
  // One import seen in 3D on the first day is enough to ask.
  const state = withMoment(withOpen(fresh(), day(0)), day(0));
  check('first day, an import seen in 3D: asks', shouldRequestReview(state, ctx(day(0))));

  // A sample or template opening in 3D (the first-3D auto-open) is never a
  // moment: appReview.noteNotAnImport() calls discard() before it loads.
  let sampleMoments = 0;
  const sample = createImportMoment(() => { sampleMoments += 1; });
  sample.discard();
  check('sample opened, first 3D frame: no moment', sample.rendered3D() === false && sampleMoments === 0);
  sample.imported(); // an import that stayed in 2D...
  sample.discard(); // ...then a sample (or the first-3D auto-open) is opened
  check('import left in 2D, then a sample in 3D: the sample frame is not credited',
    sample.rendered3D() === false && sampleMoments === 0);
  sample.imported();
  check('a real import after a sample still counts', sample.rendered3D() === true && sampleMoments === 1);
}

// The sample guard is wired where samples and the first-3D auto-open happen.
{
  const screen = readFileSync('src/components/ProjectsScreen.tsx', 'utf8');
  const app = readFileSync('src/App.tsx', 'utf8');
  check('ProjectsScreen.openSample discards before loadSample',
    /noteNotAnImport\(\);[^]*?loadSample\(sampleId\)/.test(screen.slice(screen.indexOf('const openSample')))
    && screen.indexOf('noteNotAnImport()', screen.indexOf('const openSample')) < screen.indexOf('loadSample(sampleId)'));
  check('App first-3D auto-open discards', /if \(takeFirst3D\(.*\)\) \{\s*noteNotAnImport\(\);/.test(app));
}

console.log(failures === 0 ? '\nAll review-policy checks passed.' : `\n${failures} review-policy check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
