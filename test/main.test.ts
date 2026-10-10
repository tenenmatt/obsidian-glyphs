import { App, FakeVault, Modal, Notice, Platform } from "./obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PenGlyphsPlugin from "../src/main";
import { canvasView, fakeContext, manualFrames, pointer } from "./helpers";

type TestPlugin = PenGlyphsPlugin & {
	data: unknown;
	commands: { id: string }[];
	ribbon: { callback: (e: MouseEvent) => unknown }[];
	runCommand(id: string): unknown;
	unload(): void;
	app: App;
};

let frames: ReturnType<typeof manualFrames>;
let draw: ReturnType<typeof fakeContext>;
const loaded: TestPlugin[] = [];

async function load(data: unknown = null, ipad = true): Promise<TestPlugin> {
	Object.assign(Platform, { isIosApp: ipad, isTablet: ipad });
	const plugin = new PenGlyphsPlugin(new App() as never, { id: "pen-glyphs", version: "9.9.9" } as never) as TestPlugin;
	plugin.data = data;
	loaded.push(plugin);
	await plugin.onload();
	frames.flush();
	return plugin;
}

function panelText(): string {
	frames.flush();
	return document.querySelector(".pen-glyphs-debug-body")?.textContent ?? "";
}

function panelButton(label: string): HTMLButtonElement {
	const all = Array.from(document.querySelectorAll<HTMLButtonElement>(".pen-glyphs-debug-actions button"));
	const found = all.find((b) => b.textContent!.startsWith(label));
	if (!found) throw new Error(`no panel button ${label}`);
	return found;
}

async function settle() {
	await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
	frames = manualFrames();
	draw = fakeContext();
});

// Plugins listen on window, which outlives each test's DOM.
afterEach(() => {
	for (const plugin of loaded.splice(0)) plugin.unload();
});

describe("activation", () => {
	it("stays inactive off iPad", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const plugin = await load(null, false);
		expect(log).toHaveBeenCalledWith("[pen-glyphs] not an iPad; staying inactive");
		expect(plugin.commands).toEqual([]);
		expect(document.querySelector(".pen-glyphs-overlay")).toBeNull();
	});

	it("needs both the iOS app and a tablet", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		Object.assign(Platform, { isIosApp: true, isTablet: false });
		const plugin = new PenGlyphsPlugin(new App() as never, { id: "pen-glyphs", version: "1" } as never) as TestPlugin;
		loaded.push(plugin);
		await plugin.onload();
		expect(plugin.commands).toEqual([]);
	});

	it("on iPad, shows the panel and overlay with default settings", async () => {
		const plugin = await load();
		expect(plugin.settings).toEqual({ glyphMode: true, showDebugPanel: true });
		expect(document.querySelector(".pen-glyphs-overlay")).not.toBeNull();
		expect(panelText()).toContain("loaded 9.9.9; glyph mode on");
	});

	it("restores saved settings", async () => {
		const plugin = await load({ glyphMode: false, showDebugPanel: false, blockMode: "all" });
		expect(plugin.settings).toEqual({ glyphMode: false, showDebugPanel: false });
		expect(document.querySelector(".pen-glyphs-debug")).toBeNull();
	});

	it("cleans up the panel and overlay on unload", async () => {
		const plugin = await load();
		plugin.unload();
		expect(document.querySelector(".pen-glyphs-debug")).toBeNull();
		expect(document.querySelector(".pen-glyphs-overlay")).toBeNull();
	});

	it("resizes the overlay with the window", async () => {
		await load();
		vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);
		window.dispatchEvent(new Event("resize"));
		expect(document.querySelector<HTMLCanvasElement>(".pen-glyphs-overlay")!.width).toBe(window.innerWidth * 3);
	});
});

