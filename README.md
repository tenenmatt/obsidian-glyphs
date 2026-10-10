# Pen Glyphs for Obsidian

Apple Pencil glyph commands for Obsidian Canvas on iPad. See [SPEC.md](SPEC.md).

**Status: milestone 4 (canvas commands).** On iPad, pen glyphs act on Canvas: lasso selects, X deletes, square creates a card, a line connects two cards, a pen tap selects. Copy/paste (caret, v) come later. Fingers behave normally; elsewhere the plugin stays inactive.

## Dev setup

```sh
npm install
echo "/path/to/Test Vault" > .vault-path   # vault root (the folder containing .obsidian)
npm run dev                                # watch; copies the plugin into the vault on every build
npm test                                   # run tests (npm run test:watch to watch)
npm run check                              # typecheck + tests with 100% coverage required
npm run build                              # check, then one production build
node scripts/import-fixtures.mjs           # copy fixtures from the vault into test/fixtures (applies scripts/relabels.json)
node scripts/build-templates.ts            # regenerate src/recognize/templates.ts from fixtures
```

With Obsidian Sync, desktop Obsidian must have the test vault open to upload changes, and both devices need **Settings → Sync → Installed community plugins** and **Active community plugin list** turned on. On the iPad, reload the plugin by toggling it under Community plugins or by running "Reload app without saving".

## Test protocol (milestone 4)

Check the debug panel title shows the expected version. Use a test canvas you don't mind changing. Each command logs `→ <what happened>` in the panel.

1. **Tap** a card with the pen: it's selected. Tap empty canvas: selection clears.
2. **Lasso** around two or three cards: exactly the cards whose centers are inside get selected. Lasso around nothing: selection clears. A squarish loop around cards also selects (it doesn't make a card).
3. **Square** on empty space: a new card fills it and opens for editing; Scribble into it.
4. **Line** from one card to another, in various directions: an arrow connects them, pointing at the card where the stroke ended. A line that doesn't start and end on two cards does nothing.
5. **X** over an unselected card: it's deleted. Select several cards, X one of them: all selected cards are deleted. X over empty canvas: nothing.
6. **Undo** (Canvas's undo button) after each of the above reverts it.
7. Fingers, Scribble inside cards, and the canvas controls still work.

## Test protocol (milestone 3)

Check that the debug panel title reads the expected version. Then, on a canvas with a few cards:

1. Draw each glyph several times: x, lasso (around cards), caret (^), v, square (on empty space), line (card to card). Each should log `✓ <glyph>` and its ink should vanish almost at once.
2. Draw some scribbles and letters. They should log `? no glyph` and their ink should turn gray, linger, then fade.
3. When something is misread, press **save stroke** and label it with what you meant. Those fixtures become new test cases and templates: `node scripts/import-fixtures.mjs`, then `node scripts/build-templates.ts`.

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
