import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import manifest from './extension/manifest';

// Builds the unpacked Chrome extension into dist-extension/.
// public/engine/ (Stockfish WASM, copied by scripts/copy-engine.mjs) ends up at /engine/.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  publicDir: 'public',
  build: {
    outDir: 'dist-extension',
    emptyOutDir: true,
    rollupOptions: {
      input: { offscreen: 'extension/offscreen.html', trainer: 'extension/trainer.html' },
    },
  },
});
