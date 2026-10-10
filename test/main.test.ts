import { App, FakeVault, FakeWorkspace, Modal, Notice, Platform } from "./obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PenGlyphsPlugin from "../src/main";
import { MISS_COLOR } from "../src/input/Overlay";
import { PenPoint } from "../src/input/strokes";
import { canvasView, fakeContext, manualFrames, pointer } from "./helpers";
import { FakeCanvas } from "./fakeCanvas";
import { shapes } from "./shapes";

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

/** Draw a whole stroke with the pen: down, moves, up. */
function drawStroke(target: Element, points: PenPoint[]) {
	const [first, ...rest] = points;
	pointer(target, "pointerdown", { x: first.x, y: first.y, t: first.t, p: first.p });
	for (const q of rest.slice(0, -1)) pointer(target, "pointermove", { x: q.x, y: q.y, t: q.t, p: q.p });
	const last = rest[rest.length - 1];
	pointer(target, "pointerup", { x: last.x, y: last.y, t: last.t, p: last.p });
}

function flashEl(): HTMLElement {
	return document.querySelector<HTMLElement>(".pen-glyphs-flash")!;
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
	it("stays inactive off iPad, apart from the canvas inspector", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const plugin = await load(null, false);
		expect(log).toHaveBeenCalledWith("[pen-glyphs] not an iPad; staying inactive");
		expect(plugin.commands.map((c) => c.id)).toEqual(["inspect-canvas-internals", "probe-canvas-behavior"]);
		expect(document.querySelector(".pen-glyphs-overlay")).toBeNull();
	});

	it("needs both the iOS app and a tablet", async () => {
		vi.spyOn(console, "log").mockImplementation(() => {});
		Object.assign(Platform, { isIosApp: true, isTablet: false });
		const plugin = new PenGlyphsPlugin(new App() as never, { id: "pen-glyphs", version: "1" } as never) as TestPlugin;
		loaded.push(plugin);
		await plugin.onload();
		expect(plugin.commands.map((c) => c.id)).toEqual(["inspect-canvas-internals", "probe-canvas-behavior"]);
	});

	it("on iPad, shows the panel and overlay with default settings", async () => {
		const plugin = await load();
		expect(plugin.settings).toEqual({ glyphMode: true, showMisses: true, showDebugPanel: true });
		expect(document.querySelector(".pen-glyphs-overlay")).not.toBeNull();
		expect(panelText()).toContain("loaded test-build; glyph mode on");
	});

	it("restores saved settings", async () => {
		const plugin = await load({ glyphMode: false, showMisses: false, showDebugPanel: false, blockMode: "all" });
		expect(plugin.settings).toEqual({ glyphMode: false, showMisses: false, showDebugPanel: false });
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
		const text = panelText();
		expect(text).toContain("✓ line (straightness 1.00)");
		expect(text).toContain("    3 pts, 250ms, length 50px, box 30×40, max pressure 0.60");
	});

	it("recognizes a glyph, clearing its ink quickly in the accent color", async () => {
		await load();
		const { card } = canvasView();
		const caret = shapes.caret();
		draw.reset();
		drawStroke(card, caret);
		expect(panelText()).toMatch(/✓ caret \(\$P distance \d\.\d\d; next: /);
		frames.flush();
		expect(draw.ops("stroke").every((c) => c.style !== MISS_COLOR)).toBe(true);
	});

	it("marks a stroke it cannot read, graying its ink", async () => {
		await load();
		const { card } = canvasView();
		drawStroke(card, shapes.zigzag());
		expect(panelText()).toMatch(/\? no glyph \(nearest /);
		draw.reset();
		frames.flush();
		expect(draw.ops("stroke")[0].style).toBe(MISS_COLOR);
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

describe("glyphs on a canvas", () => {
	/** A canvas view in the DOM, registered as a workspace leaf with fake internals. */
	async function canvasPlugin(internals: unknown = new FakeCanvas()) {
		const plugin = await load();
		const view = canvasView();
		(plugin.app.workspace as unknown as FakeWorkspace).leaves = [{ view: { containerEl: view.leaf, canvas: internals } }];
		return { plugin, view, canvas: internals as FakeCanvas };
	}

	it("a pen tap selects the card under it", async () => {
		const { view, canvas } = await canvasPlugin();
		const card = canvas.addCard(0, 0);
		pointer(view.wrapper, "pointerdown", { x: 20, y: 20, t: 0 });
		pointer(view.wrapper, "pointerup", { x: 20, y: 20, t: 50 });
		expect([...canvas.selection]).toEqual([card]);
		expect(panelText()).toContain("tap at (20,20) on div.canvas-wrapper: select card");
	});

	it("a recognized glyph runs its command and logs the outcome", async () => {
		const { view, canvas } = await canvasPlugin();
		drawStroke(view.wrapper, shapes.square());
		expect(canvas.nodes.size).toBe(1);
		expect(panelText()).toMatch(/✓ square \(closed, \d corners, fill \d\.\d\d\) → new card/);
	});

	it("flashes the command's label, but not for taps", async () => {
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		try {
			const { view, canvas } = await canvasPlugin();
			canvas.addCard(0, 0);
			pointer(view.wrapper, "pointerdown", { x: 20, y: 20, t: 0 });
			pointer(view.wrapper, "pointerup", { x: 20, y: 20, t: 50 });
			expect(flashEl().classList.contains("is-visible")).toBe(false);
			drawStroke(view.wrapper, shapes.square().map((p) => ({ ...p, x: p.x + 300 })));
			expect(flashEl().textContent).toBe("new card");
			expect(flashEl().classList.contains("is-visible")).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it("flashes ? for an unrecognized stroke only when showMisses is on", async () => {
		const { plugin, view } = await canvasPlugin();
		drawStroke(view.wrapper, shapes.zigzag());
		expect(flashEl().textContent).toBe("?");
		expect(flashEl().classList.contains("is-miss")).toBe(true);

		flashEl().textContent = "";
		await plugin.updateSetting("showMisses", false);
		drawStroke(view.wrapper, shapes.zigzag());
		expect(flashEl().textContent).toBe("");
	});

	it("an unrecognized stroke runs nothing", async () => {
		const { view, canvas } = await canvasPlugin();
		drawStroke(view.wrapper, shapes.zigzag());
		expect(canvas.nodes.size).toBe(0);
		expect(panelText()).not.toContain("→");
	});

	it("explains when the canvas internals it needs are missing", async () => {
		const { view } = await canvasPlugin({ nodes: new Map() });
		pointer(view.wrapper, "pointerdown", { t: 0 });
		pointer(view.wrapper, "pointerup", { t: 50 });
		const missing = "missing: posFromClient, hitTestNode, getIntersectingNodes, selectOnly, selectAll, deselectAll, removeNode, deleteSelection, requestSave, createTextNode, importData, selection";
		expect(Notice.shown).toEqual([`Pen Glyphs: canvas internals unavailable (${missing})`]);
		expect(panelText()).toContain(`canvas unavailable (${missing})`);
	});

	it("reports a command that throws", async () => {
		const canvas = new FakeCanvas();
		canvas.hitTestNode = () => {
			throw new Error("boom");
		};
		const { view } = await canvasPlugin(canvas);
		pointer(view.wrapper, "pointerdown", { t: 0 });
		pointer(view.wrapper, "pointerup", { t: 50 });
		expect(Notice.shown).toEqual(["Pen Glyphs: tap failed: Error: boom"]);
		expect(panelText()).toContain("tap failed (Error: boom)");
	});
});

describe("settings and cheatsheet", () => {
	it("registers a settings tab wired to this plugin", async () => {
		const plugin = await load();
		const tabs = (plugin as unknown as { settingTabs: { plugin: unknown }[] }).settingTabs;
		expect(tabs).toHaveLength(1);
		expect(tabs[0].plugin).toBe(plugin);
	});

	it("updateSetting persists and applies each setting", async () => {
		const plugin = await load();
		await plugin.updateSetting("showDebugPanel", false);
		expect(document.querySelector(".pen-glyphs-debug")).toBeNull();
		expect(plugin.data).toMatchObject({ showDebugPanel: false });
		await plugin.updateSetting("showDebugPanel", true);
		expect(document.querySelector(".pen-glyphs-debug")).not.toBeNull();
		await plugin.updateSetting("glyphMode", false);
		expect(panelText()).toContain("---- glyph mode off ----");
		await plugin.updateSetting("showMisses", false);
		expect(plugin.data).toMatchObject({ glyphMode: false, showMisses: false, showDebugPanel: true });
	});

	it("opens the cheatsheet", async () => {
		const plugin = await load();
		plugin.runCommand("show-cheatsheet");
		expect(Modal.opened).toHaveLength(1);
		expect(Modal.opened[0].contentEl.querySelectorAll(".pen-glyphs-cheatsheet-row")).toHaveLength(7);
	});
});

describe("canvas inspector command", () => {
	it("asks for a canvas when none is open", async () => {
		const plugin = await load();
		await plugin.runCommand("inspect-canvas-internals");
		expect(Notice.shown).toEqual(["Open a canvas first"]);
	});

	it("saves a report, and reports failures", async () => {
		const plugin = await load();
		(plugin.app.workspace as unknown as FakeWorkspace).leaves = [{ view: { canvas: { zoom: 1 } } }];
		await plugin.runCommand("inspect-canvas-internals");
		const path = "pen-glyphs-logs/canvas-api 2026-10-09 12-00-00.md";
		expect(Notice.shown).toEqual([`Saved ${path}`]);

		await plugin.runCommand("inspect-canvas-internals");
		expect(Notice.shown[1]).toBe(`Inspecting canvas failed: Error: File already exists: ${path}`);
	});
});

describe("canvas probe command", () => {
	it("asks for a canvas, saves results, and reports failures", async () => {
		const plugin = await load();
		await plugin.runCommand("probe-canvas-behavior");
		expect(Notice.shown).toEqual(["Open a canvas first"]);

		const canvas = {
			nodes: new Map(),
			edges: new Map(),
			createTextNode: () => ({ isEditing: true }),
			removeNode: () => {},
		};
		(plugin.app.workspace as unknown as FakeWorkspace).leaves = [{ view: { canvas } }];
		await plugin.runCommand("probe-canvas-behavior");
		expect(Notice.shown[1]).toBe("Saved pen-glyphs-logs/canvas-probe 2026-10-09 12-00-00.md");

		await plugin.runCommand("probe-canvas-behavior");
		expect(Notice.shown[2]).toMatch(/^Probing canvas failed: Error: File already exists/);
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
		expect(saved).toContain("- plugin test-build, glyph mode at save: on");

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
		expect(write).toHaveBeenCalledWith(expect.stringContaining("loaded test-build"));

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
