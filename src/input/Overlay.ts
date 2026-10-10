// Transparent full-window <canvas> that draws pen ink and the hover dot.
// It never receives input (pointer-events: none), and it redraws only while
// something is live or fading.

import { PenPoint, PenStroke } from "./strokes";

// How long a finished stroke stays fully visible, then how long it takes to
// fade. Recognition (milestone 3) will end the hold early.
export const HOLD_MS = 400;
export const FADE_MS = 250;
export const TAP_FADE_MS = 200;
// Ink width in CSS px at zero pressure and at FULL_PRESSURE or more. Normal
// writing on the Pencil peaks around 0.1-0.3, so full width comes early.
export const MIN_WIDTH = 2;
export const MAX_WIDTH = 7;
export const FULL_PRESSURE = 0.35;
export const HOVER_RADIUS = 4;

interface Ink {
	points: PenPoint[];
	kind: PenStroke["kind"] | "live";
	color: string;
	// performance.now() time the fade begins; null while the stroke is live.
	fadeAt: number | null;
	fadeMs: number;
}

export class Overlay {
	private el: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private inks: Ink[] = [];
	private live: Ink | null = null;
	private hoverAt: { x: number; y: number } | null = null;
	private dpr = 1;
	private frameQueued = false;

	constructor() {
		this.el = document.body.createEl("canvas", { cls: "pen-glyphs-overlay" });
		this.ctx = this.el.getContext("2d", { desynchronized: true })!;
		this.resize();
	}

	destroy(): void {
		this.el.remove();
	}

	resize = (): void => {
		this.dpr = window.devicePixelRatio || 1;
		// Size in CSS px from the same source as clientX/Y, so ink lands under the pen.
		this.el.style.width = `${window.innerWidth}px`;
		this.el.style.height = `${window.innerHeight}px`;
		this.el.width = Math.round(window.innerWidth * this.dpr);
		this.el.height = Math.round(window.innerHeight * this.dpr);
		this.queueFrame();
	};

	begin(point: PenPoint): void {
		this.hoverAt = null;
		this.live = { points: [point], kind: "live", color: accentColor(), fadeAt: null, fadeMs: FADE_MS };
		this.inks.push(this.live);
		this.queueFrame();
	}

	extend(points: PenPoint[]): void {
		if (!this.live) return;
		this.live.points.push(...points);
		this.queueFrame();
	}

	end(stroke: PenStroke): void {
		if (!this.live) return;
		this.live.points = stroke.points;
		this.live.kind = stroke.kind;
		const tap = stroke.kind === "tap";
		this.live.fadeAt = performance.now() + (tap ? 0 : HOLD_MS);
		this.live.fadeMs = tap ? TAP_FADE_MS : FADE_MS;
		this.live = null;
		this.queueFrame();
	}

	cancel(): void {
		if (!this.live) return;
		this.live.fadeAt = performance.now();
		this.live = null;
		this.queueFrame();
	}

	setHover(x: number, y: number): void {
		this.hoverAt = { x, y };
		this.queueFrame();
	}

	clearHover(): void {
		this.hoverAt = null;
		this.queueFrame();
	}

	private queueFrame(): void {
		if (this.frameQueued) return;
		this.frameQueued = true;
		requestAnimationFrame(this.frame);
	}

	private frame = (): void => {
		this.frameQueued = false;
		const now = performance.now();
		const ctx = this.ctx;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(0, 0, this.el.width, this.el.height);

		this.inks = this.inks.filter((ink) => ink.fadeAt === null || now < ink.fadeAt + ink.fadeMs);
		let fading = false;
		for (const ink of this.inks) {
			let alpha = 1;
			if (ink.fadeAt !== null) {
				fading = true;
				alpha = Math.min(1, 1 - (now - ink.fadeAt) / ink.fadeMs);
			}
			drawInk(ctx, ink, alpha);
		}

		if (this.hoverAt) {
			ctx.globalAlpha = 0.45;
			ctx.fillStyle = accentColor();
			ctx.beginPath();
			ctx.arc(this.hoverAt.x, this.hoverAt.y, HOVER_RADIUS, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;

		if (fading) this.queueFrame();
	};
}

function drawInk(ctx: CanvasRenderingContext2D, ink: Ink, alpha: number): void {
	const pts = ink.points;
	ctx.globalAlpha = alpha;
	ctx.strokeStyle = ctx.fillStyle = ink.color;
	ctx.lineCap = ctx.lineJoin = "round";

	if (ink.kind === "tap" || pts.length === 1) {
		ctx.beginPath();
		ctx.arc(pts[0].x, pts[0].y, MAX_WIDTH, 0, Math.PI * 2);
		ctx.fill();
		return;
	}
	// One segment per pair of points, so width can follow pressure.
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1];
		const b = pts[i];
		const weight = Math.min(1, (a.p + b.p) / 2 / FULL_PRESSURE);
		ctx.lineWidth = MIN_WIDTH + (MAX_WIDTH - MIN_WIDTH) * weight;
		ctx.beginPath();
		ctx.moveTo(a.x, a.y);
		ctx.lineTo(b.x, b.y);
		ctx.stroke();
	}
}

function accentColor(): string {
	return getComputedStyle(document.body).getPropertyValue("--interactive-accent").trim() || "#7b6cd9";
}
