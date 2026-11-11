# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

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

[0.4.0]: https://github.com/Vladnoflip/live-chess-analyzer/releases/tag/v0.4.0
