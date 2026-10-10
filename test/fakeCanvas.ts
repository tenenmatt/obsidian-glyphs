// A stand-in for Obsidian's Canvas internals, behaving the way the probe
// measured on Obsidian 1.14.4: cards are placed by their top-left corner,
// focus opens the editor, importData without `clear` only adds, requestSave
// records history, getSelectionData returns the cards, the edges among them
// and their center, and cloneData re-ids and offsets its argument in place.

import { CanvasInternals, CanvasNode, Point, Rect, SelectionData } from "../src/targets/CanvasAdapter";

export interface FakeCard extends CanvasNode {
	text: string;
	editing: boolean;
}

export interface FakeEdge {
	id: string;
	fromNode: string;
	toNode: string;
	fromSide?: string;
	toSide?: string;
	toEnd?: string;
}

export class FakeCanvas implements CanvasInternals {
	nodes = new Map<string, FakeCard>();
	edges: FakeEdge[] = [];
	selection = new Set<unknown>();
	saves = 0;
	/** Client → canvas: canvas = (client - offset) / scale. */
	offset = { x: 0, y: 0 };
	scale = 1;
	private nextId = 1;

	addCard(x: number, y: number, width = 100, height = 60): FakeCard {
		const card = { id: `card${this.nextId++}`, x, y, width, height, text: "", editing: false };
		this.nodes.set(card.id, card);
		return card;
	}

	posFromClient(p: Point): Point {
		return { x: (p.x - this.offset.x) / this.scale, y: (p.y - this.offset.y) / this.scale };
	}

	hitTestNode(p: Point): CanvasNode | null {
		const hits = [...this.nodes.values()].filter((n) => p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height);
		return hits[hits.length - 1] ?? null; // last added is on top
	}

	getIntersectingNodes(box: Rect): CanvasNode[] {
		return [...this.nodes.values()].filter(
			(n) => n.x <= box.maxX && n.x + n.width >= box.minX && n.y <= box.maxY && n.y + n.height >= box.minY,
		);
	}

	selectOnly(item: unknown): void {
		this.selection = new Set([item]);
	}

	selectAll(items?: Iterable<unknown>): void {
		this.selection = new Set(items ?? this.nodes.values());
	}

	deselectAll(): void {
		this.selection = new Set();
	}

	removeNode(node: CanvasNode): void {
		this.nodes.delete(node.id);
		this.selection.delete(node);
		this.edges = this.edges.filter((e) => e.fromNode !== node.id && e.toNode !== node.id);
	}

	deleteSelection(): void {
		for (const item of [...this.selection]) {
			const id = (item as CanvasNode | null)?.id;
			if (id !== undefined && this.nodes.get(id) === item) this.removeNode(item as CanvasNode);
		}
		this.deselectAll();
		this.requestSave();
	}

	requestSave(): void {
		this.saves++;
	}

	createTextNode(o: {
		pos: Point;
		size: { width: number; height: number };
		text?: string;
		focus?: boolean;
		save?: boolean;
	}): CanvasNode {
		const card = this.addCard(o.pos.x, o.pos.y, o.size.width, o.size.height);
		card.text = o.text ?? "";
		if (o.save !== false) this.requestSave();
		if (o.focus !== false) {
			this.selectOnly(card);
			card.editing = true;
		}
		return card;
	}

	importData(data: { nodes: unknown[]; edges: unknown[] }, clear?: boolean): unknown {
		if (clear) throw new Error("the adapter must never clear");
		for (const n of data.nodes as FakeCard[]) {
			if (!this.nodes.has(n.id)) this.nodes.set(n.id, { ...n, editing: false });
		}
		this.edges.push(...(data.edges as FakeEdge[]));
		return undefined;
	}

	getSelectionData(items: Set<unknown>): SelectionData {
		const cards = [...items].filter((i): i is FakeCard => this.nodes.get((i as FakeCard).id) === i);
		const ids = new Set(cards.map((c) => c.id));
		const minX = Math.min(...cards.map((c) => c.x));
		const minY = Math.min(...cards.map((c) => c.y));
		const maxX = Math.max(...cards.map((c) => c.x + c.width));
		const maxY = Math.max(...cards.map((c) => c.y + c.height));
		return {
			nodes: cards.map((c) => ({ ...c })),
			edges: this.edges.filter((e) => ids.has(e.fromNode) && ids.has(e.toNode)).map((e) => ({ ...e })),
			center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
		};
	}

	cloneData(data: SelectionData, offset: Point): SelectionData {
		const remap: Record<string, string> = {};
		for (const n of data.nodes) {
			const id = `card${this.nextId++}`;
			remap[n.id] = id;
			n.id = id;
			n.x += offset.x;
			n.y += offset.y;
		}
		for (const e of data.edges) {
			e.fromNode = remap[e.fromNode] ?? "";
			e.toNode = remap[e.toNode] ?? "";
			e.id = `edge${this.nextId++}`;
		}
		return data;
	}
}
