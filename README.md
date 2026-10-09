# Pen Glyphs for Obsidian

Apple Pencil glyph commands for Obsidian Canvas on iPad. See [SPEC.md](SPEC.md).

**Status: milestone 1 (input spike).** The plugin logs pen and finger input on Canvas views and can block pen input in different ways, to test whether we can claim the pen without breaking finger gestures.

## Dev setup

```sh
npm install
echo "/path/to/Test Vault" > .vault-path   # vault root (the folder containing .obsidian)
npm run dev                                # watch; copies the plugin into the vault on every build
npm run build                              # typecheck + one production build
```

With Obsidian Sync, desktop Obsidian must have the test vault open to upload changes, and both devices need **Settings → Sync → Installed community plugins** and **Active community plugin list** turned on. On the iPad, reload the plugin by toggling it under Community plugins or by running "Reload app without saving".

## Spike test protocol

Make a test canvas with 2–3 cards. For each blocking mode (tap the `mode:` button on the debug panel, the ribbon pen icon, or run "Cycle pen blocking mode"), do the following, then press **save**. Logs land in `pen-glyphs-logs/` in the vault and sync back to the Mac.

1. Pen drag on empty canvas (did it pan?)
2. Pen drag starting on a card (did the card move?)
3. Pen tap on a card (did it select?)
4. Hover the pen over the canvas without touching
5. Two-finger pan, pinch zoom, one-finger drag of a card (should always work)
6. Double-tap a card with a finger to edit it, then write in it with the pen (Scribble should still work)

Run `off` first: it's the baseline that shows which event family Canvas consumes. Each stroke summary reports what reached Canvas and what changed on the canvas (pan, zoom, selection, node moves).

| Mode | Blocks |
|---|---|
| `off` | nothing (observe only) |
| `pointer` | pen pointer events |
| `touch` | stylus touch events |
| `all` | both, plus compatibility mouse/click events during and just after a pen stroke |
