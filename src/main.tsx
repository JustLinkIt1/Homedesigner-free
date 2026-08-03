import React from 'react';
import ReactDOM from 'react-dom/client';
import { LazyMotion, MotionConfig, domMax } from 'framer-motion';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useProStore } from './store/proStore';
import { useDesign } from './store/designStore';
import { initTheme } from './lib/theme';
import { finishStrandedGooglePopup } from './lib/googleAuth';
import './index.css';

const ModelStudio = React.lazy(() => import('./model-studio/ModelStudio'));

// Complete OAuth before mounting the full editor. This is normally handled by
// the provider popup itself; the fallback covers browsers that turn the popup
// into an opener-less tab.
const completedGooglePopup = finishStrandedGooglePopup();
const modelStudioRequested =
  new URLSearchParams(window.location.search).get('studio') === 'models' ||
  window.location.pathname.startsWith('/app/model-studio');

// A lightweight shell marker makes production startup observable and ensures
// each app-shell revision receives a fresh immutable asset fingerprint.
document.documentElement.dataset.appShell = 'ready';

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
              {modelStudioRequested ? <ModelStudio /> : <App />}
            </React.Suspense>
          </MotionConfig>
        </LazyMotion>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
