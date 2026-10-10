// Shared test fixtures: a fake Canvas view DOM, synthetic Pencil/finger
// events, a recording 2D context, and manual animation frames.

import { vi } from "vitest";
import { PenPoint, PenStroke } from "../src/input/strokes";

export function pt(x: number, y: number, t: number, p = 0.5): PenPoint {
	return { x, y, t, p };
}

export function stroke(points: PenPoint[], kind: PenStroke["kind"] = "stroke"): PenStroke {
	return { kind, points, target: document.body };
}

/** A Canvas view: a card, the zoom controls, and an empty area. */
export function canvasView() {
	const leaf = document.body.createDiv({ cls: "workspace-leaf-content" });
	leaf.setAttribute("data-type", "canvas");
	const wrapper = leaf.createDiv({ cls: "canvas-wrapper" });
	const node = wrapper.createDiv({ cls: "canvas-node" });
	const card = node.createDiv({ cls: "canvas-node-content-blocker" });
	const controls = wrapper.createDiv({ cls: "canvas-controls" });
	const zoomButton = controls.createDiv({ cls: "clickable-icon" });
	const outside = document.body.createDiv({ cls: "sidebar" });
	return { leaf, wrapper, node, card, zoomButton, outside };
}

interface PenInit {
	x?: number;
	y?: number;
	t?: number;
	p?: number;
	id?: number;
	buttons?: number;
	type?: string; // pointerType
	cancelable?: boolean;
	coalesced?: { clientX: number; clientY: number; timeStamp: number; pressure: number }[] | null;
	relatedTarget?: EventTarget | null;
}

/** Dispatch a pointer event at `target`; returns the event. */
export function pointer(target: EventTarget, type: string, init: PenInit = {}): PointerEvent {
	const e = new PointerEvent(type, {
		pointerType: init.type ?? "pen",
		pointerId: init.id ?? 1,
		clientX: init.x ?? 0,
		clientY: init.y ?? 0,
		pressure: init.p ?? 0.5,
		buttons: init.buttons ?? (type === "pointermove" ? 1 : 0),
		relatedTarget: init.relatedTarget ?? null,
		bubbles: true,
		cancelable: init.cancelable ?? true,
	});
	Object.defineProperty(e, "timeStamp", { value: init.t ?? 0 });
	if (init.coalesced !== undefined) {
		Object.defineProperty(e, "getCoalescedEvents", {
			value: init.coalesced === null ? undefined : () => init.coalesced,
		});
	}
	target.dispatchEvent(e);
	return e;
}

/** Dispatch a touch event whose changed touches are stylus or finger contacts. */
export function touch(target: EventTarget, type: string, touches: { id: number; stylus: boolean }[]): TouchEvent {
	const changed = touches.map((t) => ({ identifier: t.id, touchType: t.stylus ? "stylus" : "direct" }));
	const e = new TouchEvent(type, {
		changedTouches: changed as unknown as Touch[],
		bubbles: true,
		cancelable: true,
	});
	target.dispatchEvent(e);
	return e;
}

export function mouse(target: EventTarget, type: string): MouseEvent {
	const e = new MouseEvent(type, { bubbles: true, cancelable: true });
	target.dispatchEvent(e);
	return e;
}

/** Records what reached a target after the plugin's window listeners ran. */
export function spyOn(target: EventTarget, types: string[]): string[] {
	const seen: string[] = [];
	for (const type of types) target.addEventListener(type, () => seen.push(type));
	return seen;
}

/** Replace requestAnimationFrame with a queue the test flushes explicitly. */
export function manualFrames() {
	let queue: FrameRequestCallback[] = [];
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
		queue.push(cb);
		return queue.length;
	});
	return {
		get pending() {
			return queue.length;
		},
		flush() {
			const run = queue;
			queue = [];
			for (const cb of run) cb(performance.now());
		},
	};
}

/** Control performance.now(). */
export function clock(start = 1000) {
	let now = start;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	return {
		get now() {
			return now;
		},
		set(t: number) {
			now = t;
		},
		advance(ms: number) {
			now += ms;
		},
	};
}

export interface DrawCall {
	op: string;
	args: unknown[];
	alpha: number;
	lineWidth: number;
	style: string;
}

/** A 2D context that records drawing calls along with the state at each call. */
export function fakeContext() {
	const calls: DrawCall[] = [];
	const ctx: Record<string, unknown> = {
		globalAlpha: 1,
		lineWidth: 1,
		strokeStyle: "",
		fillStyle: "",
		lineCap: "butt",
		lineJoin: "miter",
	};
	for (const op of ["setTransform", "clearRect", "beginPath", "arc", "fill", "moveTo", "lineTo", "stroke"]) {
		ctx[op] = (...args: unknown[]) =>
			calls.push({
				op,
				args,
				alpha: ctx.globalAlpha as number,
				lineWidth: ctx.lineWidth as number,
				style: (op === "fill" ? ctx.fillStyle : ctx.strokeStyle) as string,
			});
	}
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
	return {
		calls,
		ops: (op: string) => calls.filter((c) => c.op === op),
		reset: () => calls.splice(0),
	};
}
