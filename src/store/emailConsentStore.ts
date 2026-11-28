// State for the product-update email opt-in, for the UI to bind to:
// the sign-in card (`emailOptinPrompt`) and the Settings toggle (`optedIn`).
// No UI lives here. Calls from authStore are fire-and-forget: nothing in this
// store can block, slow or fail sign-in or sync, and no action ever throws.
//
//   const { emailOptinPrompt, optedIn, pending, saving, unverified } = useEmailConsentStore();
//   markShown('signin')            // the card became visible (or 'settings' for the toggle)
//   setOptIn(true, 'signin')       // "Yes" on the card / toggle on in Settings ('settings')
//   dismissPrompt()                // "Not now": records opted_in = 0, hides the card
//   refresh()                      // Settings opened: reload the server state
//
// `optedIn` is only ever the state the SERVER confirmed (or the last one it
// confirmed, offline). It never turns true from a guess: there is no silent
// opt-in. An answer given offline is held in `pending` and retried on reconnect.
import { create } from 'zustand';
import {
  EmailConsentHttpError, fetchEmailConsent, forgetLocalConsent, hasBeenAsked, isEmailConsentAvailable, markAsked,
  readLastKnown, readPending, sendEmailConsent, writeLastKnown, writePending,
  type EmailConsentSource, type EmailConsentState,
} from '../lib/emailConsent';
import { trackEmailOptin } from '../lib/events';
import { useLang } from '../lib/i18n';

export interface EmailConsentStore {
  /** Google subject of the signed-in account, or null when signed out. */
  subject: string | null;
  /** Server-confirmed state; null while unknown (never loaded, signed out). */
  optedIn: boolean | null;
  updatedAt: number | null;
  /** An answer not yet confirmed by the server (offline); null when none. */
  pending: boolean | null;
  saving: boolean;
  /** The server refused: this Google account's email is not verified. */
  unverified: boolean;
  /** Show the once-per-account opt-in card now. Never pre-ticked: the card has no default answer. */
  emailOptinPrompt: boolean;

  /** Signed in / restored / signed out. Loads the last known state and retries a pending answer. */
  setAccount: (subject: string | null) => void;
  /** After sign-in: raises `emailOptinPrompt` once per account when the server has no row. */
  checkAfterSignIn: (subject: string) => Promise<void>;
  /** Reload the server state (e.g. Settings opened). */
  refresh: () => Promise<void>;
  /** The person's own answer. Resolves true once the server has it. */
  setOptIn: (optedIn: boolean, source: EmailConsentSource) => Promise<boolean>;
  /** "Not now" on the sign-in card: records opted_in = 0 and hides the card. */
  dismissPrompt: () => Promise<boolean>;
  /** The card (signin) or the Settings toggle (settings) was shown: one analytics event. */
  markShown: (where: EmailConsentSource) => void;
}

const signedOut = {
  subject: null, optedIn: null, updatedAt: null, pending: null,
  saving: false, unverified: false, emailOptinPrompt: false,
} as const;

let onlineListener = false;

