import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Recognizer, describeRecognition, thresholds } from "../src/recognize/Recognizer";
import { normalize } from "../src/recognize/pdollar";
import { TEMPLATES } from "../src/recognize/templates";
import { polyline, shapes } from "./shapes";

const recognizer = new Recognizer(TEMPLATES);
const glyphOf = (points: { x: number; y: number }[]) => recognizer.recognize(points).glyph;

describe("routing by geometry", () => {
	it("ignores strokes too small to be glyphs", () => {
		const r = recognizer.recognize(polyline([[100, 100], [110, 110]]));
		expect(r).toEqual({ glyph: null, reason: "too small (14px)" });
	});

	it("calls a nearly straight stroke a line, in any direction", () => {
		expect(glyphOf(shapes.line())).toBe("line");
		expect(glyphOf([...shapes.line()].reverse())).toBe("line");
		expect(glyphOf(polyline([[100, 100], [100, 300]]))).toBe("line");
	});

	it("calls a round closed loop a lasso, even when it overshoots its start", () => {
		expect(glyphOf(shapes.circle())).toBe("lasso");
		expect(glyphOf(shapes.circle({ overshoot: 0.15 }))).toBe("lasso");
	});

	it("calls a triangle drawn from a corner a lasso: its starting corner isn't measured", () => {
		expect(glyphOf(polyline([[100, 220], [160, 100], [220, 220], [104, 220]]))).toBe("lasso");
	});

	it("calls a closed rectangle a square", () => {
		const r = recognizer.recognize(shapes.square());
		expect(r.glyph).toBe("square");
	});

	it("rejects closed shapes that are neither", () => {
		expect(recognizer.recognize(shapes.circle({ turns: 4 }))).toMatchObject({ glyph: null, reason: expect.stringMatching(/^scribble/) });
		expect(recognizer.recognize(shapes.triangle())).toMatchObject({ glyph: null, reason: expect.stringMatching(/not rectangular/) });
		expect(recognizer.recognize(shapes.cloud())).toMatchObject({ glyph: null, reason: expect.stringMatching(/^closed with \d+ corners$/) });
	});
});

describe("template matching", () => {
	it("tells caret and v apart", () => {
		expect(glyphOf(shapes.caret())).toBe("caret");
		expect(glyphOf(shapes.v())).toBe("v");
	});

	it("recognizes a ruler-straight x, though templates are the author's curved ones", () => {
		expect(glyphOf(shapes.x())).toBe("x");
	});

	it("rejects an open stroke that matches nothing well", () => {
		const r = recognizer.recognize(shapes.zigzag());
		expect(r.glyph).toBeNull();
		const best = r.matches![0];
		expect(best.distance).toBeGreaterThan(thresholds.maxDistance[best.name]);
	});

	it("never accepts a template for a glyph with no distance limit", () => {
		const caret = normalize(shapes.caret().map((p) => ({ x: p.x, y: p.y, id: 1 })));
		const r = new Recognizer([{ name: "mystery", points: caret }]).recognize(shapes.caret());
		expect(r).toMatchObject({ glyph: null, reason: "nearest mystery at 0.00" });
	});

	it("reports no match when it has no templates", () => {
		expect(new Recognizer([]).recognize(shapes.caret())).toEqual({ glyph: null, reason: "no templates", matches: [] });
	});
});

describe("describeRecognition", () => {
	it("summarizes a match with the nearest other glyphs", () => {
		const text = describeRecognition({
			glyph: "x",
			detail: "$P distance 0.50",
			matches: [
				{ name: "x", distance: 0.5 },
				{ name: "x", distance: 0.6 },
				{ name: "caret", distance: 1.2 },
				{ name: "v", distance: 1.3 },
				{ name: "caret", distance: 1.4 },
			],
		});
		expect(text).toBe("x ($P distance 0.50; next: caret 1.20, v 1.30)");
	});

	it("summarizes a miss, listing at most three candidates", () => {
		const text = describeRecognition({
			glyph: null,
			reason: "nearest x at 1.40",
			matches: ["x", "caret", "v", "y"].map((name, i) => ({ name, distance: 1.4 + i / 10 })),
		});
		expect(text).toBe("no glyph (nearest x at 1.40; next: x 1.40, caret 1.50, v 1.60)");
	});

	it("summarizes a geometric result with no candidates", () => {
		expect(describeRecognition({ glyph: "line", detail: "straightness 0.97" })).toBe("line (straightness 0.97)");
	});
});

describe("templates", () => {
	it("are normalized point clouds: 32 points, centered, unit size", () => {
		for (const t of TEMPLATES) {
			expect(t.points).toHaveLength(32);
			const xs = t.points.map((p) => p.x);
			const ys = t.points.map((p) => p.y);
			expect(xs.reduce((a, b) => a + b) / 32).toBeCloseTo(0, 2);
			expect(ys.reduce((a, b) => a + b) / 32).toBeCloseTo(0, 2);
			expect(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))).toBeCloseTo(1, 2);
		}
	});
});

// The accuracy bar, measured leave-one-out: each stroke recorded on the iPad
// must be recognized correctly by templates built from all the *other*
// fixtures, and every scribble must be rejected.
describe("accuracy on recorded Pencil fixtures (leave-one-out)", () => {
	type Gesture = { id: string; label: string; strokes: number[][][] };
	const gestures: Gesture[] = JSON.parse(readFileSync("test/fixtures/gestures.json", "utf8"));
	const points = (g: Gesture) => g.strokes[0].map(([x, y]) => ({ x, y }));
	const templateFor = new Map(
		gestures
			.filter((g) => ["x", "caret", "v"].includes(g.label))
			.map((g) => [g.id, { name: g.label, points: normalize(points(g).map((p) => ({ ...p, id: 1 }))) }]),
	);

	it("has fixtures for every glyph and some scribbles, and a built-in template for each x/caret/v", () => {
		expect([...new Set(gestures.map((g) => g.label))].sort()).toEqual(["caret", "lasso", "line", "other", "square", "v", "x"]);
		expect(TEMPLATES).toHaveLength(templateFor.size);
	});

	it.each(gestures.map((g) => [g.id, g] as const))("%s", (_id, g) => {
		const others = [...templateFor].filter(([id]) => id !== g.id).map(([, t]) => t);
		const r = new Recognizer(others).recognize(points(g));
		expect(r.glyph ?? "other").toBe(g.label);
	});
});
