import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

/**
 * Emit `version.json` beside the build.
 *
 * The web app is a plain SPA on GitHub Pages: a tab left open for a week keeps
 * running whatever bundle it loaded, with no way to learn that a new one
 * shipped. This is the smallest thing that can tell it — a file the running app
 * can poll and compare against the version compiled into it. Deliberately not a
 * service worker: that would add an install/activate lifecycle and a whole new
 * class of stale-cache bug to an app that currently has none.
 */
function versionManifest(assetBuildId: string): Plugin {
  return {
    name: 'homedesigner-version-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(
          { version: pkg.version, assetBuildId, builtAt: new Date().toISOString() },
          null,
          2,
        ),
      });
    },
  };
}

// Content hashes alone are not enough to recover a browser after a hosting
// fallback has accidentally cached HTML at an asset URL: unchanged vendor
// chunks would keep the poisoned URL forever. Give every deployment a unique
// namespace so even byte-identical chunks receive fresh URLs. CI can supply a
// traceable ID; local builds use the UTC timestamp including milliseconds.
const assetBuildId =
  process.env.HOMEDESIGNER_ASSET_BUILD_ID?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  || new Date().toISOString().replace(/\D/g, '');

// https://vitejs.dev/config/
export default defineConfig({
  // Relative asset URLs so the build also runs inside the Capacitor
  // Android bundle (file/https origin) — harmless for the web deployment.
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), versionManifest(assetBuildId)],
  resolve: {
    // A single three instance is essential — three-mesh-bvh / the path tracer
    // do instanceof + BVH checks that break if three is duplicated.
    dedupe: ['three', 'three-mesh-bvh'],
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
    // The path tracer + BVH ship large modules; pre-bundling avoids dev hiccups.
    // libredwg ships an emscripten wasm next to its glue; optimizing it would
    // relocate the glue away from the wasm (404 → HTML → magic-word crash).
    exclude: ['three-gpu-pathtracer', '@react-three/gpu-pathtracer', '@mlightcad/libredwg-web'],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Put every asset in this deployment's namespace. This retains safe
        // immutable caching while guaranteeing a new URL after every deploy.
        entryFileNames: `assets/${assetBuildId}/[name]-[hash].js`,
        chunkFileNames: `assets/${assetBuildId}/[name]-[hash].js`,
        assetFileNames: `assets/${assetBuildId}/[name]-[hash][extname]`,
        // Split stable vendor groups into their own long-cached chunks.
        // `zustand` is intentionally left unsplit: it's shared by the app and
        // @react-three/fiber, and pinning it to react-vendor creates a circular
        // chunk dependency with three-vendor. Letting Rollup place it avoids that.
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'konva-vendor': ['konva', 'react-konva'],
          // Motion is used by overlays only — keep it out of the main chunk so
          // the editor's first paint doesn't pay for it.
          'motion-vendor': ['framer-motion'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],
        },
      },
    },
  },
});
