// Milestone 1 input spike: observe pen vs finger input on Canvas views, and
// optionally block pen input before Canvas sees it.
//
// All listeners sit on `window` in the capture phase, so they run before any
// handler Canvas attaches to its own elements. Matching bubble-phase listeners
// on `window` tell us, in "off" mode, whether Canvas consumed an event
// (stopped propagation or called preventDefault).
//
// iPadOS WebKit fires pointer events AND touch events (and then compatibility
// mouse events) for the same contact, so blocking one family may not be enough.
// The block modes let us test each family on the device.

import { App, Plugin } from "obsidian";

export type BlockMode = "off" | "pointer" | "touch" | "all";
export const BLOCK_MODES: BlockMode[] = ["off", "pointer", "touch", "all"];

// After a pen stroke ends, compatibility mouse events and click can still
// arrive; in "all" mode we swallow those for this long.
const MOUSE_SUPPRESS_MS = 500;
// Wait this long after pointerup for trailing touch/mouse events before
// writing the stroke summary.
const SUMMARY_DELAY_MS = 400;
// A gap longer than this between pen hover events starts a new hover session.
const HOVER_GAP_MS = 300;

interface CanvasSnapshot {
	x: number;
	y: number;
	zoom: number;
	selected: number;
	nodePosHash: number;
}

interface StrokeRecord {
	id: number;
	pointerId: number;
	start: number;
	end: number | null;
	moves: number;
	coalesced: number;
	pointerBlocked: boolean;
	downBubble: "not reached" | "reached" | "reached, prevented";
	touchStart: "none" | "not reached" | "reached" | "reached, prevented" | "blocked";
	compat: string[];
	before: CanvasSnapshot | null;
	canvasEl: Element;
}

export class PenCapture {
	private stroke: StrokeRecord | null = null;
	private strokeCount = 0;
	private stylusTouchIds = new Set<number>();
	private blockingStylusTouches = false;
	private suppressMouseUntil = 0;
	private lastHover = 0;
	private hoverCount = 0;

	constructor(
		private app: App,
		private log: (line: string) => void,
		private mode: () => BlockMode,
	) {}

	register(plugin: Plugin): void {
		const cap = { capture: true, passive: false };
		const bub = { capture: false, passive: true };
		plugin.registerDomEvent(window, "pointerdown", this.onPointerDown, cap);
		plugin.registerDomEvent(window, "pointermove", this.onPointerMove, cap);
		plugin.registerDomEvent(window, "pointerup", this.onPointerEnd, cap);
		plugin.registerDomEvent(window, "pointercancel", this.onPointerEnd, cap);
		plugin.registerDomEvent(window, "touchstart", this.onTouchStart, cap);
		plugin.registerDomEvent(window, "touchmove", this.onTouchOther, cap);
		plugin.registerDomEvent(window, "touchend", this.onTouchOther, cap);
		plugin.registerDomEvent(window, "touchcancel", this.onTouchOther, cap);
		for (const type of ["mousedown", "mouseup", "click", "dblclick", "contextmenu"] as const) {
			plugin.registerDomEvent(window, type, this.onMouse, cap);
		}

		plugin.registerDomEvent(window, "pointerdown", this.onPointerDownBubble, bub);
		plugin.registerDomEvent(window, "touchstart", this.onTouchStartBubble, bub);
	}

	// ---- pointer events -------------------------------------------------

	private onPointerDown = (e: PointerEvent): void => {
		const canvasEl = this.canvasViewEl(e.target);
		if (!canvasEl) return;

		if (e.pointerType !== "pen") {
			this.log(`ptr down ${e.pointerType} #${e.pointerId} (passes through)`);
			return;
		}

		if (this.isEditingTarget(e.target)) {
			this.log(`ptr down pen in editing node: ignored, Scribble/typing should work`);
			return;
		}

		if (this.hoverCount > 0) {
			this.log(`hover: ${this.hoverCount} events before this stroke`);
			this.hoverCount = 0;
		}

		const mode = this.mode();
		const pointerBlocked = mode === "pointer" || mode === "all";
		const coalescedSupported = typeof e.getCoalescedEvents === "function";
		this.stroke = {
			id: ++this.strokeCount,
			pointerId: e.pointerId,
			start: e.timeStamp,
			end: null,
			moves: 0,
			coalesced: 0,
			pointerBlocked,
			downBubble: "not reached",
			touchStart: "none",
			compat: [],
			before: this.snapshot(canvasEl),
			canvasEl,
		};

		this.log(
			`stroke ${this.stroke.id} ptr down pen #${e.pointerId} mode=${mode}` +
				` p=${e.pressure.toFixed(2)} tilt=${e.tiltX},${e.tiltY}` +
				` alt=${fmt(num(e, "altitudeAngle"))} az=${fmt(num(e, "azimuthAngle"))}` +
				` coalesced=${coalescedSupported ? "yes" : "no"}` +
				` target=${describe(e.target)}`,
		);

		if (pointerBlocked) {
			block(e);
			try {
				(e.target as Element).setPointerCapture(e.pointerId);
			} catch (err) {
				this.log(`setPointerCapture failed: ${String(err)}`);
			}
		}
	};

