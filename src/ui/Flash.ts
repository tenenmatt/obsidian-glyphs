// A brief label in the middle of the screen naming the command that just ran
// (or "?" for a stroke that wasn't understood). It never takes input.

// How long the label stays fully visible before fading (the fade itself is a
// CSS transition, see styles.css).
export const FLASH_MS = 600;

export type FlashKind = "done" | "miss";

export class Flash {
	private el: HTMLElement;
	private timer: number | null = null;

	constructor() {
		this.el = document.body.createDiv({ cls: "pen-glyphs-flash" });
	}

	show(text: string, kind: FlashKind = "done"): void {
		this.el.setText(text);
		this.el.toggleClass("is-miss", kind === "miss");
		this.el.addClass("is-visible");
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.el.removeClass("is-visible");
		}, FLASH_MS);
	}

	destroy(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.el.remove();
	}
}
