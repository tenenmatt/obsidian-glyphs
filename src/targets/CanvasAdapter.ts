// The only module that touches Obsidian Canvas internals, which are
// undocumented. Everything here was confirmed against Obsidian 1.14.4 with the
// "Inspect canvas internals" and "Probe canvas behavior" dev commands (see
// SPEC.md "Canvas internals"). If Obsidian changes them, CanvasAdapter.from()
// reports which methods are missing instead of failing mid-command.

import { App } from "obsidian";

export interface Point {
	x: number;
	y: number;
}

export interface Rect {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

export type Side = "top" | "right" | "bottom" | "left";

/** A card. Position is its top-left corner, in canvas coordinates. */
export interface CanvasNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Cards (and the connections among them) as Canvas serializes them for copy/paste. */
export interface SelectionData {
	nodes: { id: string; x: number; y: number }[];
	edges: { id: string; fromNode: string; toNode: string }[];
	/** Center of the copied cards' bounding box. */
	center: Point;
}

export interface CanvasInternals {
	nodes: Map<string, CanvasNode>;
	/** `defaultTextNodeDimensions` is the size of a card made by double-tapping. */
	config?: { defaultTextNodeDimensions?: { width: number; height: number } };
	selection: Set<unknown>;
	posFromClient(p: Point): Point;
	hitTestNode(p: Point, padding?: number): CanvasNode | null;
	getIntersectingNodes(box: Rect): CanvasNode[];
	selectOnly(item: unknown): void;
	selectAll(items?: Iterable<unknown>): void;
	deselectAll(): void;
	removeNode(node: CanvasNode): void;
	deleteSelection(): void;
	requestSave(): void;
	createTextNode(options: {
		pos: Point;
		size: { width: number; height: number };
		text?: string;
		focus?: boolean;
		save?: boolean;
	}): CanvasNode;
	importData(data: { nodes: unknown[]; edges: unknown[] }, clear?: boolean): unknown;
	getSelectionData(items: Set<unknown>): SelectionData;
	cloneData(data: SelectionData, offset: Point): SelectionData;
}

const REQUIRED_METHODS = [
	"posFromClient",
	"hitTestNode",
	"getIntersectingNodes",
	"selectOnly",
	"selectAll",
	"deselectAll",
	"removeNode",
	"deleteSelection",
	"requestSave",
	"createTextNode",
	"importData",
	"getSelectionData",
	"cloneData",
] as const;

// Smallest card a square creates, in canvas units.
export const MIN_CARD = { width: 120, height: 60 };

// Canvas's double-tap card size, used if its config doesn't give one.
export const DEFAULT_TEXT_CARD = { width: 250, height: 60 };

export class CanvasAdapter {
	private constructor(private canvas: CanvasInternals) {}

	/** Wrap a canvas view's internals, or explain what's missing. */
	static from(view: unknown): CanvasAdapter | { missing: string[] } {
		const canvas = (view as { canvas?: Record<string, unknown> } | null)?.canvas;
		if (!canvas) return { missing: ["view.canvas"] };
		const missing: string[] = REQUIRED_METHODS.filter((m) => typeof canvas[m] !== "function");
		if (!(canvas.nodes instanceof Map)) missing.push("nodes");
		if (!(canvas.selection instanceof Set)) missing.push("selection");
		return missing.length ? { missing } : new CanvasAdapter(canvas as unknown as CanvasInternals);
	}

	toCanvas(client: Point): Point {
		return this.canvas.posFromClient(client);
	}

	/** The topmost card at a canvas point. */
	cardAt(p: Point): CanvasNode | null {
		return this.canvas.hitTestNode(p);
	}

	cardsOverlapping(box: Rect): CanvasNode[] {
		return this.canvas.getIntersectingNodes(box);
	}

	isSelected(card: CanvasNode): boolean {
		return this.canvas.selection.has(card);
	}

	select(cards: CanvasNode[]): void {
		if (cards.length === 1) this.canvas.selectOnly(cards[0]);
		else this.canvas.selectAll(cards);
	}

