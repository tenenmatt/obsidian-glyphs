import { beforeEach, describe, expect, it } from "vitest";
import { nearestSide, runCanvasGlyph, sideCrossed } from "../src/commands/canvasCommands";
import { CanvasAdapter, CanvasNode } from "../src/targets/CanvasAdapter";
import { FakeCanvas } from "./fakeCanvas";

let canvas: FakeCanvas;
let adapter: CanvasAdapter;

beforeEach(() => {
	canvas = new FakeCanvas();
	// Client and canvas coordinates differ, so tests catch a missed conversion.
	canvas.offset = { x: 1000, y: 1000 };
	adapter = CanvasAdapter.from({ canvas }) as CanvasAdapter;
});

/** The sides the first connection is attached to. */
const sides = () => ({ fromSide: canvas.edges[0].fromSide, toSide: canvas.edges[0].toSide });
/** Client-coordinate points for canvas-coordinate input. */
const client = (...pts: [number, number][]) => pts.map(([x, y]) => ({ x: x + 1000, y: y + 1000 }));
/** A closed rectangle path around the given canvas box. */
const loopAround = (minX: number, minY: number, maxX: number, maxY: number) =>
	client([minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY + 1]);

describe("tap", () => {
	it("selects the card under the pen", () => {
		const card = canvas.addCard(0, 0);
		expect(runCanvasGlyph(adapter, "tap", client([50, 30]))).toBe("selected card");
		expect([...canvas.selection]).toEqual([card]);
	});

	it("clears the selection on empty canvas", () => {
		canvas.selectAll([canvas.addCard(0, 0)]);
		expect(runCanvasGlyph(adapter, "tap", client([500, 500]))).toBe("cleared selection");
		expect(canvas.selection.size).toBe(0);
	});
});

describe("lasso and square", () => {
	it("a lasso selects the cards whose centers it encloses", () => {
		const a = canvas.addCard(0, 0); // center 50,30
		const b = canvas.addCard(200, 0); // center 250,30
		canvas.addCard(180, 300); // center 230,330: overlaps the loop's box, but its center is outside
		expect(runCanvasGlyph(adapter, "lasso", loopAround(-20, -20, 320, 320))).toBe("selected 2 cards");
		expect([...canvas.selection]).toEqual([a, b]);
	});

	it("selects only cards whose centers are inside a non-rectangular loop", () => {
		const inside = canvas.addCard(0, 0);
		canvas.addCard(300, 300); // inside the loop's bounding box, outside the triangle
		const triangle = client([-50, -50], [400, -50], [-50, 400], [-50, -49]);
		expect(runCanvasGlyph(adapter, "lasso", triangle)).toBe("selected 1 card");
		expect([...canvas.selection]).toEqual([inside]);
	});

	it("a square around cards selects them rather than creating a card", () => {
		canvas.addCard(0, 0);
		expect(runCanvasGlyph(adapter, "square", loopAround(-20, -20, 150, 100))).toBe("selected 1 card");
		expect(canvas.nodes.size).toBe(1);
	});

	it("a square on empty space creates a card filling it, opened for editing", () => {
		expect(runCanvasGlyph(adapter, "square", loopAround(100, 100, 400, 300))).toBe("new card");
		const [card] = canvas.nodes.values();
		expect(card).toMatchObject({ x: 100, y: 100, width: 300, height: 200, editing: true });
	});

	it("a lasso around nothing clears the selection", () => {
		canvas.selectAll([canvas.addCard(0, 0)]);
		expect(runCanvasGlyph(adapter, "lasso", loopAround(500, 500, 600, 600))).toBe("cleared selection");
		expect(canvas.selection.size).toBe(0);
	});
});

describe("x", () => {
	const xOver = (cx: number, cy: number) => client([cx - 20, cy - 20], [cx + 20, cy + 20], [cx + 20, cy - 20], [cx - 20, cy + 20]);

	it("deletes the card under its center without needing a selection", () => {
		const doomed = canvas.addCard(0, 0);
		const other = canvas.addCard(200, 0);
		expect(runCanvasGlyph(adapter, "x", xOver(50, 30))).toBe("deleted card");
		expect([...canvas.nodes.values()]).toEqual([other]);
		expect(canvas.nodes.has(doomed.id)).toBe(false);
		expect(canvas.saves).toBe(1);
	});

	it("deletes only that card when it is not part of the selection", () => {
		const selected = canvas.addCard(200, 0);
		canvas.addCard(0, 0);
		canvas.selectAll([selected]);
		expect(runCanvasGlyph(adapter, "x", xOver(50, 30))).toBe("deleted card");
		expect([...canvas.nodes.values()]).toEqual([selected]);
	});

	it("deletes the whole selection when it hits a selected card", () => {
		const a = canvas.addCard(0, 0);
		const b = canvas.addCard(200, 0);
		const keep = canvas.addCard(400, 0);
		canvas.selectAll([a, b]);
		expect(runCanvasGlyph(adapter, "x", xOver(250, 30))).toBe("deleted 2 cards");
		expect([...canvas.nodes.values()]).toEqual([keep]);
	});

	it("deletes nothing when drawn over empty canvas", () => {
		canvas.addCard(0, 0);
		expect(runCanvasGlyph(adapter, "x", xOver(500, 500))).toBe("delete: no card under the x");
		expect(canvas.nodes.size).toBe(1);
	});

	it("reports a selection containing one card in the singular", () => {
		const a = canvas.addCard(0, 0);
		canvas.selectAll([a]);
		expect(runCanvasGlyph(adapter, "x", xOver(50, 30))).toBe("deleted 1 card");
	});
});

