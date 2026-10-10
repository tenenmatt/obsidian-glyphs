import { App, FakeVault, Notice, Plugin } from "./obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DebugPanel } from "../src/ui/DebugPanel";
import { clock, manualFrames } from "./helpers";

let plugin: Plugin;
let frames: ReturnType<typeof manualFrames>;
let ran: string[];

function makePanel() {
	return new DebugPanel(plugin as never, [
		{ label: () => "one", run: () => ran.push("one") },
		{ label: () => `two ${ran.length}`, run: () => ran.push("two") },
	]);
}

function body(): string {
	return document.querySelector(".pen-glyphs-debug-body")?.textContent ?? "";
}

function buttons(): HTMLButtonElement[] {
	return Array.from(document.querySelectorAll(".pen-glyphs-debug-actions button"));
}

function vault(): FakeVault {
	return plugin.app.vault as unknown as FakeVault;
}

beforeEach(() => {
	plugin = new Plugin(new App(), { id: "pen-glyphs", version: "test" });
	frames = manualFrames();
	ran = [];
});

describe("logging", () => {
	it("timestamps lines relative to creation", () => {
		const time = clock(1000);
		const panel = makePanel();
		time.advance(1500);
		panel.log("hello");
		expect(panel.text()).toBe("   1.50  hello");
	});

	it("keeps only the newest 3000 lines", () => {
		const panel = makePanel();
		for (let i = 0; i < 3005; i++) panel.log(`line ${i}`);
		const lines = panel.text().split("\n");
		expect(lines).toHaveLength(3000);
		expect(lines[0]).toContain("line 5");
	});

	it("clears", () => {
		const panel = makePanel();
		panel.log("x");
		panel.clear();
		expect(panel.text()).toBe("");
	});
});

describe("panel", () => {
	it("is hidden until shown, and renders the last 40 lines on the next frame", () => {
		const panel = makePanel();
		for (let i = 0; i < 50; i++) panel.log(`line ${i}`);
		expect(panel.isShown).toBe(false);
		expect(frames.pending).toBe(0);

		panel.show();
		expect(panel.isShown).toBe(true);
		frames.flush();
		const shown = body().split("\n");
		expect(shown).toHaveLength(40);
		expect(shown[0]).toContain("line 10");
	});

	it("batches renders into one frame", () => {
		const panel = makePanel();
		panel.show();
		frames.flush();
		panel.log("a");
		panel.log("b");
		expect(frames.pending).toBe(1);
		frames.flush();
		expect(body()).toContain("b");
	});

	it("skips a queued render if hidden before the frame", () => {
		const panel = makePanel();
		panel.show();
		panel.hide();
		frames.flush();
		expect(panel.isShown).toBe(false);
	});

	it("shows the running plugin version in its title", () => {
		makePanel().show();
		expect(document.querySelector(".pen-glyphs-debug-title")!.textContent).toBe("pen-glyphs test-build");
	});

	it("only creates one panel when shown twice", () => {
		const panel = makePanel();
		panel.show();
		panel.show();
		expect(document.querySelectorAll(".pen-glyphs-debug")).toHaveLength(1);
	});

	it("removes itself when hidden", () => {
		const panel = makePanel();
		panel.show();
		panel.hide();
		expect(document.querySelector(".pen-glyphs-debug")).toBeNull();
	});
});

describe("actions", () => {
	it("renders a button per action plus collapse, and runs actions without bubbling", () => {
		const panel = makePanel();
		panel.show();
		const bubbled = vi.fn();
		document.body.addEventListener("click", bubbled);
		expect(buttons().map((b) => b.textContent)).toEqual(["one", "two 0", "–"]);
		buttons()[0].click();
		expect(ran).toEqual(["one"]);
		expect(bubbled).not.toHaveBeenCalled();
	});

	it("refreshes labels on request, and ignores refresh while hidden", () => {
		const panel = makePanel();
		panel.refreshActions();
		panel.show();
		ran.push("x");
		panel.refreshActions();
		expect(buttons()[1].textContent).toBe("two 1");
	});

	it("collapses and expands the log body", () => {
		const panel = makePanel();
		panel.show();
		const root = document.querySelector(".pen-glyphs-debug")!;
		buttons()[2].click();
		expect(root.classList.contains("is-collapsed")).toBe(true);
		expect(buttons()[2].textContent).toBe("▢");
		buttons()[2].click();
		expect(root.classList.contains("is-collapsed")).toBe(false);
	});
});

describe("export", () => {
	it("copies the log to the clipboard", async () => {
		const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
		const panel = makePanel();
		panel.log("a");
		panel.log("b");
		await panel.copy();
		expect(write).toHaveBeenCalledWith(panel.text());
		expect(Notice.shown).toEqual(["Copied 2 log lines"]);
	});

	it("reports a clipboard failure", async () => {
		vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
		await makePanel().copy();
		expect(Notice.shown).toEqual(["Copy failed: Error: denied"]);
	});

	it("saves the log into the vault, creating the folder once", async () => {
		const panel = makePanel();
		panel.log("a");
		await panel.saveToVault("# header");
		const path = "pen-glyphs-logs/2026-10-09 12-00-00.md";
		expect(vault().folders).toEqual(new Set(["pen-glyphs-logs"]));
		expect(vault().files.get(path)).toBe(`# header\n\n\`\`\`\n${panel.text()}\n\`\`\`\n`);
		expect(Notice.shown).toEqual([`Saved log to ${path}`]);

		const createFolder = vi.spyOn(vault(), "createFolder");
		vault().files.clear();
		await panel.saveToVault("# again");
		expect(createFolder).not.toHaveBeenCalled();
	});
});
