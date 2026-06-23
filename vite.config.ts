import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // pdfjs ships a worker that we load as a URL; keep it un-bundled-friendly.
  optimizeDeps: {
    include: ['pdfjs-dist'],
  },
});
