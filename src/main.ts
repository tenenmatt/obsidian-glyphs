import { Notice, Platform, Plugin } from "obsidian";
import { CanvasGesture, Clipboard, Outcome, runCanvasGlyph } from "./commands/canvasCommands";
import { saveCanvasProbe, saveCanvasReport } from "./dev/canvasInspector";
import { GestureLog, SaveFixtureModal } from "./dev/fixtures";
import { Overlay } from "./input/Overlay";
import { PenCapture } from "./input/PenCapture";
import { PenStroke, strokeStats } from "./input/strokes";
import { Recognizer, describeRecognition } from "./recognize/Recognizer";
import { TEMPLATES } from "./recognize/templates";
import { CanvasAdapter, canvasViewFor } from "./targets/CanvasAdapter";
import { CheatsheetModal, cheatsheetEntries } from "./ui/Cheatsheet";
import { DebugPanel } from "./ui/DebugPanel";
import { Flash } from "./ui/Flash";
import { DEFAULT_SETTINGS, PenGlyphsSettingTab, PenGlyphsSettings, loadSettings } from "./ui/SettingsTab";
import { describe } from "./util/dom";

export default class PenGlyphsPlugin extends Plugin {
	override settings: PenGlyphsSettings = { ...DEFAULT_SETTINGS };
	private panel!: DebugPanel;
	private overlay!: Overlay;
	private flash!: Flash;
	private gestures = new GestureLog();
	private clipboard: Clipboard = { data: null };
	private recognizer = new Recognizer(TEMPLATES);

	override async onload(): Promise<void> {
		this.settings = loadSettings(await this.loadData());

		// Available on desktop too, since desktop Canvas has the same internals.
		this.addCommand({
			id: "toggle-debug-panel",
			name: "Toggle developer tools",
			callback: () => this.updateSetting("showDebugPanel", !this.settings.showDebugPanel),
		});
		this.devCommand("inspect-canvas-internals", "Inspect canvas internals (dev)", () => this.inspectCanvas());
		this.devCommand("probe-canvas-behavior", "Probe canvas behavior (dev)", () => this.probeCanvas());

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
		this.flash = new Flash();
		this.register(() => this.flash.destroy());

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

		this.addSettingTab(new PenGlyphsSettingTab(this.app, this));
		this.addRibbonIcon("pen-tool", "Pen Glyphs: toggle glyph mode", () => this.toggleGlyphMode());
		this.addRibbonIcon("help-circle", "Pen Glyphs: show cheatsheet", () => this.openCheatsheet());
		this.addCommand({ id: "show-cheatsheet", name: "Show cheatsheet", callback: () => this.openCheatsheet() });
		this.addCommand({
			id: "toggle-glyph-mode",
			name: "Toggle glyph mode",
			callback: () => this.toggleGlyphMode(),
		});
		this.devCommand("save-last-gesture-fixture", "Save last gesture as fixture (dev)", () => this.openSaveFixture());
		this.devCommand("save-debug-log", "Save debug log to vault (dev)", () => this.saveLog());
		this.devCommand("copy-debug-log", "Copy debug log to clipboard (dev)", () => this.panel.copy());
		this.devCommand("clear-debug-log", "Clear debug log (dev)", () => this.panel.clear());
	}

	/** A command listed only while developer tools are on. */
	private devCommand(id: string, name: string, run: () => unknown): void {
		this.addCommand({
			id,
			name,
			checkCallback: (checking) => {
				if (!this.settings.showDebugPanel) return false;
				if (!checking) void run();
				return true;
			},
		});
	}

	openCheatsheet(): void {
		new CheatsheetModal(this.app, cheatsheetEntries(TEMPLATES)).open();
	}

	/** Apply and persist a change to one setting. Used by the settings tab, commands and controls. */
	async updateSetting<K extends keyof PenGlyphsSettings>(key: K, value: PenGlyphsSettings[K]): Promise<void> {
		this.settings[key] = value;
		await this.saveData(this.settings);
		if (key === "glyphMode") {
			this.panel.log(`---- glyph mode ${value ? "on" : "off"} ----`);
			this.panel.refreshActions();
		} else if (key === "showDebugPanel") {
			// No panel off iPad, where only the dev commands exist.
			if (value) this.panel?.show();
			else this.panel?.hide();
		}
	}

	private onStroke(stroke: PenStroke): void {
		this.gestures.add(stroke);
		const first = stroke.points[0];
		if (stroke.kind === "tap") {
			this.overlay.end(stroke, false);
			const done = this.runOnCanvas(stroke, "tap");
			this.panel.log(`tap at (${Math.round(first.x)},${Math.round(first.y)}) on ${describe(stroke.target)}: ${logText(done)}`);
			return;
		}
		const result = this.recognizer.recognize(stroke.points);
		this.overlay.end(stroke, result.glyph !== null);
		let done = "";
		if (result.glyph) {
			const outcome = this.runOnCanvas(stroke, result.glyph);
			this.flash.show(outcome.label);
			done = ` → ${logText(outcome)}`;
		} else if (this.settings.showMisses) {
			this.flash.show("?", "miss");
		}
		const s = strokeStats(stroke.points);
		this.panel.log(
			`${result.glyph ? "✓" : "?"} ${describeRecognition(result)}${done}\n` +
				`    ${stroke.points.length} pts, ${Math.round(s.ms)}ms, length ${Math.round(s.length)}px,` +
				` box ${Math.round(s.width)}×${Math.round(s.height)}, max pressure ${s.maxPressure.toFixed(2)}`,
		);
	}

	/** Run a glyph's command on the canvas the stroke was drawn on; returns what happened. */
	private runOnCanvas(stroke: PenStroke, gesture: CanvasGesture): Outcome {
		const canvas = CanvasAdapter.from(canvasViewFor(this.app, stroke.target));
		if (!(canvas instanceof CanvasAdapter)) {
			const detail = `missing: ${canvas.missing.join(", ")}`;
			new Notice(`Pen Glyphs: canvas internals unavailable (${detail})`);
			return { label: "canvas unavailable", detail };
		}
		try {
			return runCanvasGlyph(canvas, gesture, stroke.points, {
				clipboard: this.clipboard,
				cardsMatchDrawing: this.settings.cardsMatchDrawing,
			});
		} catch (err) {
			new Notice(`Pen Glyphs: ${gesture} failed: ${String(err)}`);
			return { label: `${gesture} failed`, detail: String(err) };
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
		await this.updateSetting("glyphMode", !this.settings.glyphMode);
		new Notice(`Pen glyphs ${this.settings.glyphMode ? "on" : "off"}`);
	}

	private async saveLog(): Promise<void> {
		const header =
			`# Pen Glyphs debug log\n\n` +
			`- plugin ${__PLUGIN_VERSION__}, glyph mode at save: ${this.settings.glyphMode ? "on" : "off"}\n` +
			`- ${navigator.userAgent}`;
		await this.panel.saveToVault(header);
	}
}

function logText(outcome: Outcome): string {
	return outcome.detail ? `${outcome.label} (${outcome.detail})` : outcome.label;
}
