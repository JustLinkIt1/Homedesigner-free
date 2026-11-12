// When the app asks Google Play for its in-app review card.
//
// Play never reports whether the card was shown, and it is against Play policy
// to ask too often or to wrap the card in the app's own questions, so the only
// thing the app controls is WHEN it asks. That lives in src/lib/reviewPolicy.ts
// as plain functions, and these checks run them directly:
//
//   * never in the first session, and not before the app has been opened on
//     three different days and two things have gone well;
//   * at most once every 90 days, three times in a lifetime, once per launch;
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
  createReviewPrompt, legacyReviewState, localDay, parseReviewState, serializeReviewState,
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
check('thresholds: 3 days, 2 moments, 90 days apart, 3 in a lifetime',
  REVIEW_MIN_DAYS === 3 && REVIEW_MIN_MOMENTS === 2 && REVIEW_COOLDOWN_MS === 90 * DAY_MS && REVIEW_MAX_REQUESTS === 3);
check('a calendar day is the local date', localDay(new Date(2026, 2, 5, 23, 59).getTime()) === '2026-03-05'
  && localDay(new Date(2026, 2, 6, 0, 1).getTime()) === '2026-03-06');

// ---- engagement gates -------------------------------------------------------
{
  let first = fresh();
  first = withOpen(first, T0);
  for (let i = 0; i < 10; i++) first = withMoment(first, T0 + i * 60_000);
  check('first session: ten exports on install day never ask', !shouldRequestReview(first, ctx(T0 + 3_600_000)));

  check('too few days: two days with plenty of moments', !shouldRequestReview(engaged(2, 5), ctx(day(1))));
  check('too few moments: three days, one moment', !shouldRequestReview(engaged(3, 1), ctx(day(2))));
  check('too few moments: three days, none', !shouldRequestReview(engaged(3, 0), ctx(day(2))));
  check('three days and two moments ask', shouldRequestReview(engaged(3, 2), ctx(day(2))));

  let sameDay = fresh();
  for (let i = 0; i < 6; i++) sameDay = withOpen(sameDay, T0 + i * 3_600_000);
  check('reopening on the same day counts one day', sameDay.days.length === 1);

  let moments = fresh();
  moments = withMoment(withMoment(moments, day(0)), day(1));
  moments = withMoment(moments, day(2));
  check('a moment counts its own day when no open was recorded', moments.days.length === 3 && moments.moments === 3);

  const many = engaged(40, 2);
  check('only the first three days are kept', many.days.length === 3 && many.days[0] === localDay(day(0)));
  check('an open that changes nothing returns the same state', withOpen(many, day(50)) === many);
}

// ---- where and when it may not ask ------------------------------------------
{
  const ready = engaged(3, 2);
  check('web and other platforms never ask', !shouldRequestReview(ready, ctx(day(2), { android: false })));
  check('not while a paywall or other dialog is open', !shouldRequestReview(ready, ctx(day(2), { dialogOpen: true })));
  check('once per app launch', !shouldRequestReview(ready, ctx(day(2), { askedThisSession: true })));
}

// ---- 90-day spacing and the lifetime cap ------------------------------------
{
  const asked = withRequest(engaged(3, 2), day(2));
  check('a request is recorded', asked.requests === 1 && asked.lastRequestAt === day(2));
  check('89 days later: still too soon', !shouldRequestReview(asked, ctx(day(2) + 89 * DAY_MS)));
  check('one millisecond short of 90 days: too soon', !shouldRequestReview(asked, ctx(day(2) + REVIEW_COOLDOWN_MS - 1)));
  check('90 days later: asks again', shouldRequestReview(asked, ctx(day(2) + REVIEW_COOLDOWN_MS)));
  check('clock moved back before the last request: does not ask', !shouldRequestReview(asked, ctx(day(2) - DAY_MS)));

  let state = engaged(3, 2);
  let now = day(2);
  let granted = 0;
  for (let i = 0; i < 12; i++) {
    if (shouldRequestReview(state, ctx(now))) { granted += 1; state = withRequest(state, now); }
    now += REVIEW_COOLDOWN_MS;
  }
  check('lifetime cap: three requests over three years of trying', granted === 3 && state.requests === 3, `granted ${granted}`);
  check('after the cap it never asks, however long it waits', !shouldRequestReview(state, ctx(now + 20 * REVIEW_COOLDOWN_MS)));
}

