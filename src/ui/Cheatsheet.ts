// A modal listing every glyph: a drawing of it, what to draw it over, and the
// command it runs (named as in the flash notices). x, caret and v are drawn
// from the author's own templates.

import { App, Modal } from "obsidian";
import { Pt } from "../recognize/features";
import { Template } from "../recognize/pdollar";

export interface CheatsheetEntry {
	glyph: string;
	/** A path to draw, or "dot" for a tap. */
	drawing: Pt[] | "dot";
	over: string;
	does: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const ICON_PX = 56;

/** Every glyph, in the order a newcomer would want them. */
export function cheatsheetEntries(templates: Template[]): CheatsheetEntry[] {
	const fromTemplate = (name: string): Pt[] => templates.find((t) => t.name === name)?.points ?? [];
	return [
		{ glyph: "lasso", drawing: ellipse(), over: "around cards", does: "select them (around nothing: clear selection)" },
		{ glyph: "x", drawing: fromTemplate("x"), over: "a card", does: "delete card (if it's selected: the whole selection)" },
		{ glyph: "square", drawing: square(), over: "empty space", does: "new card, open for editing" },
		{ glyph: "line", drawing: [{ x: 0, y: 1 }, { x: 1, y: 0 }], over: "from one card to another", does: "connect, with an arrow at the second" },
		{ glyph: "tap", drawing: "dot", over: "a card / empty canvas", does: "select card / clear selection" },
		{ glyph: "caret", drawing: fromTemplate("caret"), over: "a card or selection", does: "copy card (if it's selected: the whole selection)" },
		{ glyph: "v", drawing: fromTemplate("v"), over: "where to paste", does: "paste, centered on the v's point" },
	];
}

export class CheatsheetModal extends Modal {
	constructor(app: App, private entries: CheatsheetEntry[]) {
		super(app);
	}

	override onOpen(): void {
		this.setTitle("Pen glyphs");
		const list = this.contentEl.createDiv({ cls: "pen-glyphs-cheatsheet" });
		for (const entry of this.entries) {
			const row = list.createDiv({ cls: "pen-glyphs-cheatsheet-row" });
			row.appendChild(drawIcon(entry.drawing));
			const text = row.createDiv({ cls: "pen-glyphs-cheatsheet-text" });
			text.createDiv({ cls: "pen-glyphs-cheatsheet-name", text: `${entry.glyph} · ${entry.over}` });
			text.createDiv({ cls: "pen-glyphs-cheatsheet-does", text: entry.does });
		}
	}

	override onClose(): void {
		this.contentEl.empty();
	}
}

/** An SVG icon of a glyph, scaled to fit with its aspect ratio kept. */
export function drawIcon(drawing: Pt[] | "dot"): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, "svg");
	svg.setAttribute("viewBox", `0 0 ${ICON_PX} ${ICON_PX}`);
	svg.setAttribute("width", String(ICON_PX));
	svg.setAttribute("height", String(ICON_PX));
	svg.classList.add("pen-glyphs-cheatsheet-icon");
	if (drawing === "dot") {
		const dot = document.createElementNS(SVG_NS, "circle");
		dot.setAttribute("cx", String(ICON_PX / 2));
		dot.setAttribute("cy", String(ICON_PX / 2));
		dot.setAttribute("r", "5");
		svg.appendChild(dot);
		return svg;
	}
	const line = document.createElementNS(SVG_NS, "polyline");
	line.setAttribute("points", fitPoints(drawing, ICON_PX, 8));
	svg.appendChild(line);
	return svg;
}

/** "x,y x,y ..." for points scaled into a `size` square with `pad` margin, centered. */
export function fitPoints(points: Pt[], size: number, pad: number): string {
	if (points.length === 0) return "";
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	const w = Math.max(...xs) - minX;
	const h = Math.max(...ys) - minY;
	const scale = (size - 2 * pad) / (Math.max(w, h) || 1);
	const ox = (size - w * scale) / 2;
	const oy = (size - h * scale) / 2;
	return points.map((p) => `${round(ox + (p.x - minX) * scale)},${round(oy + (p.y - minY) * scale)}`).join(" ");
}

function round(n: number): number {
	return Math.round(n * 10) / 10;
}

/** A slightly overshooting loop, like a real lasso. */
function ellipse(): Pt[] {
	const n = 40;
	return Array.from({ length: n + 4 }, (_, i) => {
		const a = (Math.PI * 2 * i) / n;
		return { x: Math.cos(a) * 1.3, y: Math.sin(a) };
	});
}

function square(): Pt[] {
	return [
		{ x: 0, y: 0 },
		{ x: 1, y: 0 },
		{ x: 1, y: 1 },
		{ x: 0, y: 1 },
		{ x: 0, y: 0.05 },
	];
}
