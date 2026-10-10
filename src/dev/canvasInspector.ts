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

/** Build the report for the active (or first) Canvas view, or null if none is open. */
export function canvasReport(app: App): string | null {
	const leaves = app.workspace.getLeavesOfType("canvas");
	const active = app.workspace.getMostRecentLeaf();
	const leaf = leaves.find((l) => l === active) ?? leaves[0];
	const canvas = (leaf?.view as unknown as { canvas?: Record<string, unknown> } | undefined)?.canvas;
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
