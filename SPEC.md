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
- Gate activation with `Platform.isIosApp && Platform.isTablet` (verify exact flags in the current Obsidian API typings).
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
6. **Taps:** a pen stroke shorter than ~8 px and ~200 ms is a tap, not a glyph. Pen tap on a node = select it; pen tap on empty canvas = pass through to default behavior (or create a text node; make configurable).
7. Ignore pen input while a Canvas text node is in edit mode, so writing/Scribble inside nodes still works.

## Recognition

- Use the **$P point-cloud recognizer** (handles multistroke glyphs like a two-stroke X) or **$1 Unistroke** if keeping v1 single-stroke. Reference JS implementations exist from the University of Washington ($1, $N, $P pages under depts.washington.edu/madlab/proj/dollar/). Check their license before vendoring; otherwise reimplement (both are small).
- Multistroke: group strokes that start within ~300 ms of the previous stroke ending into one gesture.
- Return `{name, score}`. Below a configurable threshold, show a subtle "?" flash and do nothing.
- Ship built-in templates; v2 lets users record their own templates in settings.

## Glyph vocabulary (v1, Canvas)

| Glyph | Drawn over | Command |
|---|---|---|
| X | a node | Delete node(s) under the X |
| Lasso (closed loop) | any area | Select nodes whose centers are inside the loop |
| C | a node or selection | Copy |
| Caret ^ | empty space | Paste at the caret's point |
| Pen tap | a node | Select node |
| Horizontal line through 2+ nodes | nodes | Connect them with edges, in stroke order (stretch goal) |

Targets are resolved by hit-testing the gesture's bounding box (X, C) or start point (^) against node bounds, converted from client to canvas coordinates through `CanvasAdapter`. If the gesture hits the current selection, apply the command to the whole selection.

Every destructive action must be undoable. Use Canvas's own history if reachable through the adapter; otherwise snapshot the canvas data before the change and register an undo.

## Editor (v2)

| Glyph | Over | Command |
|---|---|---|
| Strike-through (horizontal line) | text | Delete the struck range |
| Lasso | text | Select enclosed range |
| Caret ^ | between characters | Place cursor there and open the keyboard |

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

## Milestones

1. **Input spike:** on iPad, log `pointerType` for pen vs finger on a Canvas, and confirm `preventDefault` on pen stops panning while fingers still pan. *This validates the whole approach; stop and reassess if it fails.*
2. Stroke overlay rendering.
3. Recognizer with X and lasso; debug panel showing scores.
4. `CanvasAdapter`: hit-test, select, delete with undo.
5. Flash notices and cheatsheet.
6. Copy/paste glyphs, settings, glyph-mode toggle.
7. v2: editor glyphs, custom templates, finger-as-modifier.

## Decisions

Settled 2026-10-09:

- **Pen gives up pan/drag on Canvas.** Fingers move things; the pen issues commands.
- **Scribble:** fine to lose inside Obsidian if necessary, but it must keep working elsewhere on the iPad. Prefer solutions scoped to Obsidian (or to glyph mode).
- **Why Canvas first:** the author mostly writes Markdown but under-uses Canvas because of gesture friction. The v1 test is whether glyphs make Canvas meaningfully more useful.
- **Recognizer:** $P (multistroke-capable); a single-stroke X is acceptable to the author. Lasso detected geometrically (closed path + area) rather than by template.
- **Hover:** target device is an M5 iPad Pro with Apple Pencil Pro. Use hover (e.g. previewing the target) when present; degrade cleanly without it.
- **Pen tap vs edit:** decide empirically: compare pen double-tap-to-edit against finger-tap-to-edit.
- **Distribution:** personal use first, community plugin later. Before publishing: settle licensing (incl. vendored $P code) and contact the Allume team.
- **Dev loop:** a dedicated test vault synced with Obsidian Sync (plugin + active-plugin-list sync enabled); Safari Web Inspector over USB if Obsidian's web view is inspectable.

## Open questions to verify early

- Exact `Platform` flags for iPad detection.
- Whether pen pointer events reach the plugin before Canvas's own handlers, and whether Canvas uses pointer or touch events internally.
- How to reach Canvas undo history, node removal, selection, clipboard and client→canvas coordinate conversion in the current Obsidian version.
- Whether `getCoalescedEvents()` and Pencil hover events are available in Obsidian's iOS web view.
- Whether Obsidian's iOS web view is inspectable from Safari.