describe("line", () => {
	it("connects the card where it starts to the card where it ends", () => {
		const a = canvas.addCard(0, 0);
		const b = canvas.addCard(300, 200);
		expect(runCanvasGlyph(adapter, "line", client([50, 30], [200, 120], [350, 230]))).toBe(
			"connected cards (right → left)",
		);
		expect(canvas.edges).toMatchObject([{ fromNode: a.id, toNode: b.id, toEnd: "arrow" }]);
	});

	describe("attaches the arrow where the stroke leaves and enters", () => {
		// Two cards stacked vertically: top at y 0-60, bottom at y 300-360.
		let top: CanvasNode;
		let bottom: CanvasNode;
		beforeEach(() => {
			top = canvas.addCard(0, 0);
			bottom = canvas.addCard(0, 300);
		});

		it("straight down: bottom of the upper card to top of the lower one", () => {
			runCanvasGlyph(adapter, "line", client([50, 30], [50, 60], [50, 300], [50, 330]));
			expect(sides()).toEqual({ fromSide: "bottom", toSide: "top" });
		});

		it("out the right side and around into the lower card's right side", () => {
			runCanvasGlyph(adapter, "line", client([60, 30], [100, 30], [160, 100], [160, 300], [100, 330], [80, 330]));
			expect(sides()).toEqual({ fromSide: "right", toSide: "right" });
		});

		it("uses the last exit when the stroke wanders back over the start card", () => {
			runCanvasGlyph(adapter, "line", client([50, 30], [100, 30], [120, 30], [50, 30], [0, 30], [-30, 30], [-40, 200], [-30, 330], [0, 330], [30, 330]));
			expect(sides()).toEqual({ fromSide: "left", toSide: "left" });
		});

		it("still names the cards it connected", () => {
			runCanvasGlyph(adapter, "line", client([50, 30], [50, 330]));
			expect(canvas.edges[0]).toMatchObject({ fromNode: top.id, toNode: bottom.id });
		});
	});

	it("works from sparse points, using the first point past the card's edge", () => {
		canvas.addCard(0, 0);
		canvas.addCard(0, 300);
		runCanvasGlyph(adapter, "line", client([50, 30], [400, 30], [400, 330], [0, 330]));
		expect(sides()).toEqual({ fromSide: "right", toSide: "right" });
	});

	it("falls back to the nearest side when overlapping cards leave no point outside", () => {
		// The end card sits on top of the start card, so the stroke never leaves `from`.
		canvas.addCard(0, 0, 200, 200);
		const over = canvas.addCard(150, 150, 100, 60);
		runCanvasGlyph(adapter, "line", client([5, 100], [195, 175]));
		expect(canvas.edges[0]).toMatchObject({ toNode: over.id });
		expect(sides()).toEqual({ fromSide: "right", toSide: "left" });
	});

	it("falls back to the nearest side when the stroke starts on top of the end card", () => {
		const under = canvas.addCard(0, 0, 200, 200);
		const onTop = canvas.addCard(10, 10, 60, 40);
		runCanvasGlyph(adapter, "line", client([20, 20], [150, 150]));
		expect(canvas.edges[0]).toMatchObject({ fromNode: onTop.id, toNode: under.id });
		expect(sides()).toEqual({ fromSide: "bottom", toSide: "top" });
	});

	it("sideCrossed picks the side a point lies furthest beyond", () => {
		const card = { id: "c", x: 0, y: 0, width: 100, height: 60 };
		expect(sideCrossed(card, { x: 50, y: -5 })).toBe("top");
		expect(sideCrossed(card, { x: 110, y: 90 })).toBe("bottom"); // beyond right by 10, bottom by 30
		expect(sideCrossed(card, { x: -3, y: 30 })).toBe("left");
		expect(sideCrossed(card, { x: 101, y: 30 })).toBe("right");
		expect(sideCrossed(card, { x: 50, y: 57 })).toBe("bottom"); // on the card: nearest side
	});

	it("nearestSide picks each side", () => {
		const card = { id: "c", x: 0, y: 0, width: 100, height: 60 };
		expect(nearestSide(card, { x: 50, y: 2 })).toBe("top");
		expect(nearestSide(card, { x: 50, y: 58 })).toBe("bottom");
		expect(nearestSide(card, { x: 2, y: 30 })).toBe("left");
		expect(nearestSide(card, { x: 98, y: 30 })).toBe("right");
	});

	it("does nothing unless both ends are on different cards", () => {
		const a = canvas.addCard(0, 0);
		const offEnd = client([50, 30], [500, 500]);
		const offStart = client([500, 500], [50, 30]);
		const sameCard = client([10, 10], [90, 50]);
		for (const stroke of [offEnd, offStart, sameCard]) {
			expect(runCanvasGlyph(adapter, "line", stroke)).toBe("connect: start and end on two different cards");
		}
		expect(canvas.edges).toEqual([]);
		expect(a).toBeDefined();
	});
});

describe("caret and v", () => {
	it("say copy and paste are not available yet", () => {
		expect(runCanvasGlyph(adapter, "caret", client([0, 0]))).toBe("copy: not available yet");
		expect(runCanvasGlyph(adapter, "v", client([0, 0]))).toBe("paste: not available yet");
	});
});
