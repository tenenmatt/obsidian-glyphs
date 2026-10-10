// Synthetic strokes for recognizer and feature tests. Real Pencil strokes
// live in test/fixtures/gestures.json; these are idealized shapes whose
// expected measurements are easy to reason about.

import { PenPoint } from "../src/input/strokes";

/** Dense points along a polyline through `corners`, about 2px apart, 4ms per point. */
export function polyline(corners: [number, number][]): PenPoint[] {
	const out: PenPoint[] = [];
	const push = (x: number, y: number) => out.push({ x, y, t: out.length * 4, p: 0.3 });
	push(corners[0][0], corners[0][1]);
	for (let i = 1; i < corners.length; i++) {
		const [ax, ay] = corners[i - 1];
		const [bx, by] = corners[i];
		const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 2));
		for (let k = 1; k <= n; k++) push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n);
	}
	return out;
}

export const shapes = {
	line: () =>
		polyline([
			[100, 100],
			[300, 160],
		]),
	caret: () =>
		polyline([
			[100, 300],
			[150, 200],
			[200, 300],
		]),
	v: () =>
		polyline([
			[100, 200],
			[150, 300],
			[200, 200],
		]),
	/** The author's single-stroke X: one diagonal, back up the side, the other diagonal. */
	x: () =>
		polyline([
			[100, 100],
			[200, 200],
			[200, 100],
			[100, 200],
		]),
	square: () =>
		polyline([
			[100, 100],
			[220, 100],
			[220, 220],
			[100, 220],
			[100, 104],
		]),
	/** Starts mid-side so all three corners are measured. */
	triangle: () =>
		polyline([
			[160, 220],
			[100, 220],
			[160, 100],
			[220, 220],
			[164, 220],
		]),
	/** A straight stroke with a sharp hook right at its end. */
	hookedLine: () =>
		polyline([
			[100, 100],
			[300, 100],
			[290, 115],
		]),
	/** A circle, optionally overshooting its start or going around several times. */
	circle: ({ overshoot = 0, turns = 1, cx = 200, cy = 200, r = 80 } = {}) => {
		const total = Math.PI * 2 * (turns + overshoot);
		const n = Math.round((r * total) / 2);
		return Array.from({ length: n + 1 }, (_, i) => {
			const a = (total * i) / n;
			return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), t: i * 4, p: 0.3 };
		});
	},
	/** A closed, wobbly cloud outline with many bumps. */
	cloud: () => {
		const n = 400;
		return Array.from({ length: n + 1 }, (_, i) => {
			const a = (Math.PI * 2 * i) / n;
			const r = 80 + 18 * Math.abs(Math.sin(a * 4.5));
			return { x: 200 + r * Math.cos(a), y: 200 + r * Math.sin(a), t: i * 4, p: 0.3 };
		});
	},
	/** An open zigzag that matches nothing. */
	zigzag: () =>
		polyline([
			[100, 100],
			[130, 180],
			[160, 100],
			[190, 180],
			[220, 100],
			[250, 180],
			[280, 100],
		]),
};
