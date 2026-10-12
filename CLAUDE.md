# Pen Glyphs: notes for Claude

Apple Pencil glyph commands for Obsidian Canvas on iPad. Read **SPEC.md** first: it holds the design, decisions (with reasons), on-device findings, the recognition pipeline, the confirmed Canvas internals, and milestone status. **README.md** has the status line, dev setup, and per-milestone device test protocols.

## Workflow

- The author tests on an iPad (Obsidian Sync). `npm run build` copies the plugin into every vault listed in `.vault-path` (gitignored, one vault per line); Sync carries it to the iPad.
- New builds only load on the iPad after **force-quitting Obsidian**; toggling the plugin can leave old code running. The debug panel title and the first log line show the compiled-in version (`__PLUGIN_VERSION__`), so ask the author to confirm it. Bump the version in both `manifest.json` and `package.json` for each build meant for the device.
- Plan before building: the author likes to review a plan and see how it fits the spec, then gets a summary of what changed and what to test on device.
- Device feedback arrives as logs in the vault's `pen-glyphs-logs/` and recorded strokes in `pen-glyphs-fixtures/` (both readable directly from the vault paths in `.vault-path`). Developer tools must be on in the plugin settings for the debug panel and dev commands.

## Rules

- **100% coverage** of `src/` (lines, branches, functions, statements), enforced by `npm run check`; `npm run build` runs it first. Run `npm run check` before every commit. No pre-commit hook. If something seems genuinely untestable, raise it with the author before adding a `v8 ignore`.
- All Canvas internals access stays in `src/targets/CanvasAdapter.ts`. Confirm undocumented behavior with the "Inspect canvas internals" / "Probe canvas behavior" dev commands (run on the Mac, where the report can be read immediately) before relying on it; record findings in SPEC.md "Canvas internals".
- Recognition thresholds are tuned on real strokes. To improve recognition: `node scripts/import-fixtures.mjs` (applies `scripts/relabels.json`), `node scripts/build-templates.ts`, then check the leave-one-out tests in `test/Recognizer.test.ts` and re-derive limits as documented in `Recognizer.ts`.
- Provenance matters: the repo is public (MIT). Keep the $P license header in `src/recognize/pdollar.ts` verbatim and `@license`-marked, update THIRD_PARTY_NOTICES.md for any third-party code, and verify external links before publishing them.
- Commits and pushes only when the author asks.
