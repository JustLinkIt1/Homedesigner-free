import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // Relative asset URLs so the build also runs inside the Capacitor
  // Android bundle (file/https origin) — harmless for the web deployment.
  base: './',
  plugins: [react()],
  resolve: {
    // A single three instance is essential — three-mesh-bvh / the path tracer
    // do instanceof + BVH checks that break if three is duplicated.
    dedupe: ['three', 'three-mesh-bvh'],
  },
  optimizeDeps: {
    include: ['pdfjs-dist'],
    // The path tracer + BVH ship large modules; pre-bundling avoids dev hiccups.
    exclude: ['three-gpu-pathtracer', '@react-three/gpu-pathtracer'],
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        // Split stable vendor groups into their own long-cached chunks.
        // `zustand` is intentionally left unsplit: it's shared by the app and
        // @react-three/fiber, and pinning it to react-vendor creates a circular
        // chunk dependency with three-vendor. Letting Rollup place it avoids that.
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'konva-vendor': ['konva', 'react-konva'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'postprocessing'],
        },
      },
    },
  },
});
