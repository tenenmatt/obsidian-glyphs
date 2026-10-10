import { App, Plugin } from "./obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PenCapture, PenCaptureHandlers } from "../src/input/PenCapture";
import { canvasView, clock, mouse, pointer, spyOn, touch } from "./helpers";

function setup(enabled = true) {
	const view = canvasView();
	const h = {
		strokeStart: vi.fn(),
		strokeMove: vi.fn(),
		strokeEnd: vi.fn(),
		strokeCancel: vi.fn(),
		hover: vi.fn(),
		hoverEnd: vi.fn(),
		log: vi.fn(),
	} satisfies PenCaptureHandlers;
	const state = { enabled };
	const plugin = new Plugin(new App(), { id: "pen-glyphs", version: "test" });
	new PenCapture(h, () => state.enabled).register(plugin as never);
	// What Canvas itself would see, below the plugin's window capture listeners.
	const reached = spyOn(view.wrapper, [
		"pointerdown",
		"pointermove",
		"pointerup",
		"pointercancel",
		"touchstart",
		"touchmove",
		"touchend",
		"mousedown",
		"click",
	]);
	return { view, h, state, plugin, reached };
}

let ctx: ReturnType<typeof setup>;
afterEach(() => ctx?.plugin.unload());

describe("claiming the pen", () => {
	beforeEach(() => (ctx = setup()));

	it("claims a pen stroke on the canvas and reports it as a stroke", () => {
		const { view, h, reached } = ctx;
		const down = pointer(view.card, "pointerdown", { x: 10, y: 10, t: 0, p: 0.2 });
		pointer(view.card, "pointermove", { x: 40, y: 10, t: 50 });
		pointer(view.card, "pointerup", { x: 80, y: 10, t: 300 });

		expect(down.defaultPrevented).toBe(true);
		expect(reached).toEqual([]);
		expect(h.strokeStart).toHaveBeenCalledWith({ x: 10, y: 10, t: 0, p: 0.2 });
		expect(h.strokeMove).toHaveBeenCalledWith([{ x: 40, y: 10, t: 50, p: 0.5 }]);
		const stroke = h.strokeEnd.mock.calls[0][0];
		expect(stroke.kind).toBe("stroke");
		expect(stroke.target).toBe(view.card);
		expect(stroke.points.map((p: { x: number }) => p.x)).toEqual([10, 40, 80]);
	});

	it("reports a quick still contact as a tap", () => {
		const { view, h } = ctx;
		pointer(view.wrapper, "pointerdown", { x: 10, y: 10, t: 0 });
		pointer(view.wrapper, "pointerup", { x: 10, y: 10, t: 80 });
		expect(h.strokeEnd.mock.calls[0][0].kind).toBe("tap");
	});

	it("reports a press-and-hold without movement as a stroke", () => {
		const { view, h } = ctx;
		pointer(view.wrapper, "pointerdown", { x: 10, y: 10, t: 0 });
		pointer(view.wrapper, "pointerup", { x: 10, y: 10, t: 1000 });
		const stroke = h.strokeEnd.mock.calls[0][0];
		expect(stroke.kind).toBe("stroke");
		expect(stroke.points.map((p: { t: number }) => p.t)).toEqual([0, 1000]);
	});

	it("uses coalesced samples when the browser provides them", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointerdown", { x: 0, y: 0, t: 0 });
		pointer(view.card, "pointermove", {
			x: 9,
			y: 9,
			t: 9,
			coalesced: [
				{ clientX: 4, clientY: 4, timeStamp: 4, pressure: 0.3 },
				{ clientX: 9, clientY: 9, timeStamp: 9, pressure: 0.4 },
			],
		});
		expect(h.strokeMove).toHaveBeenCalledWith([
			{ x: 4, y: 4, t: 4, p: 0.3 },
			{ x: 9, y: 9, t: 9, p: 0.4 },
		]);
	});

	it("falls back to the event itself when getCoalescedEvents is missing or empty", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointerdown", { t: 0 });
		pointer(view.card, "pointermove", { x: 5, t: 5, coalesced: null });
		pointer(view.card, "pointermove", { x: 6, t: 6, coalesced: [] });
		expect(h.strokeMove.mock.calls).toEqual([[[{ x: 5, y: 0, t: 5, p: 0.5 }]], [[{ x: 6, y: 0, t: 6, p: 0.5 }]]]);
	});

	it("captures the pointer on the target, and carries on if capture fails", () => {
		const { view, h } = ctx;
		const capture = vi.spyOn(view.card, "setPointerCapture");
		pointer(view.card, "pointerdown", { id: 7 });
		expect(capture).toHaveBeenCalledWith(7);
		pointer(view.card, "pointerup", { id: 7, t: 10 });

		capture.mockImplementation(() => {
			throw new Error("InvalidPointerId");
		});
		pointer(view.card, "pointerdown", { id: 8 });
		expect(h.strokeStart).toHaveBeenCalledTimes(2);
	});

	it("blocks without preventDefault when an event is not cancelable", () => {
		const { view, h, reached } = ctx;
		const down = pointer(view.card, "pointerdown", { cancelable: false });
		expect(down.defaultPrevented).toBe(false);
		expect(reached).toEqual([]);
		expect(h.strokeStart).toHaveBeenCalled();
	});

	it("reports a system cancel instead of a stroke", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointerdown", { t: 0 });
		pointer(view.card, "pointermove", { x: 5, t: 5 });
		pointer(view.card, "pointercancel", { t: 6 });
		expect(h.strokeCancel).toHaveBeenCalled();
		expect(h.strokeEnd).not.toHaveBeenCalled();
		expect(h.log).toHaveBeenCalledWith("stroke cancelled by the system after 2 points");
	});

	it("ignores moves and ups from other pointers while a stroke is active", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointerdown", { id: 1, t: 0 });
		pointer(view.card, "pointermove", { id: 2, t: 5 });
		pointer(view.card, "pointerup", { id: 2, t: 6 });
		expect(h.strokeMove).not.toHaveBeenCalled();
		expect(h.strokeEnd).not.toHaveBeenCalled();
	});

	it("ignores a pen up with no stroke in progress", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointerup");
		expect(h.strokeEnd).not.toHaveBeenCalled();
	});
});

