import { describe, expect, it } from "vitest";
import {
	bounds,
	closure,
	convexHull,
	corners,
	hullFill,
	inkRatio,
	pathLength,
	pointInPolygon,
	polygonArea,
	straightness,
} from "../src/recognize/features";
import { shapes } from "./shapes";

describe("bounds and length", () => {
	it("measures a bounding box and path length", () => {
		const pts = [
			{ x: 1, y: 2 },
			{ x: 4, y: 6 },
			{ x: 4, y: 0 },
		];
		expect(bounds(pts)).toEqual({ minX: 1, minY: 0, width: 3, height: 6 });
		expect(pathLength(pts)).toBe(11);
	});
});

describe("straightness", () => {
	it("is 1 for a line, low for a doubled-back stroke, 0 for no movement", () => {
		expect(straightness(shapes.line())).toBeCloseTo(1);
		expect(straightness(shapes.caret())).toBeLessThan(0.6);
		expect(straightness([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toBe(0);
	});
});

describe("closure", () => {
	it("is near 0 for loops, including ones that overshoot their start", () => {
		expect(closure(shapes.circle())).toBeLessThan(0.05);
		expect(closure(shapes.circle({ overshoot: 0.15 }))).toBeLessThan(0.05);
	});

	it("is large for open strokes, and 0 for a dot", () => {
		expect(closure(shapes.caret())).toBeGreaterThan(0.3);
		expect(closure([{ x: 1, y: 1 }])).toBe(0);
	});
});

describe("inkRatio", () => {
	it("is about π/4 for a circle, more for a scribble-out, 0 for a dot", () => {
		expect(inkRatio(shapes.circle())).toBeCloseTo(Math.PI / 4, 1);
		expect(inkRatio(shapes.circle({ turns: 4 }))).toBeGreaterThan(3);
		expect(inkRatio([{ x: 1, y: 1 }])).toBe(0);
	});
});

describe("hullFill and its helpers", () => {
	it("is ~1 for a rectangle, ~0.79 for a circle, ~0.5 for a triangle, 0 for a flat line", () => {
		expect(hullFill(shapes.square())).toBeCloseTo(1, 1);
		expect(hullFill(shapes.circle())).toBeCloseTo(Math.PI / 4, 1);
		expect(hullFill(shapes.triangle())).toBeCloseTo(0.5, 1);
		expect(hullFill(shapes.line())).toBeCloseTo(0);
		expect(hullFill([{ x: 0, y: 5 }, { x: 9, y: 5 }])).toBe(0);
	});

	it("returns fewer than three points unchanged", () => {
		const two = [
			{ x: 2, y: 0 },
			{ x: 0, y: 0 },
		];
		expect(convexHull(two)).toEqual([two[1], two[0]]);
	});

	it("computes polygon area regardless of winding", () => {
		const sq = [
			{ x: 0, y: 0 },
			{ x: 2, y: 0 },
			{ x: 2, y: 2 },
			{ x: 0, y: 2 },
		];
		expect(polygonArea(sq)).toBe(4);
		expect(polygonArea([...sq].reverse())).toBe(4);
	});
});

describe("corners", () => {
	it("finds the corners of a square and a triangle but none on a circle", () => {
		expect(corners(shapes.square())).toBeGreaterThanOrEqual(3);
		expect(corners(shapes.triangle())).toBeGreaterThanOrEqual(2);
		expect(corners(shapes.circle())).toBe(0);
	});

	it("counts a sharp turn at the very edge of the measured range", () => {
		// The caret's only corner sits mid-stroke; a v drawn with a hook at the end
		// puts a peak on the last measured turn.
		expect(corners(shapes.caret())).toBe(1);
		expect(corners(shapes.hookedLine())).toBe(1);
	});
});

describe("pointInPolygon", () => {
	const triangle = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 0, y: 100 },
	];

	it("tells inside from outside, including inside the bounding box", () => {
		expect(pointInPolygon({ x: 10, y: 10 }, triangle)).toBe(true);
		expect(pointInPolygon({ x: 80, y: 80 }, triangle)).toBe(false);
		expect(pointInPolygon({ x: -5, y: 10 }, triangle)).toBe(false);
	});

	it("treats a stroke as closing back to its start", () => {
		const openSquare = [
			{ x: 0, y: 0 },
			{ x: 100, y: 0 },
			{ x: 100, y: 100 },
			{ x: 0, y: 100 },
		];
		expect(pointInPolygon({ x: 50, y: 50 }, openSquare)).toBe(true);
	});
});
