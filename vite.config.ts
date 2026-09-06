import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  base: '/overlay-guide/',
  plugins: [react()],
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
    // Only reached by the Node fallback in src/core/deflate.ts; the browser
    // uses CompressionStream, so this import must never be bundled.
    rollupOptions: { external: ['node:zlib'] },
  },
});
