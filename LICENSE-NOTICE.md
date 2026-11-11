# Third-party notices

LiveChess Analyzer is distributed under the **GNU General Public License v3.0** (see [`LICENSE`](LICENSE)), because it bundles the Stockfish chess engine.

This file lists every third-party component that is shipped with the app or the extension, where it lives in the repository or in the build output, and under which license it is used.

## Bundled components

### Stockfish 18 (stockfish.js lite WASM builds)

- **Authors:** The Stockfish developers (https://github.com/official-stockfish/Stockfish); WASM port by Nathan Rugg and Chess.com (https://github.com/nmrugg/stockfish.js).
- **License:** GPL-3.0. Full text in `node_modules/stockfish/Copying.txt`, identical to [`LICENSE`](LICENSE).
- **Used as:** npm package `stockfish@18.0.8`. `scripts/copy-engine.mjs` copies `stockfish-18-lite-single.{js,wasm}` and `stockfish-18-lite.{js,wasm}` into `public/engine/` at build time. From there they end up in `dist/engine/` (web app) and `dist-extension/engine/` (extension). The binaries are not committed to the repository.

### chess.js

- **Author:** Jeff Hlywa and contributors (https://github.com/jhlywa/chess.js).
- **License:** BSD-2-Clause.
- **Used as:** npm package `chess.js@1.4.0` for move generation, FEN validation and PGN parsing (`src/services/board.service.ts`), bundled into both builds.

### lichess-org/chess-openings

- **Author:** The Lichess project and contributors (https://github.com/lichess-org/chess-openings).
- **License:** CC0-1.0 (public domain dedication). The license text is in [`src/data/openings/COPYING.txt`](src/data/openings/COPYING.txt).
- **Version:** commit `3ba6b20d31b2e6125cb0e6a2e792f400717d9d39` (2026-11-05), recorded in [`src/data/openings/SOURCE.txt`](src/data/openings/SOURCE.txt).
- **Used as:**
  - the source TSV files `src/data/openings/{a,b,c,d,e}.tsv`;
  - `src/data/openings/openings.json`, generated from them by `npm run build-openings`;
  - the opening explorer, the trainer, the move explanations and the extension's opening indicator.

CC0 requires no attribution; the Lichess project is credited here as a courtesy.

### cburnett chess pieces

- **Author:** Colin M. L. Burnett (https://en.wikipedia.org/wiki/User:Cburnett).
- **License:** GPLv2 or later (GPLv2+), used here under GPL-3.0.
- **Source:** lichess-org/lila, commit `9f8dd5df253455cd4890db27e6952b06e071b7e0`, path `public/piece/cburnett/`. The license is listed in lila's `COPYING.md`. Source and commit are also recorded in [`src/assets/pieces/cburnett/SOURCE.txt`](src/assets/pieces/cburnett/SOURCE.txt).
- **Used as:** the twelve SVG files `src/assets/pieces/cburnett/{w,b}{K,Q,R,B,N,P}.svg`, which draw the board pieces in the web app and on the extension's trainer page.

### React and React DOM

- **License:** MIT (https://react.dev).
- **Used as:** the web app UI and the extension's trainer page.

## Not third-party

- **Move sounds** are synthesized at runtime with the Web Audio API (`src/services/sound.service.ts`). No audio files are bundled.
- **Board colours, arrows, icons and page styles** are original to this project.

## Development-only tools

These are not shipped in any build: TypeScript, Vite, Vitest, @vitejs/plugin-react, @crxjs/vite-plugin, jsdom and Puppeteer. Puppeteer downloads Chrome for Testing into the user cache directory, not into the repository. Each tool keeps its own license.
