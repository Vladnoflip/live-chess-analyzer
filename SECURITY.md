# Security Policy

## Supported versions

Only the latest release (currently 0.4.x) receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Report them privately through GitHub: go to **Security → Advisories → Report a vulnerability** in this repository (private vulnerability reporting).

Please include:
- the affected component (web app, extension service worker, offscreen document, content script, popup or trainer page);
- the steps to reproduce, and the browser and extension versions;
- the impact as you understand it.

You should receive an acknowledgement within 7 days. Once a fix is released, the advisory will be published with credit, unless you prefer to stay anonymous.

### In scope

- Code execution or data access through the extension, for example a malicious page abusing the content script or the extension messaging.
- Any way to make the extension send network requests, or read data beyond the chess board on allowed pages.
- **Any way to make the extension run on pages outside its whitelist**, especially games against human players. A bypass of the fair-play guards is treated as a security issue.

### Out of scope

- Engine strength or evaluation accuracy.
- Layout changes on chess.com or lichess that only stop the overlay from appearing. Please use the DOM breakage issue template for those.

## Fair play reminder

The extension is designed to work only against chess.com bots and on analysis pages (`chess.com/analysis`, `lichess.org/analysis`). It must never be used, modified or redistributed to give assistance in games against people; doing so violates the platforms' fair-play rules and can lead to account bans. Requests or reports aimed at enabling that will be closed.
