// Dev tool: writes a report of the undocumented Canvas internals available in
// the running Obsidian (methods, properties, and source excerpts of the ones a
// CanvasAdapter might need) into the vault, so the adapter is built only on
// what actually exists. Works on desktop and iPad.

import { App, Platform, apiVersion, normalizePath } from "obsidian";

const LOG_FOLDER = "pen-glyphs-logs";
// Methods whose source is worth excerpting: likely adapter building blocks.
const INTERESTING =
	/creat|remov|delet|select|deselect|edge|node|histor|undo|redo|pos|zoom|save|data|import|export|focus|edit|bbox|client|request|add|menu/i;
const SOURCE_CHARS = 240;
const DATA_CHARS = 1500;

/** One line per property and method of `obj` and its prototype chain (stopping at Object.prototype). */
export function describeObject(obj: object): string[] {
	const lines: string[] = [];
	const seen = new Set<string>();
	let level: object | null = obj;
	let depth = 0;
	while (level && level !== Object.prototype) {
		const name = depth === 0 ? "own" : `prototype ${depth} (${level.constructor?.name || "anonymous"})`;
		lines.push(`  -- ${name}`);
		for (const key of Object.getOwnPropertyNames(level).sort()) {
			if (key === "constructor" || seen.has(key)) continue;
			seen.add(key);
			lines.push(`  ${key}: ${describeValue(obj, level, key)}`);
		}
		level = Object.getPrototypeOf(level);
		depth++;
	}
	return lines;
}

function describeValue(obj: object, level: object, key: string): string {
	const desc = Object.getOwnPropertyDescriptor(level, key)!;
	if (desc.get || desc.set) return `accessor${desc.get ? " get" : ""}${desc.set ? " set" : ""}`;
	const value: unknown = desc.value ?? (obj as Record<string, unknown>)[key];
	if (typeof value === "function") {
		const fn = value as (...args: unknown[]) => unknown;
		const head = `function/${fn.length}`;
		if (!INTERESTING.test(key)) return head;
		return `${head}  ${Function.prototype.toString.call(fn).replace(/\s+/g, " ").slice(0, SOURCE_CHARS)}`;
	}
	return preview(value);
}

export function preview(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return `Array(${value.length})`;
	if (value instanceof Map) return `Map(${value.size})`;
	if (value instanceof Set) return `Set(${value.size})`;
	if (value instanceof Element) return `<${value.tagName.toLowerCase()} class="${value.className}">`;
	if (typeof value === "object") return `object ${(value as object).constructor?.name ?? "(no prototype)"}`;
	if (typeof value === "string") return JSON.stringify(value.slice(0, 60));
	return `${typeof value} ${String(value)}`;
}

/** The canvas of the most recently active Canvas view (or the first one), if any. */
function activeCanvas(app: App): Record<string, any> | undefined {
	const leaves = app.workspace.getLeavesOfType("canvas");
	const active = app.workspace.getMostRecentLeaf();
	const leaf = leaves.find((l) => l === active) ?? leaves[0];
	return (leaf?.view as unknown as { canvas?: Record<string, any> } | undefined)?.canvas;
}

/** Build the report for the active (or first) Canvas view, or null if none is open. */
export function canvasReport(app: App): string | null {
	const canvas = activeCanvas(app);
	if (!canvas) return null;

	const out: string[] = [
		`# Canvas internals`,
		``,
		`- Obsidian API ${apiVersion}; isIosApp=${Platform.isIosApp} isTablet=${Platform.isTablet}`,
		``,
		"```",
		`== canvas`,
		...describeObject(canvas),
	];
	const nodes = canvas.nodes instanceof Map ? [...canvas.nodes.values()] : [];
	const edges = canvas.edges instanceof Map ? [...canvas.edges.values()] : [];
	out.push(`== first node (of ${nodes.length})`, ...(nodes[0] ? describeObject(nodes[0]) : ["  (none: add a card)"]));
	out.push(`== first edge (of ${edges.length})`, ...(edges[0] ? describeObject(edges[0]) : ["  (none: connect two cards)"]));
	if (typeof canvas.getData === "function") {
		out.push(`== getData()`, JSON.stringify((canvas.getData as () => unknown)()).slice(0, DATA_CHARS));
	}
	out.push("```", "");
	return out.join("\n");
}

/** Write the report into the vault; returns its path, or null if no canvas is open. */
export async function saveCanvasReport(app: App): Promise<string | null> {
	const report = canvasReport(app);
	if (report === null) return null;
	const vault = app.vault;
	if (!vault.getAbstractFileByPath(LOG_FOLDER)) await vault.createFolder(LOG_FOLDER);
	const stamp = window.moment().format("YYYY-MM-DD HH-mm-ss");
	const path = normalizePath(`${LOG_FOLDER}/canvas-api ${stamp}.md`);
	await vault.create(path, report);
	return path;
}

// ---- behavior probe ---------------------------------------------------------

type AnyCanvas = Record<string, any>;

const PROBE_SOURCE_CHARS = 2500;
const PROBE_TEXT = "pen-glyphs probe";

function fullSource(fn: unknown): string {
	return typeof fn === "function" ? Function.prototype.toString.call(fn).slice(0, PROBE_SOURCE_CHARS) : "(missing)";
}