// ---- storage ----------------------------------------------------------------
{
  const ready = engaged(3, 2);
  const round = parseReviewState(serializeReviewState(ready), day(2));
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
    fields.days.join() === '2026-01-10,2026-01-11' && fields.moments === 0 && fields.requests === 0 && fields.lastRequestAt === null);

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
  const firstDay = [await phone.prompt.moment(), await phone.prompt.moment(), await phone.prompt.moment()];
  check('phone, install day: moments are counted but Play is not called',
    !firstDay.some(Boolean) && phone.env.launches === 0 && parseReviewState(phone.env.stored, T0).moments === 3);

  // Day two, then day three: the next good moment is the one that asks.
  phone.env.now = day(1); phone.prompt.opened();
  check('phone, second day: still nothing', !(await phone.prompt.moment()) && phone.env.launches === 0);
  phone.env.now = day(2); phone.prompt.opened();
  check('opening the app never asks by itself', phone.env.launches === 0);
  check('phone, third day: the next good moment asks Play', (await phone.prompt.moment()) && phone.env.launches === 1);
  const after = parseReviewState(phone.env.stored, day(2));
  check('the request is on record', after.requests === 1 && after.lastRequestAt === day(2));
  check('same launch: no second request', !(await phone.prompt.moment()) && phone.env.launches === 1);

  // A new launch the next day reads the same storage.
  const nextLaunch = device({ stored: phone.env.stored, now: day(3) });
  nextLaunch.prompt.opened();
  check('next launch, a day later: too soon', !(await nextLaunch.prompt.moment()) && nextLaunch.env.launches === 0);
  const muchLater = device({ stored: nextLaunch.env.stored, now: day(2) + REVIEW_COOLDOWN_MS });
  check('a launch 90 days later: asks once more', (await muchLater.prompt.moment()) && muchLater.env.launches === 1);
}
{
  const ready = serializeReviewState(engaged(3, 2));
  const paywall = device({ stored: ready, now: day(2), dialog: true });
  check('paywall open: counted, not asked', !(await paywall.prompt.moment()) && paywall.env.launches === 0
    && parseReviewState(paywall.env.stored, day(2)).moments === 3);
  paywall.env.dialog = false;
  check('paywall closed: the next moment asks', (await paywall.prompt.moment()) && paywall.env.launches === 1);

  const playDown = device({ stored: ready, now: day(2), async launch() { playDown.env.launches += 1; throw new Error('Play Store not found'); } });
  let threw = false;
  let result;
  try { result = await playDown.prompt.moment(); } catch { threw = true; }
  check('Play unavailable: silent, and the attempt is still on record', !threw && result === true
    && parseReviewState(playDown.env.stored, day(2)).requests === 1);

  const noRead = device({ stored: ready, now: day(2), read() { throw new Error('SecurityError'); } });
  threw = false;
  try { noRead.prompt.opened(); result = await noRead.prompt.moment(); } catch { threw = true; }
  check('storage cannot be read: silent, Play is not called', !threw && result === false && noRead.env.launches === 0);

  const noWrite = device({ stored: ready, now: day(2), write() { throw new Error('QuotaExceededError'); } });
  threw = false;
  try {
    noWrite.prompt.opened();
    result = [await noWrite.prompt.moment(), await noWrite.prompt.moment()];
  } catch { threw = true; }
  check('storage cannot be written: silent, Play is not called (it could not be rate limited)',
    !threw && !result.some(Boolean) && noWrite.env.launches === 0);

  const corrupt = device({ stored: '{"days":[', now: day(2) });
  corrupt.prompt.opened();
  check('corrupt storage: no request, and it is rewritten readable', !(await corrupt.prompt.moment()) && corrupt.env.launches === 0
    && parseReviewState(corrupt.env.stored, day(2)).lastRequestAt === day(2));

  const brokenProbe = device({ stored: ready, now: day(2), android() { throw new Error('no bridge'); } });
  threw = false;
  try { brokenProbe.prompt.opened(); result = await brokenProbe.prompt.moment(); } catch { threw = true; }
  check('platform probe throws: silent', !threw && result === false && brokenProbe.env.launches === 0);
}

console.log(failures === 0 ? '\nAll review-policy checks passed.' : `\n${failures} review-policy check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
