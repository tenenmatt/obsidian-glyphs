/**
 * The $P Point-Cloud Recognizer, ported to TypeScript from the reference
 * JavaScript implementation (pdollar.js, last updated July 14, 2018):
 * https://depts.washington.edu/acelab/proj/dollar/pdollar.html
 *
 * Changes from the reference: typed module instead of globals; no built-in
 * demo templates; input is never mutated; zero-length and zero-size input
 * normalize without dividing by zero; recognition ranks every template
 * instead of returning only the best.
 *
 * Vatavu, R.-D., Anthony, L. and Wobbrock, J.O. (2012). Gestures as point
 * clouds: A $P recognizer for user interface prototypes. Proceedings of the
 * ACM Int'l Conference on Multimodal Interfaces (ICMI '12). Santa Monica,
 * California (October 22-26, 2012). New York: ACM Press, pp. 273-280.
 * https://dl.acm.org/citation.cfm?id=2388732
 *
 * Copyright (C) 2012, Radu-Daniel Vatavu, Lisa Anthony, and
 * Jacob O. Wobbrock. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *    * Redistributions of source code must retain the above copyright
 *      notice, this list of conditions and the following disclaimer.
 *    * Redistributions in binary form must reproduce the above copyright
 *      notice, this list of conditions and the following disclaimer in the
 *      documentation and/or other materials provided with the distribution.
 *    * Neither the names of the University Stefan cel Mare of Suceava,
 *      University of Washington, nor UMBC, nor the names of its contributors
 *      may be used to endorse or promote products derived from this software
 *      without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
 * IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL Radu-Daniel Vatavu OR Lisa Anthony
 * OR Jacob O. Wobbrock BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT
 * OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT,
 * STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
 * OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
 * SUCH DAMAGE.
 */

export interface CloudPoint {
	x: number;
	y: number;
	id: number; // stroke the point belongs to (1, 2, 3, ...)
}

export interface Template {
	name: string;
	points: CloudPoint[]; // normalized
}

export interface Match {
	name: string;
	distance: number;
}

export const NUM_POINTS = 32;

/** Resample to `n` points, scale to the unit box keeping aspect ratio, center on the origin. */
export function normalize(points: CloudPoint[], n = NUM_POINTS): CloudPoint[] {
	return translateToOrigin(scale(resample(points, n)));
}

/** Every template, nearest first. `candidate` must already be normalized. */
export function rank(candidate: CloudPoint[], templates: Template[]): Match[] {
	return templates
		.map((t) => ({ name: t.name, distance: greedyCloudMatch(candidate, t.points) }))
		.sort((a, b) => a.distance - b.distance);
}

export function greedyCloudMatch(points: CloudPoint[], template: CloudPoint[]): number {
	const e = 0.5;
	const step = Math.floor(Math.pow(points.length, 1 - e));
	let min = Infinity;
	for (let i = 0; i < points.length; i += step) {
		const d1 = cloudDistance(points, template, i);
		const d2 = cloudDistance(template, points, i);
		min = Math.min(min, d1, d2);
	}
	return min;
}

function cloudDistance(pts1: CloudPoint[], pts2: CloudPoint[], start: number): number {
	const n = pts1.length; // pts1.length === pts2.length
	const matched = new Array<boolean>(n).fill(false);
	let sum = 0;
	let i = start;
	do {
		let index = -1;
		let min = Infinity;
		for (let j = 0; j < n; j++) {
			if (!matched[j]) {
				const d = distance(pts1[i], pts2[j]);
				if (d < min) {
					min = d;
					index = j;
				}
			}
		}
		matched[index] = true;
		const weight = 1 - ((i - start + n) % n) / n;
		sum += weight * min;
		i = (i + 1) % n;
	} while (i !== start);
	return sum;
}

export function resample(input: CloudPoint[], n: number): CloudPoint[] {
	const interval = pathLength(input) / (n - 1);
	if (interval === 0) return Array.from({ length: n }, () => ({ ...input[0] }));
	const points = input.slice(); // the reference mutates its input; we don't
	let D = 0;
	const out: CloudPoint[] = [{ ...points[0] }];
	for (let i = 1; i < points.length; i++) {
		if (points[i].id === points[i - 1].id) {
			const d = distance(points[i - 1], points[i]);
			if (D + d >= interval) {
				const q = {
					x: points[i - 1].x + ((interval - D) / d) * (points[i].x - points[i - 1].x),
					y: points[i - 1].y + ((interval - D) / d) * (points[i].y - points[i - 1].y),
					id: points[i].id,
				};
				out.push(q);
				points.splice(i, 0, q); // q becomes the next points[i - 1]
				D = 0;
			} else {
				D += d;
			}
		}
	}
	// Floating-point rounding can leave us one point short.
	if (out.length === n - 1) out.push({ ...points[points.length - 1] });
	return out;
}

function scale(points: CloudPoint[]): CloudPoint[] {
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
	const size = Math.max(maxX - minX, maxY - minY) || 1;
	return points.map((p) => ({ x: (p.x - minX) / size, y: (p.y - minY) / size, id: p.id }));
}

function translateToOrigin(points: CloudPoint[]): CloudPoint[] {
	let cx = 0;
	let cy = 0;
	for (const p of points) {
		cx += p.x;
		cy += p.y;
	}
	cx /= points.length;
	cy /= points.length;
	return points.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

function pathLength(points: CloudPoint[]): number {
	let d = 0;
	for (let i = 1; i < points.length; i++) {
		if (points[i].id === points[i - 1].id) d += distance(points[i - 1], points[i]);
	}
	return d;
}

function distance(a: CloudPoint, b: CloudPoint): number {
	return Math.hypot(b.x - a.x, b.y - a.y);
}
