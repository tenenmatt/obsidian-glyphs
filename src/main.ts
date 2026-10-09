import { Notice, Platform, Plugin } from "obsidian";
import { BLOCK_MODES, BlockMode, PenCapture } from "./input/PenCapture";
import { DebugPanel } from "./ui/DebugPanel";

interface PenGlyphsSettings {
	blockMode: BlockMode;
	showDebugPanel: boolean;
}

const DEFAULT_SETTINGS: PenGlyphsSettings = {
	blockMode: "off",
	showDebugPanel: true,
};

export default class PenGlyphsPlugin extends Plugin {
	override settings: PenGlyphsSettings = { ...DEFAULT_SETTINGS };
	private panel!: DebugPanel;

	override async onload(): Promise<void> {
		this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };

		this.panel = new DebugPanel(this, [
			{ label: () => `mode: ${this.settings.blockMode}`, run: () => this.cycleBlockMode() },
			{ label: () => "clear", run: () => this.panel.clear() },
			{ label: () => "save", run: () => this.saveLog() },
		]);
		if (this.settings.showDebugPanel) this.panel.show();

		// Spike: listen on every platform and log the flags, so we can confirm
		// which ones identify the iPad before gating activation on them.
		this.panel.log(
			`loaded. isIosApp=${Platform.isIosApp} isTablet=${Platform.isTablet}` +
				` isPhone=${Platform.isPhone} isMobileApp=${Platform.isMobileApp}`,
		);
		this.panel.log(
			`maxTouchPoints=${navigator.maxTouchPoints}` +
				` getCoalescedEvents=${"getCoalescedEvents" in PointerEvent.prototype}` +
				` PointerEvent.altitudeAngle=${"altitudeAngle" in PointerEvent.prototype}` +
				` Touch.touchType=${typeof Touch !== "undefined" && "touchType" in Touch.prototype}`,
		);
		this.panel.log(`block mode: ${this.settings.blockMode}`);

		new PenCapture(this.app, this.panel.log, () => this.settings.blockMode).register(this);

		this.addRibbonIcon("pen-tool", "Pen Glyphs: cycle pen blocking mode", () => this.cycleBlockMode());

		this.addCommand({
			id: "cycle-block-mode",
			name: "Cycle pen blocking mode (off → pointer → touch → all)",
			callback: () => this.cycleBlockMode(),
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
		this.addCommand({
			id: "save-debug-log",
			name: "Save debug log to vault",
			callback: () => this.saveLog(),
		});
		this.addCommand({
			id: "copy-debug-log",
			name: "Copy debug log to clipboard",
			callback: () => this.panel.copy(),
		});
		this.addCommand({
			id: "clear-debug-log",
			name: "Clear debug log",
			callback: () => this.panel.clear(),
		});
	}

	override onunload(): void {
		this.panel.hide();
	}

	private async cycleBlockMode(): Promise<void> {
		const i = BLOCK_MODES.indexOf(this.settings.blockMode);
		this.settings.blockMode = BLOCK_MODES[(i + 1) % BLOCK_MODES.length];
		await this.saveData(this.settings);
		this.panel.log(`---- block mode: ${this.settings.blockMode} ----`);
		this.panel.refreshActions();
		new Notice(`Pen blocking: ${this.settings.blockMode}`);
	}

	private async saveLog(): Promise<void> {
		const header =
			`# Pen Glyphs debug log\n\n` +
			`- plugin ${this.manifest.version}, block mode at save: ${this.settings.blockMode}\n` +
			`- ${navigator.userAgent}`;
		await this.panel.saveToVault(header);
	}
}
