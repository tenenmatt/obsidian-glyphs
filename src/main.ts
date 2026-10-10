import { Notice, Platform, Plugin } from "obsidian";
import { GestureLog, SaveFixtureModal } from "./dev/fixtures";
import { Overlay } from "./input/Overlay";
import { PenCapture } from "./input/PenCapture";
import { PenStroke, strokeStats } from "./input/strokes";
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

	override async onload(): Promise<void> {
		const data = (await this.loadData()) ?? {};
		this.settings = {
			glyphMode: data.glyphMode ?? DEFAULT_SETTINGS.glyphMode,
			showDebugPanel: data.showDebugPanel ?? DEFAULT_SETTINGS.showDebugPanel,
		};

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
		this.panel.log(`loaded ${this.manifest.version}; glyph mode ${this.settings.glyphMode ? "on" : "off"}`);

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
		this.overlay.end(stroke);
		this.gestures.add(stroke);
		const first = stroke.points[0];
		if (stroke.kind === "tap") {
			this.panel.log(`tap at (${Math.round(first.x)},${Math.round(first.y)}) on ${describe(stroke.target)}`);
			return;
		}
		const s = strokeStats(stroke.points);
		this.panel.log(
			`stroke: ${stroke.points.length} pts, ${Math.round(s.ms)}ms, length ${Math.round(s.length)}px,` +
				` box ${Math.round(s.width)}×${Math.round(s.height)}, max pressure ${s.maxPressure.toFixed(2)}`,
		);
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
			`- plugin ${this.manifest.version}, glyph mode at save: ${this.settings.glyphMode ? "on" : "off"}\n` +
			`- ${navigator.userAgent}`;
		await this.panel.saveToVault(header);
	}
}
