# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.7.3] — chess.com bot-game check and refusal diagnostics

A report said bot games on chess.com moved to a different URL. On 2026-11-13 the live site (guest session) kept **one address for the whole bot game**: the bot picker, a running game (checked after 1.e4 and the bot's reply) and the finished game all stay on `https://www.chess.com/play/computer` with `<wc-chess-board id="board-play-computer">`. The existing gate already accepts exactly that, so the gate is unchanged. The live lichess analysis board was re-checked as well (`npm run smoke:lichess`: overlay drawn, no errors). A different address for signed-in users could not be checked.

### Added
- **Refusal diagnostics.** On a chess.com or lichess page that has a board but is not allowed, the content script logs once, with the path and the board element id: `[LiveChess Analyzer] idle on /game/live/123: wc-chess-board#board-single is not an analysis board or a game against a bot`. If chess.com ever changes the bot-game address, that line shows exactly what to add. Platforms gain `describeBoard()` for this.
- **Fair-play gate tests.** The chess.com gate is now tested against: the observed bot pages (`/play/computer`, a trailing slash, sub-paths); games against people with every board id, including the bot board id (`/game/live`, `/game/daily`, `/play/online`, `/play/online/new`, arenas, tournaments, variants); look-alike paths (`/play/computers`, `/play/computer-online`, `/xplay/computer`, `/analysisx`); and the right path with the wrong board.
- **E2E check** that the refusal on a `/game/live` page is logged with its path and board id, and that no overlay is shown there.

### Unchanged
- Games against people are never analysed. The gate still requires both an allowed path **and** the matching board id on chess.com, and `/analysis` on lichess.

## [0.7.2] — Extension diagnostics and safer content script

A report said the extension showed nothing after updating to 0.7.x. No crash could be reproduced: the 0.7.1 build draws the overlay on the live `lichess.org/analysis` page with no exceptions, the fixture e2e suite passes, and every file referenced by the manifest exists. chess.com could not be tested live (it answers automated browsers with 403). The most likely causes are on the installation side: a self-packed `.crx` (Chrome on Windows and macOS disables off-store `.crx` extensions), or a Chrome profile still running the previous build (every build gives the scripts new hashed names, so the old manifest points to files that no longer exist). This release makes such failures visible and keeps the content script running.

### Fixed
- **Content script resilience.** An exception in one polling tick is caught and logged instead of failing silently, and the overlay keeps running. Start-up failures (for example, settings that cannot be read) are logged too. Draw detection is guarded, so it can never stop the overlay.

### Added
- **Diagnostics.** The content script logs `[LiveChess Analyzer] content script v… loaded on …` to the page console. Every extension error is logged once with that prefix and the version. The overlay host exposes `data-version`.
- **E2E checks.** The suite now fails on any uncaught exception or extension console error in any context (page, content script, service worker, offscreen document, popup, trainer). It also checks that every file referenced by the built manifest exists (including the bundle the content-script loader imports), that the manifest version matches `package.json`, and that the content script announced itself. A deliberately injected crash in the content script makes the suite fail (checked manually).
- `npm run smoke:lichess`: a manual smoke test on the live lichess analysis board.
- README: a *Troubleshooting* section: install with *Load unpacked* (not a `.crx` or `.zip`), reload after every build, and read the logs (`chrome://extensions` → *Inspect views*).
- `.gitignore` excludes `*.crx`, `*.pem` and `dist-extension.zip`, so a packing key is never committed.

## [0.7.1] — New arrow style

### Changed
- **Arrows** were restyled: a thin line (7–9% of a square) starting at a small ring on the source square, a compact head with rounded corners that stops 0.3 squares before the target centre, and rounded frames around the source and target squares of the best/selected move (the target frame is lightly filled). Score badges are now small rectangles with slightly rounded corners, sized to the number of digits, centred on the line just before the head.
- **Brighter colours with a faint glow.** The score steps are red `#ff4d4f`, orange `#ff9a2e`, yellow `#ffd93d`, light green `#7bdc4f` and green `#1fbf5a`, with blue `#33b8ff` for brilliant moves. Every arrow and badge has a faint glow in its own colour (a little stronger for brilliant moves). Shared by the web board, the trainer and the extension overlay.

## [0.7.0] — Draws, PGN export, lichess import, themes, heatmap, Guess the move

### Added
- **Annotated PGN export.** *Export PGN* (next to *Review game*) downloads the reviewed game with a comment per move: the classification symbol and label, the main reason from the move explainer and the best move for inaccuracies, mistakes and blunders (`{?! Inaccuracy: Loses a pawn. Best was Nf3 [%eval 0.35]}`), `{!! Brilliant move}`, and a `[%eval]` tag that lichess and chess.com understand. Comments follow the UI language.
- **Lichess import (web app only).** A *Lichess username* field loads the last 10 games from `https://lichess.org/api/games/user/{name}?max=10&pgnInJson=true`. *Review all* analyses them one after another and lists blunders, mistakes and inaccuracies per game; clicking a game opens and reviews it. The panel states that this is the only network request in the app and that it is optional. The extension has no such button and no new permissions; a unit test and the e2e suite check this.
- **Board themes**: Classic, Wood, Neon and Soft, as CSS custom properties shared by the web board and the trainer page. Neon outlines pieces with a glow so black pieces stay readable; tests check piece/square contrast for every theme. Web app: *Engine settings → Board theme* (saved in `localStorage`). Extension: *Trainer board theme* in the popup (saved in `chrome.storage.sync`, applied live).
- **Mistake heatmap.** After a review, *Show heatmap* colours the destination squares of mistakes and blunders with a semi-transparent red overlay; the more often a square was hit, the redder it is.
- **Guess the move** mode. Load a PGN or use the game on the board, choose a side and play its moves while the rest of the game and the engine stay hidden. A guess succeeds if it is the game move or Stockfish rates it at most 0.50 worse for the side to move; otherwise the game move and both evaluations are shown with green and red arrows. The panel tracks progress and the share of moves found.
- Draw texts ("Draw" / «Ничья» and the reasons) and all new UI texts in `en.json` and `ru.json`.

### Changed
- **Arrows** were redrawn: a round tail, a filled head with softly rounded corners, a shaft 20–24% of a square wide (24% for the accented arrow), and a tip that stops 0.2 squares before the target centre so the piece stays visible. The web board, the trainer and the extension overlay share the geometry.
- `AnalysisManager` gains `loadGame()` and `evaluate()`, and the board service gains `isDraw()`, `isStalemate()`, `isThreefoldRepetition()`, `isInsufficientMaterial()` and `drawReason()`.
- README, CONTRIBUTING and SECURITY describe the single optional network request of the web app; the extension still makes none.

### Fixed
- **Draws.** Stalemate, insufficient material, the fifty-move rule and threefold repetition (detected from the game history) are now shown as **0.00** on a grey eval bar with a *Draw* badge and the reason, without asking the engine, and the move explanation says why the game is drawn. The extension overlay shows the grey 0.00 bar for stalemate and insufficient material too (it sees neither the game history nor the move counters).
- UCI scores are reconciled with chess.js: `mate 0` stays checkmate of the side to move, while stalemate (`cp 0`, or `mate 0` from engines that send it) and every other drawn position become exactly 0.00. A Black-to-move `cp 0` no longer turns into `-0`.

## [0.6.2] — Boosty donation link

### Fixed
- Fixed: replaced GitHub Sponsors with Boosty for donation links (works in Russia).
  - The *❤️ Support the Project* links in the web app, the extension popup and the trainer page open https://boosty.to/vladnoflip/donate. The constant is renamed to `SUPPORT_URL` in `src/core/support.ts`.
  - `.github/FUNDING.yml`: the `github` entry is commented out, and `custom` points to Boosty.
  - README: the *Sponsor* badge and the "Support the Project" section link to Boosty.
  - The e2e check of the popup link now expects the Boosty URL.

## [0.6.1] — Sponsorship links

Added donation and sponsorship links. The project stays completely free under GPL-3.0.

### Added
- `.github/FUNDING.yml` with GitHub Sponsors, which shows the *Sponsor* button on the repository page. Ko-fi, Buy Me a Coffee and custom links are prepared as comments.
- A small *❤️ Support the Project* link in the web app footer, at the bottom of the extension popup and on the trainer page. It opens GitHub Sponsors in a new tab and needs no new extension permissions; the URL is defined once in `src/core/support.ts`.
- Dictionary entries: "Support the Project" / «Поддержать проект» and "Buy me a coffee" / «Угостить кофе» (the latter is the link tooltip).
- README: a *Sponsor* badge and a "Support the Project" section.
- E2E check that the popup link points to GitHub Sponsors and opens in a new tab.

## [0.6.0] — Expanded opening book and granular trainer categories

Expanded opening book and granular trainer categories.

### Added
- **Trainer sections.** 19 granular sections grouped into tabs.
  - *Gambits*: King's Gambit (C30–C39), Queen's Gambit (D06–D69), Evans (C51–C52), Benko (A57–A59), Budapest (A51–A52) and Muzio (C37), plus all gambits.
  - *Indian*: Nimzo-Indian (E20–E59), King's Indian (E60–E99), Queen's Indian (E12–E19) and Grünfeld (D70–D99), plus all Indian defences.
  - *Semi-open*: Sicilian, French, Caro-Kann, Alekhine and Scandinavian.
  - *Closed*: Slav.
  - *All*: an overview.

  Each section shows its number of book lines.
- **Explorer search with autocomplete.** It accepts English names, Russian words («Найдорф», «Эванс») and ECO codes, matches names without diacritics (Grünfeld = Grunfeld), and plays the chosen line on the board.
- **Explorer name tree.** It goes from family to variation to sub-variation (Sicilian Defense → Najdorf Variation → English Attack), with line counts and ECO ranges. The path to the current opening opens automatically.
- **Tests** for search, the tree, every section's ECO range and family, the defining move orders of the new gambits, and complete trainer lines played out on the real book.

### Changed
- **Section filters.** Sections now filter by an ECO range and the family name, which keeps out stray lines that share an ECO code. This also changes three existing sections:
  - Sicilian, French and Caro-Kann gained ECO ranges;
  - Slav is now D10–D19, so Semi-Slav lines (D43–D49) moved to the Queen's Gambit section.
- **Trainer section picker.** On the trainer site, it uses tabs and compact cards showing the move order, ECO range, line count and accuracy. In the web app it is a grouped list with line counts.

### Verified
- The bundled book is the complete lichess-org/chess-openings set: all five TSV files are identical to the upstream `master` (3,865 lines, all 500 ECO codes). Nothing was missing.

## [0.5.1] — CI fix

### Fixed
- Fixed CI failure by tracking tests/fixtures/stockfish18-multipv3.log (ignored by *.log rule). No code changes.

## [0.5.0] — Bilingual UI

### Added
- English interface alongside Russian across the whole UI: the web app (analyzer, openings, trainer mode) and the extension (popup and trainer page). The overlay itself only shows scores, SAN moves and opening names, so it has no text to translate.
- Automatic language detection from `navigator.language`: a Russian system language gives the Russian UI, anything else gives English.
- Manual language override:
  - in the web app under *Engine settings → Language*, saved in `localStorage`;
  - in the extension popup under *Language*, saved in `chrome.storage.sync` and also used by the trainer page.
- Dictionaries in `src/locales/en.json` and `src/locales/ru.json` (213 keys). TypeScript rejects a key missing from the Russian dictionary, and tests check that both dictionaries have the same keys and placeholders.
- End-to-end checks for the popup in both languages and for an English-only trainer page.

### Changed
- Core modules return translatable messages (`{ key, params }`) instead of Russian strings: move explanations, trainer feedback, FEN/PGN validation errors, move-class labels and durations. Text that is already on screen switches language immediately.
- `npm run screenshots` forces the English UI and refuses to save a screenshot that contains Russian text. All five images in `docs/screenshots/` were re-captured in English.
- Technical engine and data errors are now in English.
- README: the interface is no longer described as Russian-only.

## [0.4.0] — Phase 3D

### Added
- The opening trainer saves its progress in `localStorage`, separately for the web app and for the extension (the two are not synchronized): the current line, session statistics and lifetime totals per section. An unfinished line is restored when the trainer is reopened. Corrupted or tampered data is ignored, and blocked storage is tolerated.
- A standalone trainer site inside the extension (`extension/trainer.html`), opened from the popup. It has section cards with accuracy rings, a soft paper-and-sage theme with automatic dark mode, engine hints after a mistake, and its own engine worker.
- cburnett chess pieces (GPLv2+, as used on lichess) in the web app and on the trainer site.
- A font family and text size setting in the extension. It applies to the overlay, the popup and the trainer site, and uses system fonts only.
- Move sounds synthesized with Web Audio, with an on/off switch and a volume control.
- Drag-and-drop moves (mouse, pen and touch) alongside click-to-move. Pieces slide on every move, including castling rooks and jumps through a game.

### Changed
- Arrows were redesigned: rounded shafts, L-shaped knight arrows, softened heads and a shadow. Every arrow, including additional MultiPV arrows, has a 0–100 score badge.
- Arrows and score bars use discrete colour steps: red, orange, yellow, green, dark green, and blue for brilliant moves.
- All arrows have the same constant opacity (0.95); the selected arrow is only wider.
- The score curve is stricter (0→100, 2→90, 5→75, 10→55, 15→40, 20→25, 30→10, 40+→0 pp). Explanation labels follow the classification thresholds.

### Fixed
- Stepping through the move list no longer scrolls the whole page away from the board.

## [0.3.0] — Phase 3: MultiPV, scoring, openings, trainer

### Added
- MultiPV (1/3/5) in `EngineService` and in the web app, with ranked candidates, a variants panel and per-candidate arrows.
- 0–100 move scores based on the loss of win probability (Lichess formula), a colour scale, and a brilliant flag (best move, a sacrifice of at least 200 cp by SEE, and an evaluation that stays at least +0.50 or a forced mate).
- Text explanations of moves from engine lines and chess.js heuristics (no language model).
- An opening book from lichess-org/chess-openings (CC0) with position-based lookup, an explorer with ECO/name/side filters, and "in theory" markers.
- An opening trainer with sections for Indian defences, gambits, Sicilian, French, Caro-Kann, Slav and an overview.
- In the extension: MultiPV arrows, a compact variants panel, and an opening indicator shown only while the position is in theory.

## [0.2.0] — Phase 2: Chrome extension

### Added
- A Manifest V3 extension with a service worker, an offscreen document hosting Stockfish, and a content script with a closed-shadow-DOM overlay (eval bar, best-move arrow).
- Board readers for chess.com and lichess, with hard-coded fair-play guards: chess.com bot games and analysis boards (path and board id must match), and lichess analysis boards only.
- A popup with settings: overlay toggles, "hints only on my turn", depth cap, threads and hash size.
- An end-to-end suite in Chrome for Testing on local fixture pages.

## [0.1.0] — Phase 1: analyzer

### Added
- A web app (React, TypeScript strict, Vite) with Stockfish 18 lite WASM in a Web Worker. The multi-threaded build is used when the page is cross-origin isolated.
- FEN input with validation and a debounced live mode, PGN loading and navigation, and click-to-move on an SVG board.
- An evaluation bar, a best-move arrow, the principal variation, and depth, nodes, NPS and time.
- A full-game review with best/good/inaccuracy/mistake/blunder classification by win-probability loss.
- Unit tests and integration tests that run the real Stockfish WASM in Node.

[0.7.3]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.7.3
[0.7.2]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.7.2
[0.7.1]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.7.1
[0.7.0]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.7.0
[0.6.2]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.6.2
[0.6.1]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.6.1
[0.6.0]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.6.0
[0.5.1]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.5.1
[0.5.0]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.5.0
[0.4.0]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.4.0
