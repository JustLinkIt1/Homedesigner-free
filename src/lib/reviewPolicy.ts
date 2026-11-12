// When to ask Google Play for its in-app review card.
//
// No imports on purpose: everything here is plain data in, plain data out, so
// tests/review-policy.mjs can run it without a browser, a store or Capacitor.
// The platform, the clock, storage and the native call are handed in by
// src/lib/appReview.ts.
//
// Play decides whether the card is actually shown and never says which way it
// went, so nothing here may assume it was seen, and the app must not put any
// question of its own in front of it or behind it.

/** The app has to have been opened on this many different calendar days. */
export const REVIEW_MIN_DAYS = 3;
/** Things that went well (an export saved, an AI render finished), in total. */
export const REVIEW_MIN_MOMENTS = 2;
export const REVIEW_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;
/** Lifetime cap on requests. After this the app never asks again. */
export const REVIEW_MAX_REQUESTS = 3;

export interface ReviewState {
  /** Distinct local days the app was opened on, oldest first. Only the first
   * REVIEW_MIN_DAYS are kept: that is all the decision needs. */
  days: string[];
  moments: number;
  requests: number;
  lastRequestAt: number | null;
}

export interface ReviewContext {
  /** Native Android only. The web build and anything else never asks. */
  android: boolean;
  now: number;
  /** A paywall, the points wallet or a confirmation is on screen. */
  dialogOpen: boolean;
  /** One request per app launch at most, whatever storage says. */
  askedThisSession: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The local calendar day, so "a different day" means what the user means. */
export function localDay(now: number): string {
  const date = new Date(now);
  const two = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * Read what was stored. Nothing stored is a new install. Anything unreadable
 * is treated as "asked just now": bad storage may cost a user one prompt, and
 * can never turn into asking again and again.
 */
export function parseReviewState(raw: string | null | undefined, now: number): ReviewState {
  if (raw === null || raw === undefined || raw === '') {
    return { days: [], moments: 0, requests: 0, lastRequestAt: null };
  }
  const distrusted: ReviewState = { days: [], moments: 0, requests: 1, lastRequestAt: now };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return distrusted;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return distrusted;
  const stored = data as Record<string, unknown>;

  const days: string[] = [];
  if (Array.isArray(stored.days)) {
    for (const day of stored.days) {
      if (typeof day === 'string' && DAY.test(day) && !days.includes(day) && days.length < REVIEW_MIN_DAYS) days.push(day);
    }
  }
  const moments = count(stored.moments) ?? 0;

  const requests = count(stored.requests);
  const last = stored.lastRequestAt;
  if (requests === 0 && (last === null || last === undefined)) {
    return { days, moments, requests: 0, lastRequestAt: null };
  }
  // A request was recorded. If its count or its time cannot be trusted, keep
  // the engagement counters and take the cautious reading of the rest. A time
  // in the future (the clock was moved back since) counts as "just now".
  const lastValid = typeof last === 'number' && Number.isFinite(last) && last >= 0;
  return {
    days,
    moments,
    requests: Math.max(1, requests ?? REVIEW_MAX_REQUESTS),
    lastRequestAt: lastValid ? Math.min(last, now) : now,
  };
}

export function serializeReviewState(state: ReviewState): string {
  return JSON.stringify({ v: 1, ...state });
}

/**
 * Earlier builds stored only the time of the last request, under their own
 * key. Carry it over so nobody who was asked last month is asked again.
 */
export function legacyReviewState(lastRequestedAt: string | null | undefined): string | null {
  if (lastRequestedAt === null || lastRequestedAt === undefined || lastRequestedAt === '') return null;
  // An unreadable number serializes as null, which parseReviewState reads as
  // "asked just now".
  return JSON.stringify({ v: 1, days: [], moments: 0, requests: 1, lastRequestAt: Number(lastRequestedAt) });
}

/** The app was opened or brought back to the foreground. Returns the same
 * object when nothing changed, so the caller can skip the write. */
export function withOpen(state: ReviewState, now: number): ReviewState {
  const day = localDay(now);
  if (state.days.length >= REVIEW_MIN_DAYS || state.days.includes(day)) return state;
  return { ...state, days: [...state.days, day] };
}

/** Something went well for the user. */
export function withMoment(state: ReviewState, now: number): ReviewState {
  const opened = withOpen(state, now);
  return { ...opened, moments: Math.min(opened.moments + 1, Number.MAX_SAFE_INTEGER) };
}

export function withRequest(state: ReviewState, now: number): ReviewState {
  return { ...state, requests: state.requests + 1, lastRequestAt: now };
}

/**
 * Whether to ask now. Call it right after a positive moment, with that moment
 * already counted; it is never right to ask at launch or in the middle of
 * editing.
 */
export function shouldRequestReview(state: ReviewState, context: ReviewContext): boolean {
  if (!context.android || context.dialogOpen || context.askedThisSession) return false;
  // Three different days also rules out the first session.
  if (state.days.length < REVIEW_MIN_DAYS || state.moments < REVIEW_MIN_MOMENTS) return false;
  if (state.requests >= REVIEW_MAX_REQUESTS) return false;
  if (state.lastRequestAt === null) return state.requests === 0;
  return context.now >= state.lastRequestAt && context.now - state.lastRequestAt >= REVIEW_COOLDOWN_MS;
}

/** Everything the policy needs from the outside world. Any of it may throw. */
export interface ReviewEnv {
  android(): boolean;
  now(): number;
  read(): string | null;
  write(value: string): void;
  dialogOpen(): boolean;
  /** Hand over to Play. Resolves when its flow ends, shown or not. */
  launch(): Promise<void>;
}

/**
 * The two things the app reports. Neither ever throws or rejects: a review
 * prompt must not be able to break the export or render it follows.
 */
export function createReviewPrompt(env: ReviewEnv) {
  let asked = false;
  return {
    /** The app was opened or resumed. Only counts the day. */
    opened(): void {
      try {
        if (!env.android()) return;
        const now = env.now();
        const before = parseReviewState(env.read(), now);
        const after = withOpen(before, now);
        if (after !== before) env.write(serializeReviewState(after));
      } catch {
        /* storage unavailable: the day is not counted */
      }
    },
    /** Something went well. Counts it, and asks Play if the time is right.
     * Resolves to whether Play was asked, which is not whether it showed. */
    async moment(): Promise<boolean> {
      try {
        if (!env.android()) return false;
        const now = env.now();
        const state = withMoment(parseReviewState(env.read(), now), now);
        const ask = shouldRequestReview(state, { android: true, now, dialogOpen: env.dialogOpen(), askedThisSession: asked });
        // Written before Play is called, and no call if the write fails: a
        // request that was not recorded would be made again next time.
        env.write(serializeReviewState(ask ? withRequest(state, now) : state));
        if (!ask) return false;
        asked = true;
      } catch {
        return false;
      }
      try {
        await env.launch();
      } catch {
        /* sideloaded, no Play services, or Play's own quota: all normal */
      }
      return true;
    },
  };
}