export const useEmailConsentStore = create<EmailConsentStore>((set, get) => {
  const confirmed = (subject: string, state: EmailConsentState) => {
    writeLastKnown(subject, state);
    if (get().subject === subject) set({ optedIn: state.optedIn, updatedAt: state.updatedAt });
  };

  // Sends run one at a time, so two quick taps (yes, then no) reach the server
  // in the order they were made and the last one wins.
  let chain: Promise<unknown> = Promise.resolve();
  const flushPending = (subject: string): Promise<boolean> => {
    const run = chain.then(() => flushOnce(subject), () => flushOnce(subject));
    chain = run;
    return run;
  };

  /** Send the pending answer for this account, if any. Never throws. */
  const flushOnce = async (subject: string): Promise<boolean> => {
    const pending = readPending(subject);
    if (!pending) return true;
    if (get().subject === subject) set({ saving: true });
    try {
      const state = await sendEmailConsent(pending.optedIn, pending.source, useLang.getState().lang);
      // Signed out (or switched) meanwhile: the answer still belonged to that account.
      if (readPending(subject)?.optedIn === pending.optedIn) writePending(subject, null);
      confirmed(subject, state);
      if (get().subject === subject) set({ pending: readPending(subject)?.optedIn ?? null, unverified: false });
      return true;
    } catch (error) {
      if (error instanceof EmailConsentHttpError && !error.retryable) {
        // Will never succeed: drop it rather than retry forever.
        writePending(subject, null);
        if (get().subject === subject) set({ pending: null, unverified: error.status === 403 });
      }
      return false;
    } finally {
      if (get().subject === subject) set({ saving: false });
    }
  };

  const ensureOnlineRetry = () => {
    if (onlineListener) return;
    try {
      window.addEventListener('online', () => {
        const subject = get().subject;
        if (subject) void flushPending(subject);
      });
      onlineListener = true;
    } catch { /* no window (tests) */ }
  };

  return {
    ...signedOut,

    setAccount: (subject) => {
      try {
        if (!subject) { set({ ...signedOut }); return; }
        if (get().subject !== subject) {
          const last = readLastKnown(subject);
          set({
            ...signedOut,
            subject,
            optedIn: last?.optedIn ?? null,
            updatedAt: last?.updatedAt ?? null,
            pending: readPending(subject)?.optedIn ?? null,
          });
        }
        ensureOnlineRetry();
        if (readPending(subject)) void flushPending(subject);
      } catch { /* never break auth */ }
    },

    checkAfterSignIn: async (subject) => {
      try {
        get().setAccount(subject);
        if (!isEmailConsentAvailable() || hasBeenAsked(subject)) return;
        const state = await fetchEmailConsent();
        confirmed(subject, state);
        if (get().subject !== subject) return; // signed out meanwhile
        if (state.updatedAt !== null) {
          // The server already has an answer (another device, or Settings): never ask again here.
          markAsked(subject);
          return;
        }
        // Once per account: remembered the moment the card is raised.
        markAsked(subject);
        set({ emailOptinPrompt: true });
      } catch {
        // Offline or failed check: no card now, and not marked asked, so the next sign-in tries again.
      }
    },

    refresh: async () => {
      const subject = get().subject;
      if (!subject || !isEmailConsentAvailable()) return;
      try {
        await flushPending(subject);
        confirmed(subject, await fetchEmailConsent());
      } catch { /* offline: keep showing the last known state */ }
    },

    setOptIn: async (optedIn, source) => {
      const subject = get().subject;
      if (!subject) return false;
      try {
        trackEmailOptin(`${optedIn ? 'yes' : 'no'}:${source}`);
        markAsked(subject);
        writePending(subject, { optedIn, source });
        set({ pending: optedIn, unverified: false, ...(source === 'signin' ? { emailOptinPrompt: false } : {}) });
        ensureOnlineRetry();
        return await flushPending(subject);
      } catch {
        return false;
      }
    },

    dismissPrompt: () => get().setOptIn(false, 'signin'),

    markShown: (where) => {
      try { trackEmailOptin(`shown:${where}`); } catch { /* analytics only */ }
    },
  };
});

/** For authStore: start the post-sign-in check without awaiting it. Never throws. */
export function startEmailOptinCheck(subject: string): void {
  try {
    void useEmailConsentStore.getState().checkAfterSignIn(subject).catch(() => {});
  } catch { /* never break sign-in */ }
}

/** For authStore: the account was deleted on the server. Never throws. */
export function forgetEmailConsentAccount(subject: string): void {
  try {
    forgetLocalConsent(subject);
    useEmailConsentStore.getState().setAccount(null);
  } catch { /* never break auth */ }
}

/** For authStore: the account changed (restored, signed out, deleted). Never throws. */
export function setEmailConsentAccount(subject: string | null): void {
  try {
    useEmailConsentStore.getState().setAccount(subject);
  } catch { /* never break auth */ }
}
