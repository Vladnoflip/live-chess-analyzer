# Contributing to LiveChess Analyzer

Thanks for helping. This guide covers the local setup, the checks every change has to pass, and how to report site layout changes.

## Ground rule: fair play

This project must never help anyone during games against human players. Pull requests that weaken the page guards in `extension/platforms/` will not be accepted. That includes enabling live or online game pages, removing the board-id check, or turning the guards into a setting. Requests to add network access, telemetry or remote engines will not be accepted either.

## Setup

Prerequisites: Node.js 20 or newer, and Chrome (or another Chromium-based browser).

```bash
npm install
npm run dev
```

The dev server runs at http://localhost:5173. The Stockfish WASM files are copied into `public/engine/` automatically.

To work on the extension, run `npm run build:extension` and load `dist-extension/` from `chrome://extensions` (Developer mode → Load unpacked). Reload the extension after each rebuild.

## Checks

Run these before opening a pull request. CI runs the same commands.

```bash
npm run typecheck
npm test
npm run build
npm run test:extension
```

- `npm test` runs the unit tests and integration tests that drive the real Stockfish WASM in Node.
- `npm run test:extension` builds the extension and runs the end-to-end suite in Chrome for Testing. The suite runs on local fixture pages that reproduce the chess.com and lichess board DOM.

If a change affects the UI shown in the README, re-capture the images with `npm run screenshots` (after both builds).

## Code style

- TypeScript strict mode. Do not use `any`; if a cast is unavoidable, explain it in a comment.
- Business logic lives in framework-free modules (`src/services`, `src/core`) with unit tests. React components only render state read through `useSyncExternalStore` and call methods.
- The app and the extension share `engine.service`, `board.service` and the scoring and opening modules. Keep them free of DOM and `chrome.*` APIs.
- Write comments only where the logic is not obvious, in English.
- UI text goes into both `src/locales/en.json` and `src/locales/ru.json` with the same key. Never hard-code UI strings in components. Core modules return `{ key, params }` messages, and components render them with `useI18n()`.
- No network calls at runtime. Data such as the opening book is bundled.

## Pull requests

1. Keep each pull request focused on one change and describe what it changes and why.
2. Add or update tests for behaviour changes. For scoring or explanation changes, use positions verified with the engine and state the depth used.
3. Update `README.md` and `CHANGELOG.md` when user-visible behaviour changes.
4. Make sure all checks pass.
5. Fill in the pull request template, including the fair-play checklist.

## Reporting chess.com / lichess layout changes

The extension reads the board from each site's HTML, so a site redesign can stop it from working. When that happens, the overlay simply does not appear. Please open a **DOM breakage** issue (template provided) and include:

- the exact URL path, e.g. `/analysis` or `/play/computer`, without game ids from games against people;
- the browser and extension versions;
- the board container's tag, id and classes, and one piece element's `class` and `style` attributes. You can copy them from the DevTools Elements panel.

Only report pages the extension is allowed to run on: chess.com bot games and analysis boards, and lichess analysis boards.

Fixes belong in `extension/platforms/chesscom.ts` or `extension/platforms/lichess.ts`. Extend the fixtures in `tests/platforms.test.ts` and `scripts/verify-extension.mjs` to match the new markup.
