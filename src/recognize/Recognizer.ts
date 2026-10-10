// Turns one pen stroke into a glyph name, or none.
//
// Each glyph is recognized by whatever separates it best on real Pencil input
// (see SPEC.md "Recognition" and test/fixtures/gestures.json):
//   too small               -> none
//   nearly straight         -> line
//   closes on itself        -> square (3-4 corners, rectangular) or lasso (0-2 corners)
//   anything else           -> $P template match among x / caret / v
// $P is orientation-sensitive, which is what tells caret from v.

import { TAP_MAX_SIZE } from "../input/strokes";
import { bounds, closure, corners, hullFill, inkRatio, straightness, Pt } from "./features";
import { Match, Template, normalize, rank } from "./pdollar";

export type GlyphName = "x" | "caret" | "v" | "line" | "lasso" | "square";

export type Recognition =
	| { glyph: GlyphName; detail: string; matches?: Match[] }
	| { glyph: null; reason: string; matches?: Match[] };

export const thresholds = {
	/** Below this bounding-box diagonal (px), a stroke is too small to be a glyph. Quick ones are taps (TAP_MAX_SIZE). */
	minSize: TAP_MAX_SIZE,
	/** Lines measure 0.86-0.99; the straightest non-line fixture, a squiggle, 0.80. */
	lineStraightness: 0.85,
	/** Lassos and squares measure 0-0.06; the most closed open glyph (an x) 0.16. */
	closedBelow: 0.1,
	/** One loop inks 0.8-1.05x its bounding-box perimeter; a scribble-out 3.7x. */
	maxLoopInk: 1.25,
	/** Squares show 3-4 corners, lassos 0-2, loopy scribbles and blobs 5+. */
	squareCorners: 3,
	squareMaxCorners: 4,
	/** Squares fill 0.75-0.97 of their bounding box; a triangle 0.55. */
	squareHullFill: 0.7,
	/**
	 * Furthest a $P match may be, per glyph: midway between the furthest real
	 * fixture and the nearest scribble, measured leave-one-out (each fixture
	 * against templates built from all the others). caret: 0.73 vs 1.13;
	 * v: 1.14 vs 1.32; x: 1.25 vs 1.55.
	 */
	maxDistance: { caret: 0.95, v: 1.22, x: 1.38 } as Record<string, number>,
};

export class Recognizer {
	constructor(private templates: Template[]) {}

	recognize(points: Pt[]): Recognition {
		const box = bounds(points);
		const size = Math.hypot(box.width, box.height);
		if (size < thresholds.minSize) return { glyph: null, reason: `too small (${Math.round(size)}px)` };

		const straight = straightness(points);
		if (straight >= thresholds.lineStraightness) return { glyph: "line", detail: `straightness ${fmt(straight)}` };

		const closed = closure(points);
		if (closed < thresholds.closedBelow) return this.loop(points);

		const matches = rank(
			normalize(points.map((p) => ({ x: p.x, y: p.y, id: 1 }))),
			this.templates,
		);
		const best = matches[0];
		if (!best) return { glyph: null, reason: "no templates", matches };
		const limit = thresholds.maxDistance[best.name];
		if (limit === undefined || best.distance > limit) {
			return { glyph: null, reason: `nearest ${best.name} at ${fmt(best.distance)}`, matches };
		}
		return { glyph: best.name as GlyphName, detail: `$P distance ${fmt(best.distance)}`, matches };
	}

	private loop(points: Pt[]): Recognition {
		const ink = inkRatio(points);
		if (ink > thresholds.maxLoopInk) return { glyph: null, reason: `scribble (ink ${fmt(ink)})` };
		const count = corners(points);
		if (count < thresholds.squareCorners) return { glyph: "lasso", detail: `closed, ${count} corners` };
		if (count > thresholds.squareMaxCorners) return { glyph: null, reason: `closed with ${count} corners` };
		const fill = hullFill(points);
		if (fill >= thresholds.squareHullFill) {
			return { glyph: "square", detail: `closed, ${count} corners, fill ${fmt(fill)}` };
		}
		return { glyph: null, reason: `closed with ${count} corners but not rectangular (fill ${fmt(fill)})` };
	}
}

function fmt(n: number): string {
	return n.toFixed(2);
}

/** One-line summary for the debug log, e.g. "x ($P distance 0.62; next: caret 1.31, v 1.52)". */
export function describeRecognition(r: Recognition): string {
	const head = r.glyph ? `${r.glyph} (${r.detail}` : `no glyph (${r.reason}`;
	const others = nearestPerName(r.matches ?? []).filter((m) => m.name !== r.glyph);
	const tail = others.length ? `; next: ${others.map((m) => `${m.name} ${fmt(m.distance)}`).join(", ")}` : "";
	return `${head}${tail})`;
}

/** The closest match for each glyph name, nearest first, at most three. */
function nearestPerName(matches: Match[]): Match[] {
	const seen = new Set<string>();
	const out: Match[] = [];
	for (const m of matches) {
		if (seen.has(m.name)) continue;
		seen.add(m.name);
		out.push(m);
	}
	return out.slice(0, 3);
}
