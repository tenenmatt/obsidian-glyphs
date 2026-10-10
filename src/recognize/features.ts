// Geometric measures of a single stroke, used to sort strokes before (or
// instead of) template matching. Thresholds that use them live in Recognizer.ts
// and were tuned on the fixtures in test/fixtures/gestures.json.

import { resample } from "./pdollar";

export interface Pt {
	x: number;
	y: number;
}

export interface Box {
	minX: number;
	minY: number;
	width: number;
	height: number;
}

export function bounds(points: Pt[]): Box {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	}
	return { minX, minY, width: maxX - minX, height: maxY - minY };
}

export function pathLength(points: Pt[]): number {
	let length = 0;
	for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
	return length;
}

/** Distance between the ends over the length of the path: 1 for a straight line. */
export function straightness(points: Pt[]): number {
	const length = pathLength(points);
	return length === 0 ? 0 : dist(points[0], points[points.length - 1]) / length;
}

/**
 * How far the stroke is from closing on itself, relative to its size: the
 * nearest approach of either end to the other end's first/last 30% of the
 * path, over the bounding-box diagonal. ~0 for a loop, even one that
 * overshoots its start (as real lassos do).
 */
export function closure(points: Pt[]): number {
	const box = bounds(points);
	const diagonal = Math.hypot(box.width, box.height);
	if (diagonal === 0) return 0;
	const k = Math.max(1, Math.floor(points.length * 0.3));
	const start = points[0];
	const end = points[points.length - 1];
	const nearStart = Math.min(...points.slice(-k).map((p) => dist(p, start)));
	const nearEnd = Math.min(...points.slice(0, k).map((p) => dist(p, end)));
	return Math.min(nearStart, nearEnd) / diagonal;
}

/** Ink over the bounding-box perimeter: ~0.8-1.05 for a single loop, much more for a scribble-out. */
export function inkRatio(points: Pt[]): number {
	const box = bounds(points);
	const perimeter = 2 * (box.width + box.height);
	return perimeter === 0 ? 0 : pathLength(points) / perimeter;
}

/** Convex hull area over bounding-box area: ~1 for a rectangle, ~0.79 for an ellipse, ~0.5 for a triangle. */
export function hullFill(points: Pt[]): number {
	const box = bounds(points);
	const boxArea = box.width * box.height;
	return boxArea === 0 ? 0 : polygonArea(convexHull(points)) / boxArea;
}

/**
 * Sharp turns along the path: resample to `n` evenly spaced points, measure
 * the turn at each point across a window of `k` points either side, and count
 * local peaks of at least `minDegrees`.
 */
export function corners(points: Pt[], n = 48, k = 2, minDegrees = 45): number {
	const p = resample(
		points.map((q) => ({ x: q.x, y: q.y, id: 1 })),
		n,
	);
	const turns: number[] = [];
	for (let i = k; i < p.length - k; i++) {
		const a = Math.atan2(p[i].y - p[i - k].y, p[i].x - p[i - k].x);
		const b = Math.atan2(p[i + k].y - p[i].y, p[i + k].x - p[i].x);
		const d = (Math.abs(b - a) * 180) / Math.PI;
		turns.push(d > 180 ? 360 - d : d);
	}
	let count = 0;
	for (let i = 0; i < turns.length; i++) {
		const peak = (i === 0 || turns[i] >= turns[i - 1]) && (i === turns.length - 1 || turns[i] > turns[i + 1]);
		if (peak && turns[i] >= minDegrees) count++;
	}
	return count;
}

export function convexHull(points: Pt[]): Pt[] {
	const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
	if (p.length < 3) return p;
	const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
	const half = (pts: Pt[]) => {
		const out: Pt[] = [];
		for (const q of pts) {
			while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
			out.push(q);
		}
		out.pop();
		return out;
	};
	return half(p).concat(half(p.reverse()));
}

export function polygonArea(poly: Pt[]): number {
	let twice = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i];
		const b = poly[(i + 1) % poly.length];
		twice += a.x * b.y - b.x * a.y;
	}
	return Math.abs(twice) / 2;
}

function dist(a: Pt, b: Pt): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
