import { describe, expect, it } from "vitest";
import { canvasReport, describeObject, preview, saveCanvasReport } from "../src/dev/canvasInspector";
import { App, FakeVault, FakeWorkspace } from "./obsidian";

class BaseThing {
	removeNode(node: unknown) {
		return node;
	}
	plain() {}
}
class FakeCanvas extends BaseThing {
	zoom = 1.5;
	label = "hello";
	nodes = new Map([["n1", { id: "n1", x: 10 }]]);
	edges = new Map([["e1", { id: "e1" }]]);
	selection = new Set();
	wrapperEl = document.createElement("div");
	override removeNode(node: unknown) {
		return node;
	}
	get busy() {
		return false;
	}
	getData() {
		return { nodes: [{ id: "n1" }], edges: [] };
	}
}

describe("preview", () => {
	it("summarizes each kind of value", () => {
		const el = document.createElement("div");
		el.className = "canvas-wrapper";
		expect(preview(null)).toBe("null");
		expect(preview([1, 2])).toBe("Array(2)");
		expect(preview(new Map([[1, 2]]))).toBe("Map(1)");
		expect(preview(new Set([1]))).toBe("Set(1)");
		expect(preview(el)).toBe('<div class="canvas-wrapper">');
		expect(preview(new FakeCanvas())).toBe("object FakeCanvas");
		expect(preview(Object.create(null))).toBe("object (no prototype)");
		expect(preview("x".repeat(100))).toBe(JSON.stringify("x".repeat(60)));
		expect(preview(3)).toBe("number 3");
		expect(preview(undefined)).toBe("undefined undefined");
	});
});

describe("describeObject", () => {
	it("lists own properties and the prototype chain, once each, with source for interesting methods", () => {
		const lines = describeObject(new FakeCanvas());
		const text = lines.join("\n");
		expect(lines[0]).toBe("  -- own");
		expect(text).toContain("  zoom: number 1.5");
		expect(text).toContain("  -- prototype 1 (FakeCanvas)");
		expect(text).toContain("  -- prototype 2 (BaseThing)");
		expect(text).toContain("  busy: accessor get");
		expect(text).toMatch(/ {2}removeNode: function\/1 {2}removeNode\(node\) \{/);
		expect(lines).toContain("  plain: function/0");
		expect(lines.filter((l) => l.startsWith("  removeNode"))).toHaveLength(1);
		expect(text).not.toContain("constructor");
	});

	it("handles setters, undefined values and prototypes without a constructor", () => {
		const proto = Object.create(null);
		Object.defineProperty(proto, "onlySet", { set() {} });
		Object.defineProperty(proto, "both", { get() {}, set() {} });
		const obj = Object.create(proto);
		obj.missing = undefined;
		const text = describeObject(obj).join("\n");
		expect(text).toContain("  -- prototype 1 (anonymous)");
		expect(text).toContain("  onlySet: accessor set");
		expect(text).toContain("  both: accessor get set");
		expect(text).toContain("  missing: undefined undefined");
	});
});

describe("canvasReport", () => {
	function appWith(views: unknown[], recent?: number) {
		const app = new App();
		const ws = app.workspace as FakeWorkspace;
		ws.leaves = views.map((view) => ({ view }));
		ws.mostRecent = recent === undefined ? null : ws.leaves[recent];
		return app;
	}

	it("is null without a canvas view, or when the view has no canvas", () => {
		expect(canvasReport(appWith([]) as never)).toBeNull();
		expect(canvasReport(appWith([{}]) as never)).toBeNull();
	});

	it("reports the canvas, its first node and edge, and a slice of its data", () => {
		const report = canvasReport(appWith([{ canvas: new FakeCanvas() }]) as never)!;
		expect(report).toContain("- Obsidian API 1.0.0-test; isIosApp=false isTablet=false");
		expect(report).toContain("== canvas");
		expect(report).toContain("== first node (of 1)\n  -- own\n  id: \"n1\"");
		expect(report).toContain("== first edge (of 1)");
		expect(report).toContain('== getData()\n{"nodes":[{"id":"n1"}],"edges":[]}');
	});

	it("prefers the most recently active canvas", () => {
		const first = { canvas: { zoom: 1 } };
		const second = { canvas: { zoom: 2 } };
		expect(canvasReport(appWith([first, second], 1) as never)).toContain("zoom: number 2");
	});

	it("copes with a canvas missing nodes, edges and getData", () => {
		const report = canvasReport(appWith([{ canvas: { zoom: 1 } }]) as never)!;
		expect(report).toContain("== first node (of 0)\n  (none: add a card)");
		expect(report).toContain("== first edge (of 0)\n  (none: connect two cards)");
		expect(report).not.toContain("getData()");
	});
});

describe("saveCanvasReport", () => {
	it("returns null when no canvas is open", async () => {
		expect(await saveCanvasReport(new App() as never)).toBeNull();
	});

	it("writes the report into the log folder, creating it once", async () => {
		const app = new App();
		(app.workspace as FakeWorkspace).leaves = [{ view: { canvas: { zoom: 1 } } }];
		const vault = app.vault as FakeVault;
		const path = await saveCanvasReport(app as never);
		expect(path).toBe("pen-glyphs-logs/canvas-api 2026-10-09 12-00-00.md");
		expect(vault.files.get(path!)).toContain("# Canvas internals");
		vault.files.clear();
		await saveCanvasReport(app as never);
		expect(vault.folders).toEqual(new Set(["pen-glyphs-logs"]));
	});
});
