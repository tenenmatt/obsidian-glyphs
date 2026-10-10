import { App, Plugin, PluginSettingTab, Setting } from "obsidian";

export interface PenGlyphsSettings {
	/** When off, the pen behaves exactly as it does without the plugin. */
	glyphMode: boolean;
	/** Flash "?" when a stroke isn't recognized as any glyph. */
	showMisses: boolean;
	showDebugPanel: boolean;
}

export const DEFAULT_SETTINGS: PenGlyphsSettings = {
	glyphMode: true,
	showMisses: true,
	showDebugPanel: true,
};

/** Fill in defaults for anything missing from saved data, dropping unknown keys. */
export function loadSettings(data: unknown): PenGlyphsSettings {
	const saved = (data ?? {}) as Partial<PenGlyphsSettings>;
	return {
		glyphMode: saved.glyphMode ?? DEFAULT_SETTINGS.glyphMode,
		showMisses: saved.showMisses ?? DEFAULT_SETTINGS.showMisses,
		showDebugPanel: saved.showDebugPanel ?? DEFAULT_SETTINGS.showDebugPanel,
	};
}

export interface SettingsHost extends Plugin {
	settings: PenGlyphsSettings;
	/** Apply and persist a change to one setting. */
	updateSetting<K extends keyof PenGlyphsSettings>(key: K, value: PenGlyphsSettings[K]): Promise<void>;
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
		this.toggle("Glyph mode", "The pen draws glyph commands on canvases. Off: the pen behaves as usual.", "glyphMode");
		this.toggle(
			"Show unrecognized strokes",
			`Flash a "?" when a stroke isn't any glyph. Unrecognized ink still turns gray either way.`,
			"showMisses",
		);
		this.toggle("Debug panel", "Show the on-screen log of strokes and recognition results.", "showDebugPanel");
	}

	private toggle(name: string, desc: string, key: keyof PenGlyphsSettings): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((t) => t.setValue(this.host.settings[key]).onChange((v) => this.host.updateSetting(key, v)));
	}
}
