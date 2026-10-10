import { Notice, Platform, Plugin } from "obsidian";
import { CanvasGesture, runCanvasGlyph } from "./commands/canvasCommands";
import { saveCanvasProbe, saveCanvasReport } from "./dev/canvasInspector";
import { GestureLog, SaveFixtureModal } from "./dev/fixtures";
import { Overlay } from "./input/Overlay";
import { PenCapture } from "./input/PenCapture";
import { PenStroke, strokeStats } from "./input/strokes";
import { Recognizer, describeRecognition } from "./recognize/Recognizer";
import { TEMPLATES } from "./recognize/templates";
import { CanvasAdapter, canvasViewFor } from "./targets/CanvasAdapter";
import { DebugPanel } from "./ui/DebugPanel";
import { describe } from "./util/dom";

interface PenGlyphsSettings {
	// When off, the pen behaves exactly as it does without the plugin.
	glyphMode: boolean;
	showDebugPanel: boolean;
}

const DEFAULT_SETTINGS: PenGlyphsSettings = {
	glyphMode: true,
	showDebugPanel: true,
};

export default class PenGlyphsPlugin extends Plugin {
	override settings: PenGlyphsSettings = { ...DEFAULT_SETTINGS };
	private panel!: DebugPanel;
	private overlay!: Overlay;
	private gestures = new GestureLog();
	private recognizer = new Recognizer(TEMPLATES);

	override async onload(): Promise<void> {
		const data = (await this.loadData()) ?? {};
		this.settings = {
			glyphMode: data.glyphMode ?? DEFAULT_SETTINGS.glyphMode,
			showDebugPanel: data.showDebugPanel ?? DEFAULT_SETTINGS.showDebugPanel,
		};

		// Dev: available everywhere, since desktop Canvas has the same internals.
		this.addCommand({
			id: "inspect-canvas-internals",
			name: "Inspect canvas internals (dev)",
			callback: () => this.inspectCanvas(),
		});
		this.addCommand({
			id: "probe-canvas-behavior",
			name: "Probe canvas behavior (dev)",
			callback: () => this.probeCanvas(),
		});

		if (!(Platform.isIosApp && Platform.isTablet)) {
			console.log("[pen-glyphs] not an iPad; staying inactive");
			return;
		}

		this.panel = new DebugPanel(this, [
			{ label: () => `glyphs: ${this.settings.glyphMode ? "on" : "off"}`, run: () => this.toggleGlyphMode() },
			{ label: () => "clear", run: () => this.panel.clear() },
			{ label: () => "save log", run: () => this.saveLog() },
			{ label: () => "save stroke", run: () => this.openSaveFixture() },
		]);
		if (this.settings.showDebugPanel) this.panel.show();
		this.register(() => this.panel.hide());
		this.panel.log(`loaded ${__PLUGIN_VERSION__}; glyph mode ${this.settings.glyphMode ? "on" : "off"}`);

		this.overlay = new Overlay();
		this.register(() => this.overlay.destroy());
		this.registerDomEvent(window, "resize", this.overlay.resize);

		new PenCapture(
			{
				strokeStart: (p) => this.overlay.begin(p),
				strokeMove: (pts) => this.overlay.extend(pts),
				strokeEnd: (s) => this.onStroke(s),
				strokeCancel: () => this.overlay.cancel(),
				hover: (x, y) => this.overlay.setHover(x, y),
				hoverEnd: () => this.overlay.clearHover(),
				log: this.panel.log,
			},
			() => this.settings.glyphMode,
		).register(this);

		this.addRibbonIcon("pen-tool", "Pen Glyphs: toggle glyph mode", () => this.toggleGlyphMode());
		this.addCommand({
			id: "toggle-glyph-mode",
			name: "Toggle glyph mode",
			callback: () => this.toggleGlyphMode(),
		});
		this.addCommand({
			id: "save-last-gesture-fixture",
			name: "Save last gesture as fixture",
			callback: () => this.openSaveFixture(),
		});
		this.addCommand({
			id: "toggle-debug-panel",
			name: "Toggle debug panel",
			callback: async () => {
				if (this.panel.isShown) this.panel.hide();
				else this.panel.show();
				this.settings.showDebugPanel = this.panel.isShown;
				await this.saveData(this.settings);
			},
		});
		this.addCommand({ id: "save-debug-log", name: "Save debug log to vault", callback: () => this.saveLog() });
		this.addCommand({ id: "copy-debug-log", name: "Copy debug log to clipboard", callback: () => this.panel.copy() });
		this.addCommand({ id: "clear-debug-log", name: "Clear debug log", callback: () => this.panel.clear() });
	}

