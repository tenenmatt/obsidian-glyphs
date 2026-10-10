// What each glyph does on a Canvas. Pure decision logic over CanvasAdapter,
// so it can be tested without Obsidian. See SPEC.md "Glyph vocabulary".

import { Pt, bounds, pointInPolygon } from "../recognize/features";
import { GlyphName } from "../recognize/Recognizer";
import { CanvasAdapter, CanvasNode, Rect, SelectionData, Side } from "../targets/CanvasAdapter";

export type CanvasGesture = GlyphName | "tap";

/** The plugin's own clipboard: what the last caret copied. */
export interface Clipboard {
	data: SelectionData | null;
}

/** What a command did: `label` is shown in the flash notice, `detail` only in the debug log. */
export interface Outcome {
	label: string;
	detail?: string;
}

/**
 * Run the command for a recognized glyph drawn at `client` points (in client
 * coordinates). Labels use the command names from the cheatsheet.
 */
export function runCanvasGlyph(canvas: CanvasAdapter, gesture: CanvasGesture, client: Pt[], clipboard: Clipboard): Outcome {
	const points = client.map((p) => canvas.toCanvas(p));
	switch (gesture) {
		case "tap":
			return tap(canvas, points[0]);
		case "lasso":
		case "square":
			return loop(canvas, gesture, points);
		case "x":
			return cross(canvas, points);
		case "line":
			return line(canvas, points);
		case "caret":
			return copy(canvas, points, clipboard);
		case "v":
			return paste(canvas, points, clipboard);
	}
}

/** Copy the card under the caret, or the whole selection if that card is selected. */
function copy(canvas: CanvasAdapter, points: Pt[], clipboard: Clipboard): Outcome {
	const card = canvas.cardAt(boxCenter(points));
	if (!card) return { label: "nothing to copy" };
	const cards = canvas.isSelected(card) ? canvas.selectedCards() : [card];
	clipboard.data = canvas.copy(cards);
	return { label: cards.length === 1 ? "copy card" : `copy ${plural(cards.length, "card")}` };
}

/** Paste the clipboard centered on the V's bottom point, selecting what was pasted. */
function paste(canvas: CanvasAdapter, points: Pt[], clipboard: Clipboard): Outcome {
	if (!clipboard.data) return { label: "nothing to paste" };
	// Canvas y grows downward, so the V's vertex is its largest y.
	const vertex = points.reduce((low, p) => (p.y > low.y ? p : low));
	const count = canvas.paste(clipboard.data, vertex);
	return { label: count === 1 ? "paste card" : `paste ${plural(count, "card")}` };
}

function tap(canvas: CanvasAdapter, p: Pt): Outcome {
	const card = canvas.cardAt(p);
	if (!card) {
		canvas.clearSelection();
		return { label: "clear selection" };
	}
	canvas.select([card]);
	return { label: "select card" };
}

/**
 * A closed loop around card centers selects them, whatever its shape, so a
 * squarish lasso never creates a card. Over empty space, a square creates a
 * card and a lasso clears the selection.
 */
function loop(canvas: CanvasAdapter, glyph: "lasso" | "square", poly: Pt[]): Outcome {
	const box = toRect(poly);
	const enclosed = canvas.cardsOverlapping(box).filter((card) => pointInPolygon(center(card), poly));
	if (enclosed.length > 0) {
		canvas.select(enclosed);
		return { label: `select ${plural(enclosed.length, "card")}` };
	}
	if (glyph === "square") {
		canvas.createCard(box);
		return { label: "new card" };
	}
	canvas.clearSelection();
	return { label: "clear selection" };
}

/** Delete the card under the X's center, or the whole selection if that card is selected. */
function cross(canvas: CanvasAdapter, points: Pt[]): Outcome {
	const card = canvas.cardAt(boxCenter(points));
	if (!card) return { label: "no card under the x" };
	if (canvas.isSelected(card)) return { label: `delete ${plural(canvas.deleteSelection(), "card")}` };
	canvas.deleteCards([card]);
	return { label: "delete card" };
}

/**
 * Connect the card under the start of the stroke to the card under its end,
 * attaching the arrow to the side the stroke left from and the side it
 * entered by.
 */
function line(canvas: CanvasAdapter, points: Pt[]): Outcome {
	const from = canvas.cardAt(points[0]);
	const to = canvas.cardAt(points[points.length - 1]);
	if (!from || !to || from === to) return { label: "connect: start and end on two cards" };
	// The first point after the stroke last leaves `from`, and the last point
	// before it first enters `to`. Overlapping cards may leave no such point.
	const lastOnFrom = points.map((p) => contains(from, p)).lastIndexOf(true);
	const firstOnTo = points.findIndex((p) => contains(to, p));
	const fromSide = sideCrossed(from, points[lastOnFrom + 1] ?? points[lastOnFrom]);
	const toSide = sideCrossed(to, points[firstOnTo - 1] ?? points[firstOnTo]);
	canvas.connect(from, to, { fromSide, toSide });
	return { label: "connect", detail: `${fromSide} → ${toSide}` };
}

function contains(card: CanvasNode, p: Pt): boolean {
	return p.x >= card.x && p.x <= card.x + card.width && p.y >= card.y && p.y <= card.y + card.height;
}

/**
 * The side of `card` a stroke crossed to reach `outside`, a point just beyond
 * the card: whichever side it lies furthest beyond. A point on the card falls
 * back to the nearest side.
 */
export function sideCrossed(card: CanvasNode, outside: Pt): Side {
	const beyond: [Side, number][] = [
		["top", card.y - outside.y],
		["bottom", outside.y - (card.y + card.height)],
		["left", card.x - outside.x],
		["right", outside.x - (card.x + card.width)],
	];
	const [side, distance] = beyond.reduce((best, b) => (b[1] > best[1] ? b : best));
	return distance > 0 ? side : nearestSide(card, outside);
}

/** The side of `card` closest to a point on or near it. */
export function nearestSide(card: CanvasNode, p: Pt): Side {
	const distances: [Side, number][] = [
		["top", Math.abs(p.y - card.y)],
		["bottom", Math.abs(card.y + card.height - p.y)],
		["left", Math.abs(p.x - card.x)],
		["right", Math.abs(card.x + card.width - p.x)],
	];
	return distances.reduce((best, d) => (d[1] < best[1] ? d : best))[0];
}

function boxCenter(points: Pt[]): Pt {
	const box = toRect(points);
	return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

function toRect(points: Pt[]): Rect {
	const b = bounds(points);
	return { minX: b.minX, minY: b.minY, maxX: b.minX + b.width, maxY: b.minY + b.height };
}

function center(card: CanvasNode): Pt {
	return { x: card.x + card.width / 2, y: card.y + card.height / 2 };
}

function plural(n: number, word: string): string {
	return `${n} ${word}${n === 1 ? "" : "s"}`;
}
