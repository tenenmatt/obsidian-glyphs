import { describe, expect, it } from "vitest";
import { CanvasAdapter, MIN_CARD, canvasViewFor, newId } from "../src/targets/CanvasAdapter";
import { FakeCanvas } from "./fakeCanvas";
import { App, FakeWorkspace } from "./obsidian";

function adapt(canvas = new FakeCanvas()) {
	const adapter = CanvasAdapter.from({ canvas });
	if (!(adapter instanceof CanvasAdapter)) throw new Error(`missing ${adapter.missing}`);
	return { canvas, adapter };
}

describe("CanvasAdapter.from", () => {
	it("explains a view without a canvas", () => {
		expect(CanvasAdapter.from(null)).toEqual({ missing: ["view.canvas"] });
		expect(CanvasAdapter.from({})).toEqual({ missing: ["view.canvas"] });
	});

	it("lists missing methods and fields", () => {
		const canvas = new FakeCanvas() as unknown as Record<string, unknown>;
		canvas.createTextNode = undefined;
		canvas.importData = "nope";
		canvas.nodes = {};
		canvas.selection = [];
		expect(CanvasAdapter.from({ canvas })).toEqual({
			missing: ["createTextNode", "importData", "nodes", "selection"],
		});
	});

	it("wraps a canvas with everything it needs", () => {
		expect(CanvasAdapter.from({ canvas: new FakeCanvas() })).toBeInstanceOf(CanvasAdapter);
	});
});

describe("CanvasAdapter", () => {
	it("converts client points to canvas points", () => {
		const { canvas, adapter } = adapt();
		canvas.offset = { x: 100, y: 50 };
		canvas.scale = 2;
		expect(adapter.toCanvas({ x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
	});

	it("finds cards at a point and overlapping a box", () => {
		const { canvas, adapter } = adapt();
		const a = canvas.addCard(0, 0);
		const b = canvas.addCard(500, 0);
		expect(adapter.cardAt({ x: 10, y: 10 })).toBe(a);
		expect(adapter.cardAt({ x: 300, y: 10 })).toBeNull();
		expect(adapter.cardsOverlapping({ minX: 50, minY: 0, maxX: 550, maxY: 10 })).toEqual([a, b]);
	});

	it("selects one card, several cards, or none", () => {
		const { canvas, adapter } = adapt();
		const a = canvas.addCard(0, 0);
		const b = canvas.addCard(500, 0);
		adapter.select([a]);
		expect([...canvas.selection]).toEqual([a]);
		expect(adapter.isSelected(a)).toBe(true);
		adapter.select([a, b]);
		expect([...canvas.selection]).toEqual([a, b]);
		adapter.clearSelection();
		expect(canvas.selection.size).toBe(0);
		expect(adapter.isSelected(a)).toBe(false);
	});

	it("deletes cards and saves once, which records undo history", () => {
		const { canvas, adapter } = adapt();
		const a = canvas.addCard(0, 0);
		const b = canvas.addCard(500, 0);
		adapter.deleteCards([a, b]);
		expect(canvas.nodes.size).toBe(0);
		expect(canvas.saves).toBe(1);
	});

	it("deletes the selection, counting only cards", () => {
		const { canvas, adapter } = adapt();
		const a = canvas.addCard(0, 0);
		const b = canvas.addCard(500, 0);
		const keep = canvas.addCard(900, 0);
		const edge = { id: "e1" };
		const impostor = { id: keep.id };
		canvas.selection = new Set([a, b, edge, impostor, null]);
		expect(adapter.deleteSelection()).toBe(2);
		expect([...canvas.nodes.values()]).toEqual([keep]);
	});

	it("creates a card filling a box, opened for editing, never smaller than the minimum", () => {
		const { canvas, adapter } = adapt();
		const big = adapter.createCard({ minX: 10, minY: 20, maxX: 310, maxY: 220 });
		expect(big).toMatchObject({ x: 10, y: 20, width: 300, height: 200, text: "", editing: true });
		const small = adapter.createCard({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
		expect(small).toMatchObject({ width: MIN_CARD.width, height: MIN_CARD.height });
		expect(canvas.saves).toBe(2);
	});

	it("connects two cards with an arrow, adding without clearing, and saves", () => {
		const { canvas, adapter } = adapt();
		const a = canvas.addCard(0, 0);
		const b = canvas.addCard(500, 0);
		adapter.connect(a, b);
		expect(canvas.edges).toEqual([{ id: expect.stringMatching(/^[0-9a-f]{16}$/), fromNode: a.id, toNode: b.id, toEnd: "arrow" }]);
		expect(canvas.saves).toBe(1);
	});

	it("attaches the arrow to the requested sides", () => {
		const { canvas, adapter } = adapt();
		adapter.connect(canvas.addCard(0, 0), canvas.addCard(0, 300), { fromSide: "right", toSide: "left" });
		expect(canvas.edges[0]).toMatchObject({ fromSide: "right", toSide: "left" });
	});
});

describe("canvasViewFor", () => {
	it("finds the canvas view containing an element", () => {
		const app = new App();
		const inside = document.createElement("div");
		const container = document.createElement("div");
		container.appendChild(inside);
		const view = { containerEl: container };
		(app.workspace as FakeWorkspace).leaves = [{ view: { containerEl: document.createElement("div") } }, { view }];
		expect(canvasViewFor(app as never, inside)).toBe(view);
		expect(canvasViewFor(app as never, document.createElement("p"))).toBeNull();
	});
});

describe("newId", () => {
	it("makes distinct 16-hex-digit ids", () => {
		expect(newId()).toMatch(/^[0-9a-f]{16}$/);
		expect(newId()).not.toBe(newId());
	});
});
