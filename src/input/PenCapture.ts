// Claims Apple Pencil input on Canvas views and turns it into strokes.
//
// iPadOS WebKit reports one pen contact three ways: pointer events, touch
// events (touchType "stylus"), and compatibility mouse events. The input spike
// (see SPEC.md "Spike findings") showed Canvas reacts to the pen mostly via the
// compatibility mouse events, and that blocking both the pen's pointer and touch
// events is what stops them. Fingers are never touched.
//
// All listeners sit on `window` in the capture phase, so they run before any
// handler Canvas attaches to its own elements.

import { Plugin } from "obsidian";
import { describe } from "../util/dom";
import { PenPoint, PenStroke, classify } from "./strokes";

export interface PenCaptureHandlers {
	strokeStart(point: PenPoint): void;
	strokeMove(points: PenPoint[]): void;
	strokeEnd(stroke: PenStroke): void;
	strokeCancel(): void;
	hover(x: number, y: number): void;
	hoverEnd(): void;
	log(line: string): void;
}

// Belt and braces: swallow any compatibility mouse events on the canvas that
// still arrive this soon after a pen stroke, unless a finger has touched down since.
const MOUSE_SUPPRESS_MS = 300;
// Hover normally ends with a pointerout as the pen leaves range; this timeout
// is the fallback if that never arrives.
const HOVER_TIMEOUT_MS = 1500;

// Where the pen is claimed: the Canvas surface inside a Canvas view.
const CANVAS_SURFACE = '.workspace-leaf-content[data-type="canvas"] .canvas-wrapper';
// Inside the surface, the pen keeps its normal behavior on Canvas's own
// controls and on anything being edited (Scribble handles those natively).
const PASS_THROUGH = [
	".canvas-controls",
	".canvas-card-menu",
	".canvas-menu",
	"button",
	".clickable-icon",
	".canvas-node.is-editing",
	'[contenteditable="true"]',
	"input",
	"textarea",
].join(", ");

export class PenCapture {
	private active: { pointerId: number; points: PenPoint[]; target: Element } | null = null;
	private stylusTouchIds = new Set<number>();
	private suppressMouseUntil = 0;
	private hovering = false;
	private hoverTimer: number | null = null;

	constructor(private h: PenCaptureHandlers, private enabled: () => boolean) {}

	register(plugin: Plugin): void {
		const cap = { capture: true, passive: false };
		plugin.registerDomEvent(window, "pointerdown", this.onPointerDown, cap);
		plugin.registerDomEvent(window, "pointermove", this.onPointerMove, cap);
		plugin.registerDomEvent(window, "pointerup", this.onPointerEnd, cap);
		plugin.registerDomEvent(window, "pointercancel", this.onPointerEnd, cap);
		plugin.registerDomEvent(window, "pointerout", this.onPointerOut, cap);
		plugin.registerDomEvent(window, "touchstart", this.onTouchStart, cap);
		plugin.registerDomEvent(window, "touchmove", this.onTouchOther, cap);
		plugin.registerDomEvent(window, "touchend", this.onTouchOther, cap);
		plugin.registerDomEvent(window, "touchcancel", this.onTouchOther, cap);
		for (const type of ["mousedown", "mouseup", "click", "dblclick", "contextmenu"] as const) {
			plugin.registerDomEvent(window, type, this.onMouse, cap);
		}
		plugin.register(() => this.clearHoverTimer());
	}

	// ---- pointer events -------------------------------------------------

	private onPointerDown = (e: PointerEvent): void => {
		if (e.pointerType !== "pen") return;
		this.endHover();
		const target = this.claim(e.target, true);
		if (!target) return;

		block(e);
		try {
			target.setPointerCapture(e.pointerId);
		} catch {
			// Not fatal: we still see the events at the window.
		}
		const point = toPoint(e);
		this.active = { pointerId: e.pointerId, points: [point], target };
		this.h.strokeStart(point);
	};

