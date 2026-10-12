import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, PenGlyphsSettingTab, loadSettings } from "../src/ui/SettingsTab";
import { App, Plugin } from "./obsidian";

describe("loadSettings", () => {
	it("fills defaults and drops unknown keys", () => {
		expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(loadSettings({ showMisses: false, blockMode: "all" })).toEqual({ ...DEFAULT_SETTINGS, showMisses: false });
	});
});

describe("PenGlyphsSettingTab", () => {
	function tab() {
		const host = Object.assign(new Plugin(new App(), { id: "pen-glyphs", version: "1" }), {
			settings: { ...DEFAULT_SETTINGS, showMisses: false },
			updateSetting: vi.fn(async () => {}),
			openCheatsheet: vi.fn(),
		});
		const t = new PenGlyphsSettingTab(new App() as never, host as never);
		t.display();
		return { t, host };
	}
	const toggles = (t: PenGlyphsSettingTab) => Array.from(t.containerEl.querySelectorAll<HTMLInputElement>("input[type=checkbox]"));

	it("shows a toggle per setting with its current value", () => {
		const { t } = tab();
		const names = Array.from(t.containerEl.querySelectorAll(".setting-item-name")).map((n) => n.textContent);
		expect(names).toEqual(["Cheatsheet", "Glyph mode", "New cards match the drawing", "Show unrecognized strokes", "Developer tools"]);
		expect(toggles(t).map((x) => x.checked)).toEqual([true, false, false, false]);
	});

	it("routes changes through updateSetting", () => {
		const { t, host } = tab();
		const showMisses = toggles(t)[2];
		showMisses.checked = true;
		showMisses.dispatchEvent(new Event("change"));
		expect(host.updateSetting).toHaveBeenCalledWith("showMisses", true);
	});

	it("opens the cheatsheet from its button", () => {
		const { t, host } = tab();
		t.containerEl.querySelector("button")!.click();
		expect(host.openCheatsheet).toHaveBeenCalled();
	});

	it("re-renders cleanly", () => {
		const { t } = tab();
		t.display();
		expect(toggles(t)).toHaveLength(4);
	});
});
