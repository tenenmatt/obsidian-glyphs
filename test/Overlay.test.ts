import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	FADE_MS,
	FULL_PRESSURE,
	HOLD_MS,
	HOVER_RADIUS,
	MAX_WIDTH,
	MIN_WIDTH,
	Overlay,
	TAP_FADE_MS,
} from "../src/input/Overlay";
import { clock, fakeContext, manualFrames, pt, stroke } from "./helpers";

let draw: ReturnType<typeof fakeContext>;
let frames: ReturnType<typeof manualFrames>;
let time: ReturnType<typeof clock>;
let overlay: Overlay;

beforeEach(() => {
	draw = fakeContext();
	frames = manualFrames();
	time = clock(1000);
	document.body.style.setProperty("--interactive-accent", "#ff0000");
	overlay = new Overlay();
	frames.flush();
	draw.reset();
});

function canvasEl(): HTMLCanvasElement {
	return document.querySelector("canvas.pen-glyphs-overlay")!;
}

describe("setup", () => {
	it("adds a canvas sized to the window in CSS px and device pixels", () => {
		vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
		overlay.resize();
		const el = canvasEl();
		expect(el.style.width).toBe(`${window.innerWidth}px`);
		expect(el.width).toBe(window.innerWidth * 2);
		expect(el.height).toBe(window.innerHeight * 2);
		frames.flush();
		expect(draw.ops("setTransform")[0].args).toEqual([2, 0, 0, 2, 0, 0]);
	});

	it("treats a missing devicePixelRatio as 1", () => {
		vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(0);
		overlay.resize();
		expect(canvasEl().width).toBe(window.innerWidth);
	});

	it("removes the canvas on destroy", () => {
		overlay.destroy();
		expect(canvasEl()).toBeNull();
	});
});

describe("ink", () => {
	it("draws a live single point as a dot in the accent color", () => {
		overlay.begin(pt(10, 20, 0));
		frames.flush();
		const [dot] = draw.ops("arc");
		expect(dot.args).toEqual([10, 20, MAX_WIDTH, 0, Math.PI * 2]);
		expect(draw.ops("fill")[0].style).toBe("#ff0000");
	});

	it("falls back to a default color when the theme has no accent", () => {
		document.body.style.removeProperty("--interactive-accent");
		overlay.begin(pt(0, 0, 0));
		frames.flush();
		expect(draw.ops("fill")[0].style).toBe("#7b6cd9");
	});

	it("draws one segment per pair of points, with width following pressure", () => {
		const half = FULL_PRESSURE / 2;
		overlay.begin(pt(0, 0, 0, 0));
		overlay.extend([pt(10, 0, 5, 0), pt(20, 0, 10, half * 2), pt(30, 0, 15, 1)]);
		frames.flush();
		const strokes = draw.ops("stroke");
		expect(strokes.map((s) => s.lineWidth)).toEqual([
			MIN_WIDTH,
			MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) / 2,
			MAX_WIDTH, // capped once pressure passes FULL_PRESSURE
		]);
		expect(draw.ops("lineTo").map((c) => c.args)).toEqual([
			[10, 0],
			[20, 0],
			[30, 0],
		]);
	});

	it("only schedules one frame per batch of updates", () => {
		overlay.begin(pt(0, 0, 0));
		overlay.extend([pt(1, 1, 1)]);
		overlay.extend([pt(2, 2, 2)]);
		expect(frames.pending).toBe(1);
	});

	it("stops drawing frames while a live stroke is idle", () => {
		overlay.begin(pt(0, 0, 0));
		frames.flush();
		expect(frames.pending).toBe(0);
	});

	it("holds a finished stroke, fades it out, then removes it", () => {
		overlay.begin(pt(0, 0, 0));
		overlay.extend([pt(50, 0, 300)]);
		overlay.end(stroke([pt(0, 0, 0), pt(50, 0, 300)]));

		frames.flush();
		expect(draw.ops("stroke")[0].alpha).toBe(1);

		time.advance(HOLD_MS + FADE_MS / 2);
		draw.reset();
		frames.flush();
		expect(draw.ops("stroke")[0].alpha).toBeCloseTo(0.5);

		time.advance(FADE_MS / 2);
		draw.reset();
		frames.flush();
		expect(draw.ops("stroke")).toHaveLength(0);
		expect(frames.pending).toBe(0);
	});

	it("uses the final stroke's points when it ends", () => {
		overlay.begin(pt(0, 0, 0));
		overlay.end(stroke([pt(0, 0, 0), pt(30, 0, 300)]));
		frames.flush();
		expect(draw.ops("lineTo")[0].args).toEqual([30, 0]);
	});

	it("fades a tap immediately and quickly", () => {
		overlay.begin(pt(5, 5, 0));
		overlay.end(stroke([pt(5, 5, 0)], "tap"));
		time.advance(TAP_FADE_MS / 2);
		frames.flush();
		const [dot] = draw.ops("fill");
		expect(dot.alpha).toBeCloseTo(0.5);
		time.advance(TAP_FADE_MS);
		draw.reset();
		frames.flush();
		expect(draw.ops("fill")).toHaveLength(0);
	});

	it("draws a tap as a dot even if the tap wobbled", () => {
		overlay.begin(pt(5, 5, 0));
		overlay.end(stroke([pt(5, 5, 0), pt(6, 5, 50)], "tap"));
		frames.flush();
		expect(draw.ops("arc")).toHaveLength(1);
		expect(draw.ops("stroke")).toHaveLength(0);
	});

	it("fades a cancelled stroke right away", () => {
		overlay.begin(pt(0, 0, 0));
		overlay.extend([pt(10, 0, 10)]);
		overlay.cancel();
		time.advance(FADE_MS / 2);
		frames.flush();
		expect(draw.ops("stroke")[0].alpha).toBeCloseTo(0.5);
	});

	it("ignores extend, end and cancel with no live stroke", () => {
		overlay.extend([pt(1, 1, 1)]);
		overlay.end(stroke([pt(1, 1, 1)]));
		overlay.cancel();
		expect(frames.pending).toBe(0);
	});

	it("keeps an earlier stroke fading while a new one is drawn", () => {
		overlay.begin(pt(0, 0, 0));
		overlay.extend([pt(10, 0, 10)]);
		overlay.end(stroke([pt(0, 0, 0), pt(10, 0, 300)]));
		overlay.begin(pt(100, 0, 400));
		overlay.extend([pt(110, 0, 410)]);
		frames.flush();
		expect(draw.ops("stroke")).toHaveLength(2);
	});
});

describe("hover dot", () => {
	it("draws a translucent dot at the hover point", () => {
		overlay.setHover(30, 40);
		frames.flush();
		const [dot] = draw.ops("arc");
		expect(dot.args).toEqual([30, 40, HOVER_RADIUS, 0, Math.PI * 2]);
		expect(draw.ops("fill")[0].alpha).toBe(0.45);
	});

	it("clears the dot", () => {
		overlay.setHover(30, 40);
		overlay.clearHover();
		frames.flush();
		expect(draw.ops("arc")).toHaveLength(0);
	});

	it("hides the dot when a stroke begins", () => {
		overlay.setHover(30, 40);
		overlay.begin(pt(0, 0, 0));
		overlay.extend([pt(1, 0, 1)]);
		frames.flush();
		expect(draw.ops("arc")).toHaveLength(0);
	});
});
