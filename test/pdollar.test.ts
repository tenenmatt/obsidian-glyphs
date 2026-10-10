import { describe, expect, it } from "vitest";
import { CloudPoint, NUM_POINTS, greedyCloudMatch, normalize, rank, resample } from "../src/recognize/pdollar";

const p = (x: number, y: number, id = 1): CloudPoint => ({ x, y, id });

/** Points along a polyline through `corners`, `step` px apart. */
function path(corners: [number, number][], step = 2, id = 1): CloudPoint[] {
	const out: CloudPoint[] = [p(corners[0][0], corners[0][1], id)];
	for (let i = 1; i < corners.length; i++) {
		const [ax, ay] = corners[i - 1];
		const [bx, by] = corners[i];
		const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
		for (let k = 1; k <= n; k++) out.push(p(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, id));
	}
	return out;
}

const caret = path([
	[0, 100],
	[50, 0],
	[100, 100],
]);
const v = path([
	[0, 0],
	[50, 100],
	[100, 0],
]);

describe("resample", () => {
	it("returns n evenly spaced points, landing exactly or adding the last point after rounding", () => {
		const exact = resample(path([[0, 0], [31, 0]], 1), 32);
		const rounded = resample([p(0, 0), p(10, 0)], 32);
		for (const r of [exact, rounded]) {
			expect(r).toHaveLength(32);
			expect(r[r.length - 1].x).toBeCloseTo(r[0].x + (r === exact ? 31 : 10));
		}
	});

	it("does not mutate its input", () => {
		const input = [p(0, 0), p(10, 0)];
		resample(input, 8);
		expect(input).toEqual([p(0, 0), p(10, 0)]);
	});

	it("handles a zero-length path", () => {
		expect(resample([p(3, 4), p(3, 4)], 4)).toEqual([p(3, 4), p(3, 4), p(3, 4), p(3, 4)]);
	});

	it("does not interpolate across strokes", () => {
		const twoStrokes = [...path([[0, 0], [10, 0]], 1, 1), ...path([[100, 0], [110, 0]], 1, 2)];
		const r = resample(twoStrokes, 8);
		expect(r.every((q) => q.x <= 10 || q.x >= 100)).toBe(true);
	});
});

describe("normalize", () => {
	it("resamples, scales to unit size keeping aspect ratio, and centers on the origin", () => {
		const n = normalize(path([[100, 100], [300, 100], [300, 150]]));
		expect(n).toHaveLength(NUM_POINTS);
		const xs = n.map((q) => q.x);
		const ys = n.map((q) => q.y);
		expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1);
		expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.25);
		expect(xs.reduce((a, b) => a + b) / n.length).toBeCloseTo(0);
		expect(ys.reduce((a, b) => a + b) / n.length).toBeCloseTo(0);
	});

	it("survives a single repeated point", () => {
		expect(normalize([p(5, 5), p(5, 5)]).every((q) => q.x === 0 && q.y === 0)).toBe(true);
	});
});

describe("matching", () => {
	it("scores a cloud against itself as zero", () => {
		const c = normalize(caret);
		expect(greedyCloudMatch(c, c)).toBeCloseTo(0);
	});

	it("is insensitive to drawing direction", () => {
		expect(greedyCloudMatch(normalize(caret), normalize([...caret].reverse()))).toBeCloseTo(0);
	});

	it("is sensitive to orientation, so caret and v differ", () => {
		const templates = [
			{ name: "caret", points: normalize(caret) },
			{ name: "v", points: normalize(v) },
		];
		const wobblyV = path([
			[0, 5],
			[48, 100],
			[100, 0],
		]);
		const ranked = rank(normalize(wobblyV), templates);
		expect(ranked.map((m) => m.name)).toEqual(["v", "caret"]);
		expect(ranked[0].distance).toBeLessThan(ranked[1].distance);
	});
});
