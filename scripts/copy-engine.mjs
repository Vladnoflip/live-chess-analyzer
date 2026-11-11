// Copies the Stockfish lite WASM builds from node_modules into public/engine
// so Vite serves them as static worker scripts.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dest = join(root, 'public', 'engine');

const files = [
  'stockfish-18-lite-single.js',
  'stockfish-18-lite-single.wasm',
  'stockfish-18-lite.js',
  'stockfish-18-lite.wasm',
];

mkdirSync(dest, { recursive: true });
for (const file of files) {
  const from = join(src, file);
  if (!existsSync(from)) {
    console.error(`Missing ${from}. Run "npm install" first.`);
    process.exit(1);
  }
  copyFileSync(from, join(dest, file));
}
console.log(`Stockfish engine copied to ${dest}`);