	clearSelection(): void {
		this.canvas.deselectAll();
	}

	/** Delete cards (and their connections). Undoable via Canvas history. */
	deleteCards(cards: CanvasNode[]): void {
		for (const card of cards) this.canvas.removeNode(card);
		this.canvas.requestSave();
	}

	/** The selected cards (the selection can also hold connections). */
	selectedCards(): CanvasNode[] {
		return [...this.canvas.selection].filter((item): item is CanvasNode => this.isCard(item));
	}

	/** Delete everything selected; returns how many cards that was. Undoable. */
	deleteSelection(): number {
		const cards = this.selectedCards().length;
		this.canvas.deleteSelection();
		return cards;
	}

	/**
	 * Create an empty text card and open it for editing. Undoable. With
	 * `fillBox` the card fills `box`; otherwise it's a standard card (as wide as
	 * a double-tapped card, twice as tall) centered on the box.
	 */
	createCard(box: Rect, fillBox: boolean): CanvasNode {
		let pos: Point;
		let size: { width: number; height: number };
		if (fillBox) {
			pos = { x: box.minX, y: box.minY };
			size = {
				width: Math.max(MIN_CARD.width, box.maxX - box.minX),
				height: Math.max(MIN_CARD.height, box.maxY - box.minY),
			};
		} else {
			const base = this.canvas.config?.defaultTextNodeDimensions ?? DEFAULT_TEXT_CARD;
			size = { width: base.width, height: base.height * 2 };
			pos = { x: (box.minX + box.maxX - size.width) / 2, y: (box.minY + box.maxY - size.height) / 2 };
		}
		return this.canvas.createTextNode({ pos, size, text: "", focus: true });
	}

	/**
	 * Connect two cards with an arrow pointing at `to`, attached to the given
	 * sides; Canvas picks any side left out. Undoable.
	 */
	connect(from: CanvasNode, to: CanvasNode, sides: { fromSide?: Side; toSide?: Side } = {}): void {
		const edge: Record<string, string> = { id: newId(), fromNode: from.id, toNode: to.id, toEnd: "arrow" };
		if (sides.fromSide) edge.fromSide = sides.fromSide;
		if (sides.toSide) edge.toSide = sides.toSide;
		// Without the `clear` flag, importData only adds: it never removes cards or edges.
		this.canvas.importData({ nodes: [], edges: [edge] });
		this.canvas.requestSave();
	}

	/** The cards' data and the connections among them, detached from the canvas. */
	copy(cards: CanvasNode[]): SelectionData {
		return structuredClone(this.canvas.getSelectionData(new Set(cards)));
	}

	/**
	 * Paste copied data centered on `at`, with fresh ids, and select it. The
	 * copy itself is left untouched so it can be pasted again. Undoable.
	 * Returns the number of cards pasted.
	 */
	paste(data: SelectionData, at: Point): number {
		// cloneData edits its argument in place: give it a fresh copy.
		const pasted = this.canvas.cloneData(structuredClone(data), { x: at.x - data.center.x, y: at.y - data.center.y });
		this.canvas.importData({ nodes: pasted.nodes, edges: pasted.edges });
		const cards = pasted.nodes.map((n) => this.canvas.nodes.get(n.id)).filter((c): c is CanvasNode => c !== undefined);
		this.select(cards);
		this.canvas.requestSave();
		return cards.length;
	}

	private isCard(item: unknown): boolean {
		const id = (item as { id?: unknown } | null)?.id;
		return typeof id === "string" && this.canvas.nodes.get(id) === item;
	}
}

/** The Canvas view that contains `el`, if any. */
export function canvasViewFor(app: App, el: Element): unknown {
	const leaf = app.workspace.getLeavesOfType("canvas").find((l) => l.view.containerEl.contains(el));
	return leaf?.view ?? null;
}

/** A 16-hex-digit id, like Canvas's own. */
export function newId(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
}
