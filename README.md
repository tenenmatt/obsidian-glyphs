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

Per-milestone device test protocols are in [TESTING.md](TESTING.md).

## Provenance

- **Author:** Matt Tenenbaum. The code was written with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding assistant: the author set the direction and design, tested every milestone on an iPad, and recorded the Pencil strokes the recognizer is tuned on; Claude wrote most of the code and tests. Commits co-authored this way say so in their trailers.
- **Inspiration:** the interaction model comes from Ink & Switch's Dossier prototype, described in [The iPad as a fast, precise tool for creativity](https://medium.com/@hirodusk/the-ipad-as-a-fast-precise-tool-for-creativity-21384ea18659), and from Allume, which has since incorporated those gestures (caret to copy and V to paste follow Allume's model). No code from either is used; this is an independent implementation for Obsidian.
- **Third-party code:** the gesture recognizer includes a TypeScript port of the $P Point-Cloud Recognizer by Vatavu, Anthony and Wobbrock, under the New BSD License. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Everything else in the plugin is original to this project; build and test tools are development dependencies only and aren't included in the built plugin.
- **Obsidian internals:** Obsidian Canvas has no public API for selecting, creating or connecting cards, so `src/targets/CanvasAdapter.ts` uses its undocumented runtime objects, as discovered with this plugin's own inspection commands. No Obsidian source code is included in this repository.
- **Recognition data:** `test/fixtures/gestures.json` and the generated `src/recognize/templates.ts` are the author's own Pencil strokes, recorded with this plugin.

## License

[MIT](LICENSE) © 2026 Matt Tenenbaum, except the $P recognizer port in `src/recognize/pdollar.ts`, which remains under the New BSD License of its original authors ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).
