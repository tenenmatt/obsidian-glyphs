import { describe, expect, it } from "vitest";
import { TAP_MAX_MS, TAP_MAX_SIZE, classify, lastGesture, strokeStats } from "../src/input/strokes";
import { pt, stroke } from "./helpers";

describe("classify", () => {
	it("calls a quick, small contact a tap, even if it drifts", () => {
		expect(classify([pt(10, 10, 0)])).toBe("tap");
		// A real missed tap from the iPad: 108ms, 6x14px.
		expect(classify([pt(10, 10, 0), pt(16, 24, TAP_MAX_MS)])).toBe("tap");
	});

	it("calls a long contact a stroke even if it never moved", () => {
		expect(classify([pt(10, 10, 0), pt(10, 10, TAP_MAX_MS + 1)])).toBe("stroke");
	});

	it("calls a quick contact as big as a glyph a stroke", () => {
		expect(classify([pt(10, 10, 0), pt(10, 10 + TAP_MAX_SIZE, 50), pt(10, 10, 60)])).toBe("stroke");
	});
});

describe("strokeStats", () => {
	it("measures a single point", () => {
		expect(strokeStats([pt(5, 6, 100, 0.3)])).toEqual({ ms: 0, length: 0, width: 0, height: 0, maxPressure: 0.3 });
	});

	it("measures duration, path length, bounding box and peak pressure", () => {
		const s = strokeStats([pt(0, 0, 100, 0.2), pt(3, 4, 110, 0.9), pt(3, -4, 130, 0.4)]);
		expect(s).toEqual({ ms: 30, length: 5 + 8, width: 3, height: 8, maxPressure: 0.9 });
	});
});

describe("lastGesture", () => {
	const a = stroke([pt(0, 0, 0), pt(1, 1, 100)]);
	const b = stroke([pt(0, 0, 900), pt(1, 1, 1000)]); // starts 800ms after a ends
	const c = stroke([pt(0, 0, 1300), pt(1, 1, 1400)]); // starts 300ms after b ends

	it("is empty with no strokes", () => {
		expect(lastGesture([], 500)).toEqual([]);
	});

	it("collects the trailing strokes separated by short gaps", () => {
		expect(lastGesture([a, b, c], 500)).toEqual([b, c]);
	});

	it("returns only the last stroke when the gap before it is long", () => {
		expect(lastGesture([a, b, c], 200)).toEqual([c]);
	});

	it("includes everything when every gap is short", () => {
		expect(lastGesture([a, b, c], 1000)).toEqual([a, b, c]);
	});
});