/** Wait a couple of frames so deferred work (e.g. opening an editor) can happen. */
function settle(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Try the operations the adapter needs on a live canvas and report what
 * happened, removing everything it creates. Nothing is saved and no undo
 * history is pushed (save: false, and no requestSave()).
 */
export async function probeCanvas(canvas: AnyCanvas, waitMs = 300): Promise<string[]> {
	const lines: string[] = [];
	for (const name of [
		"createTextNode",
		"importData",
		"removeNode",
		"removeEdge",
		"requestSave",
		"hitTestNode",
		"getSelectionData",
		"cloneData",
		"onDoubleClick",
	]) {
		lines.push(`== source: canvas.${name}`, fullSource(canvas[name]));
	}
	const nodes: AnyCanvas[] = canvas.nodes instanceof Map ? [...canvas.nodes.values()] : [];
	if (nodes[0]) {
		for (const name of ["moveAndResize", "moveTo", "startEditing"]) {
			lines.push(`== source: node.${name}`, fullSource(nodes[0][name]));
		}
	}

	lines.push("== experiments");
	const size = { width: 100, height: 60 };
	const pos = { x: 1000, y: 1000 };
	const quiet = canvas.createTextNode({ pos, size, text: PROBE_TEXT, focus: false, save: false });
	lines.push(
		`createTextNode(pos 1000,1000, size 100x60, focus false) -> x=${quiet.x} y=${quiet.y} w=${quiet.width} h=${quiet.height} editing=${quiet.isEditing}`,
	);
	canvas.removeNode(quiet);

	const focused = canvas.createTextNode({ pos, size, text: "", save: false });
	const editingNow = focused.isEditing;
	await settle(waitMs);
	lines.push(`createTextNode(focus default) -> editing immediately=${editingNow}, after ${waitMs}ms=${focused.isEditing}`);
	canvas.removeNode(focused);

	lines.push(`config.defaultTextNodeDimensions = ${JSON.stringify(canvas.config?.defaultTextNodeDimensions)}`);
	for (const position of [undefined, "center"]) {
		const card = canvas.createTextNode({ pos, position, text: PROBE_TEXT, focus: false, save: false });
		lines.push(
			`createTextNode(pos 1000,1000, no size, position ${position}) -> x=${card.x} y=${card.y} w=${card.width} h=${card.height}`,
		);
		canvas.removeNode(card);
	}

	if (nodes.length >= 2) {
		const id = "pen-glyphs-probe-edge";
		const before = canvas.edges.size;
		const data = canvas.getData();
		const edge = { id, fromNode: nodes[0].id, fromSide: "right", toNode: nodes[1].id, toSide: "left", toEnd: "arrow" };
		canvas.importData({ ...data, edges: [...data.edges, edge] });
		const added = canvas.edges.get(id);
		lines.push(
			`importData(+1 edge) -> edges ${before} -> ${canvas.edges.size}, probe edge present=${!!added}, nodes still ${canvas.nodes.size}`,
		);
		if (added) canvas.removeEdge(added);
	} else {
		lines.push("importData edge experiment skipped: needs two cards");
	}

	if (nodes.length >= 2 && typeof canvas.getSelectionData === "function" && typeof canvas.cloneData === "function") {
		const copied = canvas.getSelectionData(new Set([nodes[0], nodes[1]]));
		lines.push(
			`getSelectionData(2 cards) -> nodes ${copied.nodes.length}, edges ${copied.edges?.length}, keys ${Object.keys(copied).join(",")}`,
		);
		const originalIds = (copied.nodes as { id: string }[]).map((n) => n.id).join(",");
		const firstX = copied.nodes[0]?.x;
		const firstY = copied.nodes[0]?.y;
		const returned = canvas.cloneData(copied, { x: 0, y: 5000 });
		const cloned = returned ?? copied;
		lines.push(
			`cloneData(data, offset 0,5000) -> returns ${returned === undefined ? "undefined (mutates in place)" : returned === copied ? "the same object" : "a new object"}; ` +
				`ids changed=${(cloned.nodes as { id: string }[]).map((n) => n.id).join(",") !== originalIds}, x ${firstX} -> ${cloned.nodes[0]?.x}, y ${firstY} -> ${cloned.nodes[0]?.y}`,
		);
		const before = canvas.nodes.size;
		canvas.importData(cloned);
		const pasted = (cloned.nodes as { id: string }[]).map((n) => canvas.nodes.get(n.id)).filter(Boolean);
		lines.push(`importData(clone) -> nodes ${before} -> ${canvas.nodes.size}, pasted found ${pasted.length}`);
		for (const node of pasted) canvas.removeNode(node);
	} else {
		lines.push("copy/paste experiment skipped: needs two cards, getSelectionData and cloneData");
	}
	canvas.requestFrame?.();
	return lines;
}

/** Run the probe on the active canvas and write the results into the vault. */
export async function saveCanvasProbe(app: App): Promise<string | null> {
	const canvas = activeCanvas(app);
	if (!canvas) return null;
	const lines = await probeCanvas(canvas);
	const vault = app.vault;
	if (!vault.getAbstractFileByPath(LOG_FOLDER)) await vault.createFolder(LOG_FOLDER);
	const stamp = window.moment().format("YYYY-MM-DD HH-mm-ss");
	const path = normalizePath(`${LOG_FOLDER}/canvas-probe ${stamp}.md`);
	await vault.create(path, ["# Canvas probe", "", "```", ...lines, "```", ""].join("\n"));
	return path;
}
