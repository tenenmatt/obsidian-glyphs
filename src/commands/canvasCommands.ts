// What each glyph does on a Canvas. Pure decision logic over CanvasAdapter,
// so it can be tested without Obsidian. See SPEC.md "Glyph vocabulary".

import { Pt, bounds, pointInPolygon } from "../recognize/features";
import { GlyphName } from "../recognize/Recognizer";
import { CanvasAdapter, CanvasNode, Rect } from "../targets/CanvasAdapter";

export type CanvasGesture = GlyphName | "tap";

/**
 * Run the command for a recognized glyph drawn at `client` points (in client
 * coordinates). Returns a short description of what happened, for feedback.
 */
export function runCanvasGlyph(canvas: CanvasAdapter, gesture: CanvasGesture, client: Pt[]): string {
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
		case "v":
			return `${gesture === "caret" ? "copy" : "paste"}: not available yet`;
	}
}

function tap(canvas: CanvasAdapter, p: Pt): string {
	const card = canvas.cardAt(p);
	if (!card) {
		canvas.clearSelection();
		return "cleared selection";
	}
	canvas.select([card]);
	return "selected card";
}

/**
 * A closed loop around card centers selects them, whatever its shape, so a
 * squarish lasso never creates a card. Over empty space, a square creates a
 * card and a lasso clears the selection.
 */
function loop(canvas: CanvasAdapter, glyph: "lasso" | "square", poly: Pt[]): string {
	const box = toRect(poly);
	const enclosed = canvas.cardsOverlapping(box).filter((card) => pointInPolygon(center(card), poly));
	if (enclosed.length > 0) {
		canvas.select(enclosed);
		return `selected ${plural(enclosed.length, "card")}`;
	}
	if (glyph === "square") {
		canvas.createCard(box);
		return "new card";
	}
	canvas.clearSelection();
	return "cleared selection";
}

/** Delete the card under the X's center, or the whole selection if that card is selected. */
function cross(canvas: CanvasAdapter, points: Pt[]): string {
	const box = toRect(points);
	const card = canvas.cardAt({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 });
	if (!card) return "delete: no card under the x";
	if (canvas.isSelected(card)) return `deleted ${plural(canvas.deleteSelection(), "card")}`;
	canvas.deleteCards([card]);
	return "deleted card";
}

/** Connect the card under the start of the stroke to the card under its end. */
function line(canvas: CanvasAdapter, points: Pt[]): string {
	const from = canvas.cardAt(points[0]);
	const to = canvas.cardAt(points[points.length - 1]);
	if (!from || !to || from === to) return "connect: start and end on two different cards";
	canvas.connect(from, to);
	return "connected cards";
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