	private onPointerMove = (e: PointerEvent): void => {
		if (e.pointerType !== "pen") return;
		const s = this.stroke;
		if (s && s.end === null && e.pointerId === s.pointerId) {
			s.moves++;
			s.coalesced += e.getCoalescedEvents?.().length ?? 1;
			if (s.pointerBlocked) block(e);
			return;
		}
		// Pen moving with no stroke in progress = hover (Pencil Pro / Pencil 2 on M2+ iPads).
		if (e.buttons === 0 && this.canvasViewEl(e.target)) {
			if (e.timeStamp - this.lastHover > HOVER_GAP_MS) {
				this.log(
					`hover start (${Math.round(e.clientX)},${Math.round(e.clientY)})` +
						` alt=${fmt(num(e, "altitudeAngle"))} az=${fmt(num(e, "azimuthAngle"))}`,
				);
			}
			this.lastHover = e.timeStamp;
			this.hoverCount++;
		}
	};

	private onPointerEnd = (e: PointerEvent): void => {
		const s = this.stroke;
		if (e.pointerType !== "pen" || !s || s.end !== null || e.pointerId !== s.pointerId) {
			if (e.pointerType === "touch" && this.canvasViewEl(e.target)) {
				this.log(`ptr ${e.type === "pointerup" ? "up" : "cancel"} touch #${e.pointerId}`);
			}
			return;
		}
		s.end = e.timeStamp;
		if (e.type === "pointercancel") s.compat.push("pointercancel!");
		if (s.pointerBlocked) block(e);
		if (this.mode() === "all") this.suppressMouseUntil = performance.now() + MOUSE_SUPPRESS_MS;
		window.setTimeout(() => this.summarize(s), SUMMARY_DELAY_MS);
	};

	private onPointerDownBubble = (e: PointerEvent): void => {
		const s = this.stroke;
		if (e.pointerType === "pen" && s && e.pointerId === s.pointerId && s.end === null) {
			s.downBubble = e.defaultPrevented ? "reached, prevented" : "reached";
		}
	};

	// ---- touch events ----------------------------------------------------

	private onTouchStart = (e: TouchEvent): void => {
		if (!this.canvasViewEl(e.target)) return;
		const stylus = Array.from(e.changedTouches).filter(isStylus);
		const fingers = e.changedTouches.length - stylus.length;

		if (stylus.length === 0) {
			this.log(`touchstart direct x${fingers} (total touches ${e.touches.length})`);
			return;
		}
		for (const t of stylus) this.stylusTouchIds.add(t.identifier);

		const s = this.stroke;
		const t = stylus[0];
		this.log(
			`touchstart stylus force=${fmt(t.force)} alt=${fmt(num(t, "altitudeAngle"))}` +
				` az=${fmt(num(t, "azimuthAngle"))}` +
				(fingers > 0 ? ` + ${fingers} finger(s) in same event!` : "") +
				(s ? ` (${Math.round(e.timeStamp - s.start)}ms after ptr down)` : " (no pointer stroke!)"),
		);

		const mode = this.mode();
		this.blockingStylusTouches =
			(mode === "touch" || mode === "all") && !this.isEditingTarget(e.target);
		if (s) s.touchStart = this.blockingStylusTouches ? "blocked" : "not reached";
		if (this.blockingStylusTouches) block(e);
	};

	private onTouchOther = (e: TouchEvent): void => {
		const stylus = Array.from(e.changedTouches).filter((t) => this.stylusTouchIds.has(t.identifier));
		if (stylus.length === 0) return;
		if (this.blockingStylusTouches) block(e);
		if (e.type !== "touchmove") {
			for (const t of stylus) this.stylusTouchIds.delete(t.identifier);
			if (this.stylusTouchIds.size === 0) this.blockingStylusTouches = false;
		}
	};

	private onTouchStartBubble = (e: TouchEvent): void => {
		const s = this.stroke;
		if (s && s.touchStart === "not reached" && Array.from(e.changedTouches).some(isStylus)) {
			s.touchStart = e.defaultPrevented ? "reached, prevented" : "reached";
		}
	};

