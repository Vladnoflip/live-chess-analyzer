import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'LiveChess Analyzer',
  version: pkg.version,
  homepage_url: 'https://github.com/Vladnoflip/live-chess-analyzer',
  description: 'Local Stockfish 18 analysis for analysis boards and games against bots. Disabled in games against people. Not a cheat.',
  // Only what is needed: storage for settings, offscreen for the engine host.
  permissions: ['storage', 'offscreen'],
  host_permissions: ['https://www.chess.com/*', 'https://lichess.org/*'],
  background: { service_worker: 'extension/background.ts', type: 'module' },
  action: { default_popup: 'extension/popup.html', default_title: 'LiveChess Analyzer' },
  content_scripts: [
    {
      matches: ['https://www.chess.com/*', 'https://lichess.org/*'],
      js: ['extension/content/content.ts'],
      run_at: 'document_idle',
    },
  ],
  // WASM compilation needs 'wasm-unsafe-eval'; the multi-threaded build needs
  // cross-origin isolation (SharedArrayBuffer) in the offscreen document.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  // Valid MV3 keys that CRXJS's manifest typings don't list; spreading skips the
  // excess-property check without resorting to `any`.
  ...isolationKeys(),
});

function isolationKeys() {
  return {
    cross_origin_embedder_policy: { value: 'require-corp' },
    cross_origin_opener_policy: { value: 'same-origin' },
  };
}
