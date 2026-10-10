# Pen Glyphs for Obsidian — Spec

An Obsidian plugin that brings Dossier/Allume-style stylus glyph commands to Obsidian on iPad. The pen draws command glyphs (X to delete, lasso to select, etc.); fingers keep doing what they do now. Inspired by Ink & Switch's Dossier prototype: https://medium.com/@hirodusk/the-ipad-as-a-fast-precise-tool-for-creativity-21384ea18659

## Goals

- Distinguish Apple Pencil from finger input and give the pen its own command vocabulary.
- Recognize drawn glyphs and run commands on whatever the glyph was drawn over.
- No-wait interaction: no long-presses, no context menus, instant feedback.
- Learnable: a cheatsheet listing every glyph, and a flash notice naming each command as it runs.
- Start with **Canvas** (spatial cards, closest to Dossier's model); extend to the Markdown editor later.

## Non-goals (v1)

- Freehand ink/annotation storage (other plugins do this).
- Apple Pencil hardware gestures: barrel double-tap, squeeze, barrel roll. These go through native UIKit APIs (`UIPencilInteraction`) that aren't exposed to Obsidian's web view.
- Desktop or iPhone support. The plugin should load harmlessly elsewhere but only activate on iPad.

## Platform constraints

- Obsidian on iPad runs plugins as JavaScript in a WebKit web view. No Node.js or Electron APIs. Set `isDesktopOnly: false` in `manifest.json`.
- Gate activation with `Platform.isIosApp && Platform.isTablet` (confirmed on an M5 iPad Pro).
- Apple Pencil arrives as Pointer Events with `pointerType === "pen"`, plus `pressure`, `tiltX`/`tiltY` (and possibly `altitudeAngle`/`azimuthAngle`). Fingers arrive as `pointerType === "touch"`.
- **Scribble conflict:** iPadOS Scribble converts handwriting to text in editable fields, including CodeMirror's contenteditable. In the editor this will fight the plugin. Canvas is less affected except inside text nodes being edited. Options: document turning Scribble off, or only claim pen input while a "glyph mode" is active (see Settings).
- **Dual event streams:** iPadOS WebKit fires pointer events *and* touch events (then compatibility mouse events) for one contact. `preventDefault()` on `pointerdown` does not cancel the matching `touchstart`. Stylus touches are tagged `touch.touchType === "stylus"`, so they can be blocked without touching fingers. The input spike measures which family Canvas actually listens to.
- Canvas internals (`view.canvas`, `canvas.nodes`, selection, removal, save) are **undocumented**. Isolate all access behind one adapter module so breakage is contained.

## Architecture

```
src/
  main.ts            Plugin lifecycle, settings, view registration
  input/
    PenCapture.ts    Pointer listeners, stroke collection, palm/finger handling
    Overlay.ts       Transparent canvas that renders the in-progress stroke
  recognize/
    Recognizer.ts    Wrapper around $1 / $P, template storage, thresholds
    templates.ts     Built-in glyph templates
  targets/
    CanvasAdapter.ts All Canvas-internals access (hit-test, select, delete, copy, paste)
    EditorAdapter.ts (v2) CodeMirror 6 hit-testing and edits
  commands/
    registry.ts      Glyph → command mapping per target context
  ui/
    Flash.ts         Brief centered notice naming the command
    Cheatsheet.ts    Modal listing glyphs and commands
    DebugPanel.ts    On-screen event/recognition log (dev only)
```

## Input handling

1. Attach `pointerdown`/`pointermove`/`pointerup`/`pointercancel` listeners in the **capture phase** on the active Canvas view's container.
2. On `pointerdown` with `pointerType === "pen"`: call `preventDefault()` and `stopPropagation()`, capture the pointer (`setPointerCapture`), and start a stroke. Set `touch-action: none` on the container while glyph handling is active so the pen doesn't scroll or pan.
3. Collect points `{x, y, t, pressure}` in client coordinates. Use `getCoalescedEvents()` when available for smoother strokes (feature-detect; don't assume support).
4. Render the live stroke on an overlay `<canvas>` (pointer-events: none, devicePixelRatio-aware). Fade it out after recognition.
5. Finger (`touch`) events pass through untouched, so pan/zoom/drag keep working. Track active touches so a finger held down during a pen stroke can act as a modifier (v2).
6. **Taps:** a pen contact of at most 250 ms whose bounding box is under 24 px across is a tap, not a glyph. (Real taps drift up to ~15 px; 24 px is also the recognizer's minimum glyph size, so no quick contact falls between the two.) Pen tap on a node = select it; pen tap on empty canvas = pass through to default behavior (or create a text node; make configurable).
7. Ignore pen input while a Canvas text node is in edit mode, so writing/Scribble inside nodes still works.

## Recognition

Single strokes, recognized the moment the pen lifts (`src/recognize/`). Each glyph uses whatever separates it best on real Pencil input:

1. Bounding-box diagonal under 24 px: not a glyph.
2. Straightness (end-to-end distance / path length) ≥ 0.85: **line**.
3. Closes on itself (either end comes back near the other end's first/last 30% of the path): a loop. Too much ink for one loop (> 1.25× the bounding-box perimeter) is a scribble-out → none. Otherwise count sharp corners: 0–2 → **lasso**; 3–4 and rectangular (convex hull fills ≥ 0.7 of the bounding box) → **square**; anything else → none.
4. Otherwise **$P** (ported from the reference implementation, BSD notice kept) against built-in templates for **x**, **caret** and **v**. The nearest template wins if within its glyph's limit (caret 0.95, v 1.22, x 1.38), else none. $P is orientation-sensitive, which tells caret from v.

Thresholds were tuned on fixtures recorded on the author's iPad (`test/fixtures/gestures.json`, imported by `scripts/import-fixtures.mjs`). Every x/caret/v fixture is a built-in template (`scripts/build-templates.ts`). Accuracy is tested leave-one-out: each fixture must be recognized by templates built from all the others, and every scribble rejected. Per-glyph distance limits sit midway between the furthest real fixture and the nearest scribble under that measure. Recognition takes ~3 ms per stroke on a Mac with 55 templates. Templates are the author's own strokes; v2 lets users record their own.

**Improving recognition:** when a glyph is misread, save it as a fixture with the intended label, re-import, rebuild templates, and re-check the limits against the leave-one-out distances.

Misses gray out the ink; hits clear it almost immediately. The debug panel logs each result with the nearest alternatives.

## Glyph vocabulary (v1, Canvas)

| Glyph | Drawn over | Command |
|---|---|---|
| X | a node | If the X hits a selected card, delete the whole selection; otherwise delete the card(s) under the X. No need to select first. |
| Lasso (closed loop) | any area | Select nodes whose centers are inside the loop; a lasso around nothing clears the selection |
| Caret ^ | a node or selection | Copy (Allume's model) |
| V | empty space | Paste at the V's point (Allume's model) |
| Square (closed, cornered) | empty space | Create a text card filling the square's bounds and open it for editing |
| Pen tap | a node / empty canvas | Select the node / clear the selection |
| Line from one card to another | two nodes | Connect them with an edge with an arrow at the card where the stroke ends; any direction, slight curves fine. The edge attaches to the side the stroke last left the first card through and the side it first entered the second card by. |

Lasso vs square: both are closed loops. Context decides first: a closed loop that encloses one or more card centers is a lasso (select), whatever its shape; a closed loop over empty space is a square (new card) if it has corners. This keeps a rectangular lasso around cards from creating a card.

Caret and V are mirror images, so the recognizer must stay orientation-sensitive ($P is, as long as we don't add rotation invariance).

Targets are resolved by hitting the gesture's bounding box (X, ^) or its point (V: the bottom vertex) against node bounds, converted from client to canvas coordinates through `CanvasAdapter`. If the gesture hits the current selection, apply the command to the whole selection.

Every destructive action must be undoable. Use Canvas's own history if reachable through the adapter; otherwise snapshot the canvas data before the change and register an undo.

## Canvas internals

Confirmed on Obsidian 1.14.4 (desktop) with the "Inspect canvas internals" and "Probe canvas behavior" dev commands; all access lives in `src/targets/CanvasAdapter.ts`, which reports missing methods instead of failing mid-command.

- Coordinates: `canvas.posFromClient({x, y})` converts client to canvas coordinates. Cards store top-left `x, y, width, height`.
- Hit-testing: `hitTestNode(pos)` (topmost card at a point), `getIntersectingNodes({minX, minY, maxX, maxY})`.
- Selection: `selection` (Set), `selectOnly`, `selectAll(items)`, `deselectAll`.
- Delete: `removeNode(node)` (also removes its edges), `deleteSelection()`.
- Create: `createTextNode({pos, size, text, focus, save})`. `pos` is the top-left corner. `focus` (default true) selects the card and calls `startEditing()`.
- Connect: no create-edge method. `importData({nodes: [], edges: [edge]})` adds an edge; without its second (`clear`) argument it never removes anything. `fromSide`/`toSide` (`top`/`right`/`bottom`/`left`) set where the edge attaches; omitted ones are chosen by Canvas from the cards' relative positions.
- Undo: `requestSave()` records a history entry (debounced), so Canvas's own undo/redo reverts glyph commands. `createTextNode` saves unless `save: false`.

## Editor (v2)

| Glyph | Over | Command |
|---|---|---|
| Strike-through (horizontal line) | text | Delete the struck range |
| Lasso | text | Select enclosed range |
| Caret ^ | between characters | Place cursor there and open the keyboard (open question: conflicts with caret = copy on Canvas; revisit before v2) |

Use CodeMirror 6's `EditorView.posAtCoords` to map points to document positions, and transactions for edits. Requires resolving the Scribble conflict.

## Feedback

- **Flash notice:** brief centered label naming the command ("delete card", "paste"), fading out after ~600 ms. Use the same names as the cheatsheet.
- Stroke fades out on recognition. On a miss, stroke shakes or turns gray briefly.

## Cheatsheet

A modal opened by a command palette entry ("Pen Glyphs: Show cheatsheet") and optionally a ribbon icon. Shows each glyph as a small SVG drawn from its template, plus its command name and context.

## Settings

- Enable/disable per context (Canvas, Editor).
- Glyph mode: **always on** vs **toggle** (a command or ribbon button switches glyph mode on/off, so Scribble keeps working when it's off).
- Recognition threshold.
- Pen tap on empty canvas: pass through / create text node.
- Show debug panel.

## Development and testing

- Scaffold from the official obsidian-sample-plugin (esbuild, TypeScript).
- Build on the Mac and sync the build output into an iCloud vault at `.obsidian/plugins/pen-glyphs/` so the iPad picks it up; reload the plugin on the iPad.
- Remote debugging: check whether Obsidian's iOS web view is inspectable from Safari Web Inspector on a Mac. If it isn't, rely on `DebugPanel`, which logs pointer types, stroke point counts, recognition results and scores on screen.
- Keep the recognizer and command registry pure and unit-test them on desktop with recorded stroke fixtures. Add a dev command that saves the last stroke as JSON to the vault, to build fixtures from real Pencil input.
- **Coverage: 100%** of `src/` (lines, branches, functions, statements), enforced by `npm run check`, which `npm run build` runs first. No pre-commit hook. Tests run in Vitest with happy-dom against a fake of the Obsidian API (`test/obsidian.ts`). Code that is genuinely inappropriate to test may be excluded with a `v8 ignore` comment explaining why, but only after discussion.
- Coverage proves code ran under test, not that iPadOS WebKit behaves as the tests assume. On-device protocols remain the check for input behavior; tests replay the event sequences recorded on device.

## Milestones

1. ✅ **Input spike:** on iPad, log `pointerType` for pen vs finger on a Canvas, and confirm `preventDefault` on pen stops panning while fingers still pan. *This validates the whole approach; stop and reassess if it fails.*
2. ✅ Stroke overlay rendering, hover dot, fixture recording.
3. ✅ Recognizer (x, lasso, caret, v, square, line); debug panel showing results.
4. ✅ `CanvasAdapter` and canvas commands: lasso select, X delete (with undo), square new card, line connect, pen tap select. Starts with a dev command that dumps the Canvas internals available in the running Obsidian version.
5. Flash notices and cheatsheet.
6. Copy/paste glyphs, settings, glyph-mode toggle.
7. v2: editor glyphs, custom templates, finger-as-modifier.

## Decisions

Settled 2026-10-09:

- **Pen gives up pan/drag on Canvas.** Fingers move things; the pen issues commands.
- **Scribble:** fine to lose inside Obsidian if necessary, but it must keep working elsewhere on the iPad. Prefer solutions scoped to Obsidian (or to glyph mode).
- **Why Canvas first:** the author mostly writes Markdown but under-uses Canvas because of gesture friction. The v1 test is whether glyphs make Canvas meaningfully more useful.
- **Recognizer:** $P; a single-stroke X is acceptable to the author. Lasso detected geometrically (the path closes on itself + encloses area) rather than by template: real lassos overshoot their start, so endpoint distance alone fails.
- **Single strokes only (for now):** each stroke is recognized the moment the pen lifts, with no wait for a possible second stroke. Revisit if a glyph needs two strokes or single-stroke recognition proves inaccurate.
- **Ink weight:** the author writes at 0.1-0.3 pressure, so full ink width is reached at 0.35.
- **Hover:** target device is an M5 iPad Pro with Apple Pencil Pro. Use hover (e.g. previewing the target) when present; degrade cleanly without it.
- **Pen tap vs edit:** decide empirically: compare pen double-tap-to-edit against finger-tap-to-edit.
- **Distribution:** personal use first, community plugin later. Before publishing: settle licensing (incl. vendored $P code) and contact the Allume team.
- **Dev loop:** a dedicated test vault synced with Obsidian Sync (plugin + active-plugin-list sync enabled); Safari Web Inspector over USB if Obsidian's web view is inspectable.

## Spike findings

From the first on-device log (2026-10-09, Obsidian 1.14.4, M5 iPad Pro + Pencil Pro):

- With no blocking, Canvas ignores pen drags (no pan, no card drag). Pen **taps** act through compatibility mouse events (`mousedown mouseup click`, `dblclick`): tap selects a card, double-tap on empty canvas creates one. Canvas does handle `pointerdown` itself on a card's drag handle (`defaultPrevented`).
- Blocking pen pointer events suppresses `mousedown`/`mouseup` but `click` still arrives.
- Blocking stylus touch events (`touchType === "stylus"`) suppresses all compatibility mouse events including `click`.
- **Chosen: block both (mode `all`).** Confirmed with the full protocol: no pen effect on Canvas (no pan, drag, select, or compatibility mouse events), finger pan/pinch/drag unaffected, Scribble inside an editing card unaffected.
- Scribble consumes pen strokes natively: while writing in an editing card, no pointer or touch events reach the web view at all (not even hover). The "ignore pen in editing node" check never fired. Pen strokes that start outside the editing card do reach us and are blocked, so with glyphs on, ending an edit needs a finger tap.
- Pencil hover arrives as pen `pointermove` with `buttons === 0`; position only, angles read as constant (`altitudeAngle` π/2, `azimuthAngle` 0) while hovering.
- `getCoalescedEvents()` works, but iPadOS dispatches one `pointermove` per Pencil sample (~240 Hz) while each event's coalesced list repeats every sample since the last frame, so naive use records each point twice. Keep only samples newer than the last recorded one. Pressure and tilt/altitude/azimuth are reported on contact.

## Open questions to verify early

- ~~Exact `Platform` flags for iPad detection.~~ Confirmed on device: `isIosApp=true isTablet=true isPhone=false isMobileApp=true`.
- ~~Whether pen pointer events reach the plugin before Canvas's own handlers, and whether Canvas uses pointer or touch events internally.~~ They do (window capture phase); Canvas mostly reacts to compatibility mouse events (see Spike findings).
- How to reach Canvas undo history, node removal, selection, clipboard and client→canvas coordinate conversion in the current Obsidian version.
- ~~Whether `getCoalescedEvents()` and Pencil hover events are available in Obsidian's iOS web view.~~ Both available (see Spike findings).
- Whether Obsidian's iOS web view is inspectable from Safari.