	// ---- compatibility mouse events --------------------------------------

	private onMouse = (e: MouseEvent): void => {
		const s = this.stroke;
		const inPenWindow = s !== null && (s.end === null || e.timeStamp - s.end < SUMMARY_DELAY_MS);
		if (inPenWindow) s!.compat.push(e.type);
		if (performance.now() < this.suppressMouseUntil || (this.mode() === "all" && s?.end === null)) {
			block(e);
			if (inPenWindow) s!.compat[s!.compat.length - 1] += "(blocked)";
		}
	};

	// ---- summary ---------------------------------------------------------

	private summarize(s: StrokeRecord): void {
		const ms = Math.round((s.end ?? s.start) - s.start);
		const after = this.snapshot(s.canvasEl);
		const avgCoalesced = s.moves ? (s.coalesced / s.moves).toFixed(1) : "-";
		this.log(
			`stroke ${s.id} summary: ${ms}ms, ${s.moves} moves (coalesced avg ${avgCoalesced})\n` +
				`    ptrdown→window bubble: ${s.pointerBlocked ? "blocked by us" : s.downBubble}\n` +
				`    stylus touchstart: ${s.touchStart}\n` +
				`    mouse compat: ${s.compat.length ? s.compat.join(" ") : "none"}\n` +
				`    canvas effect: ${diffSnapshots(s.before, after)}`,
		);
		if (this.stroke === s) this.stroke = null;
	}

	// ---- helpers ---------------------------------------------------------

	/** The Canvas view content element containing `target`, if any. */
	private canvasViewEl(target: EventTarget | null): Element | null {
		if (!(target instanceof Element)) return null;
		return target.closest('.workspace-leaf-content[data-type="canvas"]');
	}

	private isEditingTarget(target: EventTarget | null): boolean {
		if (!(target instanceof Element)) return false;
		return target.closest('.canvas-node.is-editing, [contenteditable="true"], input, textarea') !== null;
	}

	/**
	 * Undocumented Canvas internals, read-only, so a stroke summary can report
	 * whether the pen panned, zoomed, selected or dragged. Preview of what
	 * CanvasAdapter will own later.
	 */
	private snapshot(canvasEl: Element): CanvasSnapshot | null {
		try {
			const leaf = this.app.workspace
				.getLeavesOfType("canvas")
				.find((l) => l.view.containerEl.contains(canvasEl));
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const canvas = (leaf?.view as any)?.canvas;
			if (!canvas) return null;
			let nodePosHash = 0;
			for (const node of canvas.nodes?.values?.() ?? []) {
				nodePosHash += (node.x ?? 0) * 31 + (node.y ?? 0) * 17;
			}
			return {
				x: canvas.tx ?? canvas.x,
				y: canvas.ty ?? canvas.y,
				zoom: canvas.tZoom ?? canvas.zoom,
				selected: canvas.selection?.size ?? 0,
				nodePosHash,
			};
		} catch {
			return null;
		}
	}
}

function diffSnapshots(a: CanvasSnapshot | null, b: CanvasSnapshot | null): string {
	if (!a || !b) return "unknown (couldn't read canvas internals)";
	const changes: string[] = [];
	if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5) {
		changes.push(`PANNED Δ(${Math.round(b.x - a.x)},${Math.round(b.y - a.y)})`);
	}
	if (Math.abs(a.zoom - b.zoom) > 1e-3) changes.push(`ZOOMED ${fmt(a.zoom)}→${fmt(b.zoom)}`);
	if (a.selected !== b.selected) changes.push(`SELECTION ${a.selected}→${b.selected}`);
	if (Math.abs(a.nodePosHash - b.nodePosHash) > 0.5) changes.push("NODE MOVED");
	return changes.length ? changes.join(", ") : "none";
}

function block(e: Event): void {
	if (e.cancelable) e.preventDefault();
	e.stopImmediatePropagation();
}

function isStylus(t: Touch): boolean {
	return (t as Touch & { touchType?: string }).touchType === "stylus";
}

function num(obj: object, key: string): number | undefined {
	const v = (obj as Record<string, unknown>)[key];
	return typeof v === "number" ? v : undefined;
}

function fmt(v: number | undefined): string {
	return v === undefined ? "n/a" : v.toFixed(2);
}

function describe(target: EventTarget | null): string {
	if (!(target instanceof Element)) return String(target);
	const cls = Array.from(target.classList).slice(0, 3).join(".");
	return target.tagName.toLowerCase() + (cls ? `.${cls}` : "");
}