describe("leaving input alone", () => {
	beforeEach(() => (ctx = setup()));

	it("never touches finger pointer events", () => {
		const { view, h, reached } = ctx;
		const down = pointer(view.card, "pointerdown", { type: "touch" });
		pointer(view.card, "pointermove", { type: "touch" });
		pointer(view.card, "pointerup", { type: "touch" });
		expect(down.defaultPrevented).toBe(false);
		expect(reached).toEqual(["pointerdown", "pointermove", "pointerup"]);
		expect(h.strokeStart).not.toHaveBeenCalled();
	});

	it("lets the pen through outside the canvas surface", () => {
		const { view, h, reached } = ctx;
		const down = pointer(view.outside, "pointerdown");
		expect(down.defaultPrevented).toBe(false);
		expect(h.strokeStart).not.toHaveBeenCalled();
		pointer(view.card, "pointerdown");
		expect(reached).toEqual([]);
	});

	it("lets the pen through when the target is not an element", () => {
		const { h } = ctx;
		pointer(window, "pointerdown");
		expect(h.strokeStart).not.toHaveBeenCalled();
	});

	it("lets the pen use Canvas's own controls, and logs it", () => {
		const { view, h, reached } = ctx;
		pointer(view.zoomButton, "pointerdown");
		expect(h.strokeStart).not.toHaveBeenCalled();
		expect(h.log).toHaveBeenCalledWith("pen on div.clickable-icon: passed through");
		expect(reached).toEqual(["pointerdown"]);
	});

	it("lets the pen through on a card being edited", () => {
		const { view, h } = ctx;
		view.node.classList.add("is-editing");
		pointer(view.card, "pointerdown");
		expect(h.strokeStart).not.toHaveBeenCalled();
	});

	it("does nothing while glyph mode is off", () => {
		const { view, h, state, reached } = ctx;
		state.enabled = false;
		pointer(view.card, "pointerdown");
		pointer(view.card, "pointermove", { buttons: 0 });
		touch(view.card, "touchstart", [{ id: 1, stylus: true }]);
		expect(h.strokeStart).not.toHaveBeenCalled();
		expect(h.hover).not.toHaveBeenCalled();
		expect(reached).toEqual(["pointerdown", "pointermove", "touchstart"]);
	});
});

describe("touch events", () => {
	beforeEach(() => (ctx = setup()));

	it("blocks a stylus touch sequence on the canvas", () => {
		const { view, reached } = ctx;
		const start = touch(view.card, "touchstart", [{ id: 3, stylus: true }]);
		touch(view.card, "touchmove", [{ id: 3, stylus: true }]);
		touch(view.card, "touchend", [{ id: 3, stylus: true }]);
		expect(start.defaultPrevented).toBe(true);
		expect(reached).toEqual([]);

		// After touchend the id is forgotten, so a stray later event passes.
		touch(view.card, "touchmove", [{ id: 3, stylus: true }]);
		expect(reached).toEqual(["touchmove"]);
	});

	it("never blocks finger touches", () => {
		const { view, reached } = ctx;
		const start = touch(view.card, "touchstart", [{ id: 4, stylus: false }]);
		touch(view.card, "touchend", [{ id: 4, stylus: false }]);
		expect(start.defaultPrevented).toBe(false);
		expect(reached).toEqual(["touchstart", "touchend"]);
	});

	it("leaves stylus touches alone off the canvas surface", () => {
		const { view, reached } = ctx;
		touch(view.zoomButton, "touchstart", [{ id: 5, stylus: true }]);
		touch(view.zoomButton, "touchend", [{ id: 5, stylus: true }]);
		expect(reached).toEqual(["touchstart", "touchend"]);
	});
});

