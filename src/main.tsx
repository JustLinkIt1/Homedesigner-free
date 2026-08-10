import React from 'react';
import ReactDOM from 'react-dom/client';
import { LazyMotion, MotionConfig, domMax } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useProStore } from './store/proStore';
import { useDesign } from './store/designStore';
import { initTheme } from './lib/theme';
import { toast } from './lib/ui';
import { finishStrandedGooglePopup } from './lib/googleAuth';
import './index.css';

const ModelStudio = React.lazy(() => import('./model-studio/ModelStudio'));
// The forum. Lazy AND web-only: Capacitor wraps this same bundle into the APK,
// so a static import would ship a whole forum inside the Android app the owner
// explicitly did not want it in — and would put user-generated content into the
// Play data-safety declaration. On native this chunk is never requested.
const CommunityApp = React.lazy(() => import('./community/CommunityApp'));

// Complete OAuth before mounting the full editor. This is normally handled by
// the provider popup itself; the fallback covers browsers that turn the popup
// into an opener-less tab.
const completedGooglePopup = finishStrandedGooglePopup();
const communityRequested =
  !Capacitor.isNativePlatform() &&
  (window.location.pathname === '/community' || window.location.pathname.startsWith('/community/'));
const modelStudioRequested =
  new URLSearchParams(window.location.search).get('studio') === 'models' ||
  window.location.pathname.startsWith('/app/model-studio');

// A lightweight shell marker makes production startup observable and ensures
// each app-shell revision receives a fresh immutable asset fingerprint.
document.documentElement.dataset.appShell = 'ready';

/**
 * Recover a tab left behind by a deployment.
 *
 * Every build gets its own `assets/<namespace>/` directory and Pages serves only
 * the newest deployment on the custom domain, so a tab opened before a deploy
 * 404s on its next lazy import. The most visible casualty is the Social Login
 * web implementation, which Capacitor only fetches on the first "Sign in with
 * Google" click — the failure therefore lands on the sign-in path and reads as
 * "Failed to fetch dynamically imported module", which tells the user nothing.
 *
 * The page cannot continue either way, so reload into the current build rather
 * than dead-ending. The guard is a timestamp, not a once-per-session flag: a
 * genuinely missing chunk fails again immediately, so a repeat inside the window
 * means "broken deploy, stop and tell the user", while a tab left open across a
 * second deploy hours later still recovers on its own.
 */
const STALE_CHUNK_KEY = 'homedesigner.stale-chunk-reload.v1';
const STALE_CHUNK_RETRY_MS = 60_000;
const STALE_CHUNK_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

function recoverFromStaleChunk(): void {
  const now = Date.now();
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(STALE_CHUNK_KEY)) || 0;
  } catch {
    /* private mode — fall through and reload */
  }
  if (now - last < STALE_CHUNK_RETRY_MS) {
    toast.error('Some of the app failed to load. Please refresh the page.');
    return;
  }
  try {
    sessionStorage.setItem(STALE_CHUNK_KEY, String(now));
  } catch {
    /* best effort */
  }
  window.location.reload();
}

// Vite raises this for any dynamic import it emitted; preventDefault stops it
// from also becoming an unhandled rejection.
window.addEventListener('vite:preloadError', ((event: Event) => {
  event.preventDefault();
  recoverFromStaleChunk();
}) as EventListener);

// Not every failed import routes through Vite's preload helper, so match the
// browser's own message as a backstop.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: unknown } | null;
  if (STALE_CHUNK_PATTERN.test(String(reason?.message ?? reason ?? ''))) {
    recoverFromStaleChunk();
  }
});

// Apply the persisted (or OS) theme before first paint to avoid a flash.
initTheme();

// Expose the design store on window for Playwright tests only (dev builds).
// The compiled production bundle will still include this because it's
// evaluated as a top-level side effect, but the small surface (a single
// namespace) is deliberately not part of any public API.
if (import.meta.env.DEV) {
  (window as unknown as { useDesign: typeof useDesign }).useDesign = useDesign;
  // The 2D editor draws into a canvas, so its live preview (rubber band, snap
  // marker, length readout) leaves no DOM for the smoke suite to assert on.
  // Exposing Konva lets it look those nodes up by name. Dev-only: this is a
  // test seam, not something the shipped app should hand out.
  void import('konva').then((m) => {
    (window as unknown as { Konva: unknown }).Konva = m.default ?? m;
  });
  // Entitlement is not reachable from the DOM, so the smoke suite needs this to
  // assert what a free user and a Pro user each see of the catalog.
  (window as unknown as { useProStore: typeof useProStore }).useProStore = useProStore;
}

if (!completedGooglePopup) {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        {/*
          Motion is configured once, here, because App has two return branches
          (projects screen and editor) and both render dialogs and toasts.

          `domMax` rather than the smaller `domAnimation` because the toast
          stack uses `layout` to reflow when one is dismissed, and layout
          projection only ships in domMax. `strict` makes a bare `motion.div` a
          runtime error, forcing every call site to use `m.div`, which is what
          keeps the feature set (and the bundle) from quietly growing further.

          `reducedMotion="user"` honours the OS setting globally, so overlays
          become instant state changes for users who ask for that — and it is
          what makes the Playwright suite deterministic under
          `reducedMotion: 'reduce'`.
        */}
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user">
            <React.Suspense fallback={null}>
              {communityRequested ? <CommunityApp /> : modelStudioRequested ? <ModelStudio /> : <App />}
            </React.Suspense>
          </MotionConfig>
        </LazyMotion>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