	private onStroke(stroke: PenStroke): void {
		this.gestures.add(stroke);
		const first = stroke.points[0];
		if (stroke.kind === "tap") {
			this.overlay.end(stroke, false);
			const done = this.runOnCanvas(stroke, "tap");
			this.panel.log(`tap at (${Math.round(first.x)},${Math.round(first.y)}) on ${describe(stroke.target)}: ${done}`);
			return;
		}
		const result = this.recognizer.recognize(stroke.points);
		this.overlay.end(stroke, result.glyph !== null);
		const done = result.glyph ? ` → ${this.runOnCanvas(stroke, result.glyph)}` : "";
		const s = strokeStats(stroke.points);
		this.panel.log(
			`${result.glyph ? "✓" : "?"} ${describeRecognition(result)}${done}\n` +
				`    ${stroke.points.length} pts, ${Math.round(s.ms)}ms, length ${Math.round(s.length)}px,` +
				` box ${Math.round(s.width)}×${Math.round(s.height)}, max pressure ${s.maxPressure.toFixed(2)}`,
		);
	}

	/** Run a glyph's command on the canvas the stroke was drawn on; returns what happened. */
	private runOnCanvas(stroke: PenStroke, gesture: CanvasGesture): string {
		const canvas = CanvasAdapter.from(canvasViewFor(this.app, stroke.target));
		if (!(canvas instanceof CanvasAdapter)) {
			const message = `Canvas internals unavailable (missing: ${canvas.missing.join(", ")})`;
			new Notice(`Pen Glyphs: ${message}`);
			return message;
		}
		try {
			return runCanvasGlyph(canvas, gesture, stroke.points);
		} catch (err) {
			new Notice(`Pen Glyphs: ${gesture} failed: ${String(err)}`);
			return `failed: ${String(err)}`;
		}
	}

	private async inspectCanvas(): Promise<void> {
		try {
			const path = await saveCanvasReport(this.app);
			new Notice(path ? `Saved ${path}` : "Open a canvas first");
		} catch (err) {
			new Notice(`Inspecting canvas failed: ${String(err)}`);
		}
	}

	private async probeCanvas(): Promise<void> {
		try {
			const path = await saveCanvasProbe(this.app);
			new Notice(path ? `Saved ${path}` : "Open a canvas first");
		} catch (err) {
			new Notice(`Probing canvas failed: ${String(err)}`);
		}
	}

	private openSaveFixture(): void {
		const gesture = this.gestures.lastGesture();
		if (gesture.length === 0) {
			new Notice("No pen stroke to save yet");
			return;
		}
		new SaveFixtureModal(this.app, gesture).open();
	}

	private async toggleGlyphMode(): Promise<void> {
		this.settings.glyphMode = !this.settings.glyphMode;
		await this.saveData(this.settings);
		const state = this.settings.glyphMode ? "on" : "off";
		this.panel.log(`---- glyph mode ${state} ----`);
		this.panel.refreshActions();
		new Notice(`Pen glyphs ${state}`);
	}

	private async saveLog(): Promise<void> {
		const header =
			`# Pen Glyphs debug log\n\n` +
			`- plugin ${__PLUGIN_VERSION__}, glyph mode at save: ${this.settings.glyphMode ? "on" : "off"}\n` +
			`- ${navigator.userAgent}`;
		await this.panel.saveToVault(header);
	}
}