describe("compatibility mouse events", () => {
	beforeEach(() => (ctx = setup()));

	it("swallows mouse events during a pen stroke and shortly after", () => {
		const { view, reached } = ctx;
		const time = clock(1000);
		pointer(view.card, "pointerdown", { t: 0 });
		mouse(view.card, "mousedown");
		pointer(view.card, "pointerup", { t: 50 });
		time.advance(100);
		mouse(view.card, "click");
		expect(reached).toEqual([]);

		time.advance(300);
		mouse(view.card, "click");
		expect(reached).toEqual(["click"]);
	});

	it("stops swallowing as soon as a finger touches down", () => {
		const { view, reached } = ctx;
		clock(1000);
		pointer(view.card, "pointerdown", { t: 0 });
		pointer(view.card, "pointerup", { t: 50 });
		touch(view.card, "touchstart", [{ id: 9, stylus: false }]);
		mouse(view.card, "click");
		expect(reached).toEqual(["touchstart", "click"]);
	});

	it("never swallows mouse events off the canvas, even right after a stroke", () => {
		const { view } = ctx;
		clock(1000);
		const outside = spyOn(view.outside, ["click"]);
		pointer(view.card, "pointerdown", { t: 0 });
		pointer(view.card, "pointerup", { t: 50 });
		mouse(view.outside, "click");
		mouse(window, "click");
		expect(outside).toEqual(["click"]);
	});

	it("leaves mouse events alone when no pen is involved", () => {
		const { view, reached } = ctx;
		mouse(view.card, "mousedown");
		expect(reached).toEqual(["mousedown"]);
	});
});

describe("hover", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		ctx = setup();
	});
	afterEach(() => vi.useRealTimers());

	it("reports hover over the canvas and ends it when the pen leaves range", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointermove", { x: 3, y: 4, buttons: 0 });
		expect(h.hover).toHaveBeenCalledWith(3, 4);
		pointer(view.card, "pointerout", { relatedTarget: view.wrapper });
		expect(h.hoverEnd).not.toHaveBeenCalled();
		pointer(view.card, "pointerout", { relatedTarget: null });
		expect(h.hoverEnd).toHaveBeenCalledTimes(1);
	});

	it("ignores pointerout from fingers, and when not hovering", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointerout", { relatedTarget: null });
		pointer(view.card, "pointermove", { buttons: 0 });
		pointer(view.card, "pointerout", { type: "touch", relatedTarget: null });
		expect(h.hoverEnd).not.toHaveBeenCalled();
	});

	it("ends hover after a quiet period, restarting the timer on each move", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointermove", { buttons: 0 });
		vi.advanceTimersByTime(1000);
		pointer(view.card, "pointermove", { buttons: 0 });
		vi.advanceTimersByTime(1000);
		expect(h.hoverEnd).not.toHaveBeenCalled();
		vi.advanceTimersByTime(600);
		expect(h.hoverEnd).toHaveBeenCalledTimes(1);
	});

	it("ends hover when the pen touches down", () => {
		const { view, h } = ctx;
		pointer(view.card, "pointermove", { buttons: 0 });
		pointer(view.card, "pointerdown");
		expect(h.hoverEnd).toHaveBeenCalledTimes(1);
	});

	it("ignores hover off the canvas, finger moves, and pen moves with buttons down", () => {
		const { view, h } = ctx;
		pointer(view.outside, "pointermove", { buttons: 0 });
		pointer(view.card, "pointermove", { type: "touch", buttons: 0 });
		pointer(view.card, "pointermove", { buttons: 1 });
		expect(h.hover).not.toHaveBeenCalled();
	});

	it("clears a pending hover timer on unload", () => {
		const { view, h, plugin } = ctx;
		pointer(view.card, "pointermove", { buttons: 0 });
		plugin.unload();
		vi.advanceTimersByTime(5000);
		expect(h.hoverEnd).not.toHaveBeenCalled();
	});
});

describe("unload", () => {
	it("removes every listener", () => {
		ctx = setup();
		const { view, h, plugin, reached } = ctx;
		plugin.unload();
		pointer(view.card, "pointerdown");
		expect(h.strokeStart).not.toHaveBeenCalled();
		expect(reached).toEqual(["pointerdown"]);
	});
});
