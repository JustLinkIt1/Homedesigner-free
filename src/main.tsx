import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useDesign } from './store/designStore';
import { initTheme } from './lib/theme';
import './index.css';

// Apply the persisted (or OS) theme before first paint to avoid a flash.
initTheme();

// Expose the design store on window for Playwright tests only (dev builds).
// The compiled production bundle will still include this because it's
// evaluated as a top-level side effect, but the small surface (a single
// namespace) is deliberately not part of any public API.
if (import.meta.env.DEV) {
  (window as unknown as { useDesign: typeof useDesign }).useDesign = useDesign;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
