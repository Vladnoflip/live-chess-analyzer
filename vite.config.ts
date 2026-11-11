import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// COOP/COEP make the page cross-origin isolated, which unlocks SharedArrayBuffer
// and therefore the multi-threaded Stockfish build. Without them the app falls
// back to the single-threaded engine.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; set BASE_PATH there (see .github/workflows/pages.yml).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
