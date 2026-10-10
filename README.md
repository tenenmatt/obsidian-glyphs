# Pen Glyphs for Obsidian

Apple Pencil glyph commands for Obsidian Canvas on iPad. See [SPEC.md](SPEC.md).

**Status: milestone 2 (stroke overlay).** On iPad, the pen is claimed on Canvas: it draws ink that fades out, shows a hover dot, and does nothing else yet. Fingers behave normally. Elsewhere the plugin stays inactive.

## Dev setup

```sh
npm install
echo "/path/to/Test Vault" > .vault-path   # vault root (the folder containing .obsidian)
npm run dev                                # watch; copies the plugin into the vault on every build
npm run build                              # typecheck + one production build
```

With Obsidian Sync, desktop Obsidian must have the test vault open to upload changes, and both devices need **Settings → Sync → Installed community plugins** and **Active community plugin list** turned on. On the iPad, reload the plugin by toggling it under Community plugins or by running "Reload app without saving".

## Test protocol (milestone 2)

On a canvas with a few cards, with glyph mode on (ribbon pen icon, the `glyphs:` button on the debug panel, or "Toggle glyph mode"):

1. Draw strokes on empty canvas and over cards. Ink should appear under the pen tip with no noticeable lag, get thicker as you press harder, and fade about half a second after you lift.
2. Tap with the pen. The panel should log `tap`, and a dot should flash.
3. Hover the pen near the screen. A faint dot should follow it and disappear when you move the pen away.
4. Fingers: pan, pinch, drag a card, double-tap to edit, Scribble inside a card. All should work as before.
5. The canvas zoom buttons and card toolbar should still respond to the pen (the panel logs `passed through`).
6. Draw an X, then press **save stroke** and pick `x`. Do the same for a lasso, a caret (^), a V, and a few others. Fixtures land in `pen-glyphs-fixtures/`.
7. Toggle glyph mode off: the pen should behave as it does without the plugin.

The milestone 1 input spike (blocking-mode experiments) lives in git history at `6d2f391`; its findings are in SPEC.md.
