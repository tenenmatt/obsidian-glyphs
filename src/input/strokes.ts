// Pure stroke geometry: no DOM, no Obsidian.

export interface PenPoint {
	x: number; // client px
	y: number;
	t: number; // ms, event timeStamp
	p: number; // pressure 0..1
}

export type StrokeKind = "tap" | "stroke";

export interface PenStroke {
	kind: StrokeKind;
	points: PenPoint[];
	target: Element;
}

export interface StrokeStats {
	ms: number;
	length: number;
	width: number;
	height: number;
	maxPressure: number;
}

// A pen contact no longer than this, whose bounding box is smaller across
// than TAP_MAX_SIZE, is a tap. Real taps on the iPad drift up to ~15px in
// ~100ms; TAP_MAX_SIZE matches the recognizer's minimum glyph size, so every
// quick contact is either a tap or big enough to be a glyph.
export const TAP_MAX_MS = 250;
export const TAP_MAX_SIZE = 24;

/** Classify a non-empty point list as a tap or a stroke. */
export function classify(points: PenPoint[]): StrokeKind {
	const duration = points[points.length - 1].t - points[0].t;
	if (duration > TAP_MAX_MS) return "stroke";
	const s = strokeStats(points);
	return Math.hypot(s.width, s.height) < TAP_MAX_SIZE ? "tap" : "stroke";
}

/** Duration, path length, bounding box and peak pressure of a non-empty point list. */
export function strokeStats(points: PenPoint[]): StrokeStats {
	const first = points[0];
	let length = 0;
	let [minX, minY, maxX, maxY] = [first.x, first.y, first.x, first.y];
	let maxPressure = first.p;
	for (let i = 1; i < points.length; i++) {
		const p = points[i];
		length += Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y);
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
		maxPressure = Math.max(maxPressure, p.p);
	}
	return {
		ms: points[points.length - 1].t - first.t,
		length,
		width: maxX - minX,
		height: maxY - minY,
		maxPressure,
	};
}

/**
 * The trailing run of strokes where each starts within `gapMs` of the previous
 * one ending: the strokes of one multistroke gesture, such as a two-stroke X.
 */
export function lastGesture(strokes: PenStroke[], gapMs: number): PenStroke[] {
	const out: PenStroke[] = [];
	for (let i = strokes.length - 1; i >= 0; i--) {
		const s = strokes[i];
		const next = out[0];
		if (next && next.points[0].t - s.points[s.points.length - 1].t > gapMs) break;
		out.unshift(s);
	}
	return out;
}
