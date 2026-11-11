## Summary

<!-- What does this change and why? Link related issues. -->

## Checks

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:extension` (if the extension or shared modules changed)
- [ ] Tests added or updated for behaviour changes
- [ ] README / CHANGELOG updated for user-visible changes
- [ ] Screenshots re-captured with `npm run screenshots` (if the UI shown in the README changed)

## Fair play

- [ ] The extension still runs only against chess.com bots and on analysis pages; the guards in `extension/platforms/` are not weakened.
- [ ] No runtime network requests were added.
