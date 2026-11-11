---
name: DOM breakage (chess.com / lichess layout change)
about: The extension stopped reading the board on an allowed page after a site update
title: "[DOM] "
labels: dom-breakage
---

<!--
Only allowed pages: chess.com /play/computer and /analysis, lichess.org /analysis.
Do not report pages of games against people — the extension intentionally does nothing there.
-->

## Site and page

- Site: chess.com / lichess.org
- URL path (no game ids from games against people):

## What is broken

- [ ] No overlay at all
- [ ] Wrong position / arrows on the wrong squares
- [ ] Wrong side to move
- [ ] Opening indicator missing in a book position
- [ ] Other:

## Board markup

<!-- From DevTools → Elements. -->

- Board container tag, id and classes:
- One piece element's `class` and `style` attributes:
- Last-move highlight element (if any):

## Environment

- Extension version:
- Browser and version:
- Does the problem depend on the account (possible A/B test)? yes / no / unknown