	private onPointerMove = (e: PointerEvent): void => {
		if (e.pointerType !== "pen") return;
		const a = this.active;
		if (a && e.pointerId === a.pointerId) {
			block(e);
			// iPadOS sends one pointermove per Pencil sample, yet each one's coalesced
			// list repeats every sample since the last frame. Keep only samples newer
			// than the last one recorded.
			const coalesced = e.getCoalescedEvents?.() ?? [];
			const samples = coalesced.length > 0 ? coalesced.map(toPoint) : [toPoint(e)];
			const lastT = a.points[a.points.length - 1].t;
			const points = samples.filter((p) => p.t > lastT);
			if (points.length === 0) return;
			a.points.push(...points);
			this.h.strokeMove(points);
			return;
		}
		// Pen moving without contact = hover (Pencil Pro / Pencil 2 on M2+ iPads).
		if (e.buttons === 0 && this.claim(e.target, false)) this.hover(e.clientX, e.clientY);
	};

	private onPointerEnd = (e: PointerEvent): void => {
		const a = this.active;
		if (e.pointerType !== "pen" || !a || e.pointerId !== a.pointerId) return;
		block(e);
		this.active = null;
		this.suppressMouseUntil = performance.now() + MOUSE_SUPPRESS_MS;

		if (e.type === "pointercancel") {
			this.h.log(`stroke cancelled by the system after ${a.points.length} points`);
			this.h.strokeCancel();
			return;
		}
		// Always keep the lift point, even at the same spot: its time is what
		// makes a press-and-hold a stroke rather than a tap.
		a.points.push(toPoint(e));
		this.h.strokeEnd({ kind: classify(a.points), points: a.points, target: a.target });
	};

	private onPointerOut = (e: PointerEvent): void => {
		// relatedTarget null = the pointer left the page entirely (out of hover range).
		if (e.pointerType === "pen" && e.relatedTarget === null && this.hovering) this.endHover();
	};

	// ---- touch and compatibility mouse events ----------------------------

	private onTouchStart = (e: TouchEvent): void => {
		const stylus = Array.from(e.changedTouches).filter(isStylus);
		if (stylus.length === 0) {
			// A finger: never block it, and stop swallowing mouse events so its click lands.
			this.suppressMouseUntil = 0;
			return;
		}
		if (!this.claim(e.target, false)) return;
		for (const t of stylus) this.stylusTouchIds.add(t.identifier);
		block(e);
	};

	private onTouchOther = (e: TouchEvent): void => {
		const ours = Array.from(e.changedTouches).filter((t) => this.stylusTouchIds.has(t.identifier));
		if (ours.length === 0) return;
		block(e);
		if (e.type !== "touchmove") for (const t of ours) this.stylusTouchIds.delete(t.identifier);
	};

	private onMouse = (e: MouseEvent): void => {
		if (!(e.target instanceof Element) || !e.target.closest(CANVAS_SURFACE)) return;
		if (this.active || performance.now() < this.suppressMouseUntil) block(e);
	};

	// ---- hover -------------------------------------------------------------

	private hover(x: number, y: number): void {
		this.hovering = true;
		this.h.hover(x, y);
		this.clearHoverTimer();
		this.hoverTimer = window.setTimeout(() => this.endHover(), HOVER_TIMEOUT_MS);
	}

	private endHover(): void {
		this.clearHoverTimer();
		if (!this.hovering) return;
		this.hovering = false;
		this.h.hoverEnd();
	}

	private clearHoverTimer(): void {
		if (this.hoverTimer !== null) window.clearTimeout(this.hoverTimer);
		this.hoverTimer = null;
	}

	// ---- helpers -----------------------------------------------------------

	/** The target element if the pen should be claimed there, else null. */
	private claim(target: EventTarget | null, logPassThrough: boolean): Element | null {
		if (!this.enabled() || !(target instanceof Element)) return null;
		if (!target.closest(CANVAS_SURFACE)) return null;
		if (target.closest(PASS_THROUGH)) {
			if (logPassThrough) this.h.log(`pen on ${describe(target)}: passed through`);
			return null;
		}
		return target;
	}
}

function toPoint(e: PointerEvent): PenPoint {
	return { x: e.clientX, y: e.clientY, t: e.timeStamp, p: e.pressure };
}

function block(e: Event): void {
	if (e.cancelable) e.preventDefault();
	e.stopImmediatePropagation();
}

function isStylus(t: Touch): boolean {
	return (t as Touch & { touchType?: string }).touchType === "stylus";
}
