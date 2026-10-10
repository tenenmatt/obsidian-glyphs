import { describe, expect, it } from "vitest";
import { canvasReport, describeObject, preview, probeCanvas, saveCanvasProbe, saveCanvasReport } from "../src/dev/canvasInspector";
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

// A fake canvas that behaves the way the probe expects a real one might:
// cards are placed with pos as their center, and focus opens the editor a
// moment later.
class ProbeCanvas {
	nodes = new Map<string, Record<string, unknown>>();
	edges = new Map<string, { id: string }>();
	frames = 0;
	importAddsEdges = true;
	createTextNode(opts: { pos: { x: number; y: number }; size: { width: number; height: number }; focus?: boolean }) {
		const node: Record<string, unknown> = {
			id: `n${this.nodes.size}`,
			x: opts.pos.x - opts.size.width / 2,
			y: opts.pos.y - opts.size.height / 2,
			width: opts.size.width,
			height: opts.size.height,
			isEditing: false,
		};
		if (opts.focus !== false) window.setTimeout(() => (node.isEditing = true), 0);
		this.nodes.set(node.id as string, node);
		return node;
	}
	removeNode(node: { id: string }) {
		this.nodes.delete(node.id);
	}
	removeEdge(edge: { id: string }) {
		this.edges.delete(edge.id);
	}
	getData() {
		return { nodes: [...this.nodes.values()], edges: [...this.edges.values()] };
	}
	importData(data: { edges: { id: string }[] }) {
		if (this.importAddsEdges) for (const e of data.edges) this.edges.set(e.id, e);
	}
	requestFrame() {
		this.frames++;
	}
	hitTestNode() {}
}

function withCards(canvas: ProbeCanvas, n: number) {
	for (let i = 0; i < n; i++) canvas.nodes.set(`card${i}`, { id: `card${i}`, moveTo() {} });
	return canvas;
}

describe("probeCanvas", () => {
	it("reports placement, editing and edge import, and cleans up after itself", async () => {
		const canvas = withCards(new ProbeCanvas(), 2);
		const lines = await probeCanvas(canvas, 5);
		const text = lines.join("\n");
		expect(text).toContain("== source: canvas.createTextNode\ncreateTextNode(opts)");
		expect(text).toContain("== source: canvas.requestSave\n(missing)");
		expect(text).toContain("== source: node.moveTo\nmoveTo() {}");
		expect(text).toContain("createTextNode(pos 1000,1000, size 100x60, focus false) -> x=950 y=970 w=100 h=60 editing=false");
		expect(text).toContain("createTextNode(focus default) -> editing immediately=false, after 5ms=true");
		expect(text).toContain("importData(+1 edge) -> edges 0 -> 1, probe edge present=true, nodes still 2");
		expect(canvas.nodes.size).toBe(2);
		expect(canvas.edges.size).toBe(0);
		expect(canvas.frames).toBe(1);
	});

	it("reports an edge that importData did not add", async () => {
		const canvas = withCards(new ProbeCanvas(), 2);
		canvas.importAddsEdges = false;
		expect((await probeCanvas(canvas, 0)).join("\n")).toContain("probe edge present=false");
	});

	it("skips node sources and the edge experiment without enough cards, and copes without requestFrame", async () => {
		const canvas = new ProbeCanvas() as unknown as Record<string, unknown>;
		canvas.requestFrame = undefined;
		const text = (await probeCanvas(canvas, 0)).join("\n");
		expect(text).not.toContain("source: node.");
		expect(text).toContain("importData edge experiment skipped: needs two cards");
	});

	it("treats a canvas without a nodes map as having no cards", async () => {
		const canvas = { nodes: {}, createTextNode: () => ({}), removeNode: () => {} };
		expect((await probeCanvas(canvas, 0)).join("\n")).toContain("skipped: needs two cards");
	});
});

describe("saveCanvasProbe", () => {
	it("returns null when no canvas is open", async () => {
		expect(await saveCanvasProbe(new App() as never)).toBeNull();
	});

	it("writes the probe results into the log folder", async () => {
		const app = new App();
		(app.workspace as FakeWorkspace).leaves = [{ view: { canvas: withCards(new ProbeCanvas(), 2) } }];
		await (app.vault as FakeVault).createFolder("pen-glyphs-logs");
		const path = await saveCanvasProbe(app as never);
		expect(path).toBe("pen-glyphs-logs/canvas-probe 2026-10-09 12-00-00.md");
		expect((app.vault as FakeVault).files.get(path!)).toContain("# Canvas probe");
	});
});
