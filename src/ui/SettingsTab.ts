import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

export interface PenGlyphsSettings {
	/** When off, the pen behaves exactly as it does without the plugin. */
	glyphMode: boolean;
	/** Flash "?" when a stroke isn't recognized as any glyph. */
	showMisses: boolean;
	/** A square makes a card the size of the drawing; off, a standard-size card centered on it. */
	cardsMatchDrawing: boolean;
	/** Developer tools: the on-screen debug panel and the dev commands. */
	showDebugPanel: boolean;
}

export const DEFAULT_SETTINGS: PenGlyphsSettings = {
	glyphMode: true,
	showMisses: true,
	cardsMatchDrawing: false,
	showDebugPanel: false,
};

/** Fill in defaults for anything missing from saved data, dropping unknown keys. */
export function loadSettings(data: unknown): PenGlyphsSettings {
	const saved = (data ?? {}) as Partial<PenGlyphsSettings>;
	return {
		glyphMode: saved.glyphMode ?? DEFAULT_SETTINGS.glyphMode,
		showMisses: saved.showMisses ?? DEFAULT_SETTINGS.showMisses,
		cardsMatchDrawing: saved.cardsMatchDrawing ?? DEFAULT_SETTINGS.cardsMatchDrawing,
		showDebugPanel: saved.showDebugPanel ?? DEFAULT_SETTINGS.showDebugPanel,
	};
}

export interface SettingsHost extends Plugin {
	settings: PenGlyphsSettings;
	/** Apply and persist a change to one setting. */
	updateSetting<K extends keyof PenGlyphsSettings>(key: K, value: PenGlyphsSettings[K]): Promise<void>;
	openCheatsheet(): void;
}

export class PenGlyphsSettingTab extends PluginSettingTab {
	constructor(app: App, private host: SettingsHost) {
		super(app, host);
	}

	// display() is deprecated since Obsidian 1.13 in favor of the declarative
	// getSettingDefinitions(), but remains the fallback for older versions,
	// which the manifest supports. Revisit if minAppVersion moves past 1.13.
	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName("Cheatsheet")
			.setDesc("Every glyph, what to draw it over, and what it does.")
			.addButton((b) => b.setButtonText("Show cheatsheet").onClick(() => this.host.openCheatsheet()));
		this.toggle("Glyph mode", "The pen draws glyph commands on canvases. Off: the pen behaves as usual.", "glyphMode");
		this.toggle(
			"New cards match the drawing",
			"A square makes a card the size of the square. Off: a standard-size card, centered where you drew.",
			"cardsMatchDrawing",
		);
		this.toggle(
			"Show unrecognized strokes",
			`Flash a "?" when a stroke isn't any glyph. Unrecognized ink still turns gray either way.`,
			"showMisses",
		);
		this.toggle(
			"Developer tools",
			"Show the on-screen debug log, and the developer commands: inspect and probe the canvas, save strokes as test fixtures, save or copy the log.",
			"showDebugPanel",
		);
	}

	private toggle(name: string, desc: string, key: keyof PenGlyphsSettings): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((t) => t.setValue(this.host.settings[key]).onChange((v) => this.host.updateSetting(key, v)));
	}
}