describe("pen input", () => {
	it("draws a stroke and logs its stats", async () => {
		await load();
		const { card } = canvasView();
		pointer(card, "pointerdown", { x: 0, y: 0, t: 0, p: 0.2 });
		pointer(card, "pointermove", { x: 30, y: 40, t: 100, p: 0.6 });
		frames.flush();
		expect(draw.ops("stroke").length).toBeGreaterThan(0);
		pointer(card, "pointerup", { x: 30, y: 40, t: 250 });
		expect(panelText()).toContain("stroke: 3 pts, 250ms, length 50px, box 30×40, max pressure 0.60");
	});

	it("logs a tap with its target", async () => {
		await load();
		const { card } = canvasView();
		pointer(card, "pointerdown", { x: 5, y: 6, t: 0 });
		pointer(card, "pointerup", { x: 5, y: 6, t: 50 });
		expect(panelText()).toContain("tap at (5,6) on div.canvas-node-content-blocker");
	});

	it("fades a cancelled stroke", async () => {
		await load();
		const { card } = canvasView();
		pointer(card, "pointerdown", { t: 0 });
		pointer(card, "pointercancel", { t: 10 });
		expect(panelText()).toContain("stroke cancelled by the system");
	});

	it("draws the hover dot and clears it", async () => {
		vi.useFakeTimers();
		try {
			await load();
			const { card } = canvasView();
			pointer(card, "pointermove", { x: 7, y: 8, buttons: 0 });
			frames.flush();
			expect(draw.ops("arc").slice(-1)[0].args.slice(0, 2)).toEqual([7, 8]);
			pointer(card, "pointerout", { relatedTarget: null });
			draw.reset();
			frames.flush();
			expect(draw.ops("arc")).toHaveLength(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it("leaves the pen alone while glyph mode is off", async () => {
		await load({ glyphMode: false });
		const { card } = canvasView();
		const down = pointer(card, "pointerdown");
		expect(down.defaultPrevented).toBe(false);
	});
});

describe("commands and controls", () => {
	it("toggles glyph mode from the command, ribbon and panel, saving each time", async () => {
		const plugin = await load();
		await plugin.runCommand("toggle-glyph-mode");
		expect(plugin.settings.glyphMode).toBe(false);
		expect(plugin.data).toMatchObject({ glyphMode: false });
		expect(Notice.shown).toEqual(["Pen glyphs off"]);
		expect(panelButton("glyphs").textContent).toBe("glyphs: off");
		expect(panelText()).toContain("---- glyph mode off ----");

		await plugin.ribbon[0].callback(new MouseEvent("click"));
		expect(plugin.settings.glyphMode).toBe(true);

		panelButton("glyphs").click();
		await settle();
		expect(plugin.settings.glyphMode).toBe(false);
	});

	it("toggles the debug panel and remembers it", async () => {
		const plugin = await load();
		await plugin.runCommand("toggle-debug-panel");
		expect(document.querySelector(".pen-glyphs-debug")).toBeNull();
		expect(plugin.data).toMatchObject({ showDebugPanel: false });
		await plugin.runCommand("toggle-debug-panel");
		expect(document.querySelector(".pen-glyphs-debug")).not.toBeNull();
		expect(plugin.data).toMatchObject({ showDebugPanel: true });
	});

	it("saves the log with a header from the command and the panel", async () => {
		const plugin = await load();
		await plugin.runCommand("save-debug-log");
		const vault = plugin.app.vault as unknown as FakeVault;
		const saved = vault.files.get("pen-glyphs-logs/2026-10-09 12-00-00.md")!;
		expect(saved).toContain("- plugin 9.9.9, glyph mode at save: on");

		vault.files.clear();
		await plugin.runCommand("toggle-glyph-mode");
		panelButton("save log").click();
		await settle();
		expect(vault.files.get("pen-glyphs-logs/2026-10-09 12-00-00.md")).toContain("glyph mode at save: off");
	});

	it("copies and clears the log", async () => {
		const plugin = await load();
		const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		await plugin.runCommand("copy-debug-log");
		expect(write).toHaveBeenCalledWith(expect.stringContaining("loaded 9.9.9"));

		plugin.runCommand("clear-debug-log");
		expect(panelText()).toBe("");
		pointer(document.body, "pointerdown");
		panelButton("clear").click();
		expect(panelText()).toBe("");
	});

	it("explains when there is no gesture to save", async () => {
		const plugin = await load();
		plugin.runCommand("save-last-gesture-fixture");
		expect(Notice.shown).toEqual(["No pen stroke to save yet"]);
		expect(Modal.opened).toEqual([]);
	});

	it("opens the fixture dialog for the last gesture, from the command and the panel", async () => {
		const plugin = await load();
		const { card } = canvasView();
		pointer(card, "pointerdown", { x: 0, t: 0 });
		pointer(card, "pointerup", { x: 50, t: 300 });
		plugin.runCommand("save-last-gesture-fixture");
		expect(Modal.opened).toHaveLength(1);
		panelButton("save stroke").click();
		expect(Modal.opened).toHaveLength(2);
	});
});
