# Pen Glyphs for Obsidian

Apple Pencil glyph commands for Obsidian Canvas on iPad: draw a lasso to select cards, an X to delete, a square to make a new card, a line to connect two cards, a caret to copy and a V to paste. Fingers keep doing what they always did. See [SPEC.md](SPEC.md) for the design.

This is a personal project, shared as-is. It isn't in Obsidian's community plugin directory.

**Status: v1 complete.** On iPad, pen glyphs act on Canvas: lasso selects, X deletes, square creates a card, a line connects two cards, a pen tap selects, caret copies and V pastes. A centered label names each action. The cheatsheet (ribbon icon, settings, or "Pen Glyphs: Show cheatsheet") lists every glyph. Settings: glyph mode, show unrecognized strokes, developer tools (debug panel and dev commands; off by default).

## Dev setup

```sh
npm install
echo "/path/to/Test Vault" > .vault-path   # vault roots (folders containing .obsidian), one per line
npm run dev                                # watch; copies the plugin into the vault on every build
npm test                                   # run tests (npm run test:watch to watch)
npm run check                              # typecheck + tests with 100% coverage required
npm run build                              # check, then one production build
node scripts/import-fixtures.mjs           # copy fixtures from the vault into test/fixtures (applies scripts/relabels.json)
node scripts/build-templates.ts            # regenerate src/recognize/templates.ts from fixtures
```

With Obsidian Sync, desktop Obsidian must have the test vault open to upload changes, and both devices need **Settings → Sync → Installed community plugins** and **Active community plugin list** turned on. On the iPad, reload the plugin by toggling it under Community plugins or by running "Reload app without saving".

## Test protocol (milestone 6)

1. **Caret** on an unselected card: flashes "copy card". **V** somewhere else: a copy appears centered on the V's bottom point, selected; flashes "paste card".
2. Select two connected cards (lasso), **caret** one of them: "copy 2 cards". **V** twice in different places: two copies, each with its own connection between its cards.
3. **Caret** on empty canvas: "nothing to copy". After restarting Obsidian, **V** first: "nothing to paste".
4. Copy on one canvas, open another canvas, **V**: pastes there.
5. **Undo** after a paste removes the pasted cards.

## Test protocol (milestone 5)

1. Each glyph flashes a centered label: "select 2 cards", "delete card", "new card", "connect", "clear selection". Pen taps don't flash.
2. An X over empty canvas flashes "no card under the x"; a line that misses a card flashes "connect: start and end on two cards".
3. A scribble flashes a gray "?". Turn off **Settings → Pen Glyphs → Show unrecognized strokes**: scribbles no longer flash (the ink still grays).
4. Run **Pen Glyphs: Show cheatsheet**: seven glyphs with drawings and descriptions.
5. Toggle **Debug panel** and **Glyph mode** in settings; both take effect immediately.

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

## Provenance

- **Author:** Matt Tenenbaum. The code was written with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding assistant: the author set the direction and design, tested every milestone on an iPad, and recorded the Pencil strokes the recognizer is tuned on; Claude wrote most of the code and tests. Commits co-authored this way say so in their trailers.
- **Inspiration:** the interaction model comes from Ink & Switch's Dossier prototype, described in [The iPad as a fast, precise tool for creativity](https://medium.com/@hirodusk/the-ipad-as-a-fast-precise-tool-for-creativity-21384ea18659), and from Allume, which has since incorporated those gestures (caret to copy and V to paste follow Allume's model). No code from either is used; this is an independent implementation for Obsidian.
- **Third-party code:** the gesture recognizer includes a TypeScript port of the $P Point-Cloud Recognizer by Vatavu, Anthony and Wobbrock, under the New BSD License. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Everything else in the plugin is original to this project; build and test tools are development dependencies only and aren't included in the built plugin.
- **Obsidian internals:** Obsidian Canvas has no public API for selecting, creating or connecting cards, so `src/targets/CanvasAdapter.ts` uses its undocumented runtime objects, as discovered with this plugin's own inspection commands. No Obsidian source code is included in this repository.
- **Recognition data:** `test/fixtures/gestures.json` and the generated `src/recognize/templates.ts` are the author's own Pencil strokes, recorded with this plugin.

## License

[MIT](LICENSE) © 2026 Matt Tenenbaum, except the $P recognizer port in `src/recognize/pdollar.ts`, which remains under the New BSD License of its original authors ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
