// Records real Pencil gestures as JSON fixtures in the vault, so the
// recognizer (milestone 3) can be developed and tested on the Mac.
// Fixtures are saved as .md files wrapping a ```json block: Obsidian Sync
// skips .json files unless "other file types" is turned on.

import { App, Modal, Notice, Setting, normalizePath } from "obsidian";
import { PenStroke } from "../input/PenCapture";

const FIXTURE_FOLDER = "pen-glyphs-fixtures";
// Strokes that start within this long of the previous stroke ending belong to
// the same gesture (e.g. the two strokes of an X).
const GESTURE_GAP_MS = 500;
const KEEP_STROKES = 20;
const QUICK_LABELS = ["x", "lasso", "caret", "v", "line", "other"];

export class GestureLog {
	private strokes: PenStroke[] = [];

	add(stroke: PenStroke): void {
		if (stroke.kind !== "stroke") return;
		this.strokes.push(stroke);
		if (this.strokes.length > KEEP_STROKES) this.strokes.shift();
	}

	/** The most recent run of strokes separated by short gaps. */
	lastGesture(): PenStroke[] {
		const out: PenStroke[] = [];
		for (let i = this.strokes.length - 1; i >= 0; i--) {
			const s = this.strokes[i];
			const next = out[0];
			if (next && next.points[0].t - s.points[s.points.length - 1].t > GESTURE_GAP_MS) break;
			out.unshift(s);
		}
		return out;
	}
}

export class SaveFixtureModal extends Modal {
	private custom = "";

	constructor(app: App, private gesture: PenStroke[]) {
		super(app);
	}

	override onOpen(): void {
		const pts = this.gesture.reduce((n, s) => n + s.points.length, 0);
		this.setTitle("Save last gesture as fixture");
		this.contentEl.createEl("p", {
			text: `${this.gesture.length} stroke(s), ${pts} points. Pick what it was meant to be:`,
		});
		const buttons = this.contentEl.createDiv({ cls: "pen-glyphs-fixture-labels" });
		for (const label of QUICK_LABELS) {
			buttons.createEl("button", { text: label }).addEventListener("click", () => this.save(label));
		}
		new Setting(this.contentEl)
			.setName("Other label")
			.addText((t) => t.setPlaceholder("e.g. x-sloppy").onChange((v) => (this.custom = v.trim())))
			.addButton((b) => b.setButtonText("Save").setCta().onClick(() => this.save(this.custom || "unlabeled")));
	}

	override onClose(): void {
		this.contentEl.empty();
	}

	private async save(label: string): Promise<void> {
		this.close();
		try {
			const path = await saveFixture(this.app, label, this.gesture);
			new Notice(`Saved ${path}`);
		} catch (err) {
			new Notice(`Saving fixture failed: ${String(err)}`);
		}
	}
}

async function saveFixture(app: App, label: string, gesture: PenStroke[]): Promise<string> {
	const t0 = gesture[0].points[0].t;
	const fixture = {
		label,
		savedAt: new Date().toISOString(),
		device: {
			userAgent: navigator.userAgent,
			devicePixelRatio: window.devicePixelRatio,
			viewport: [window.innerWidth, window.innerHeight],
		},
		// Each point is [x, y, t, pressure]: client px, ms since the gesture began, 0..1.
		strokes: gesture.map((s) => s.points.map((p) => [round(p.x, 1), round(p.y, 1), round(p.t - t0, 1), round(p.p, 3)])),
	};
	const vault = app.vault;
	if (!vault.getAbstractFileByPath(FIXTURE_FOLDER)) await vault.createFolder(FIXTURE_FOLDER);
	const safe = label.replace(/[^\w-]+/g, "-");
	const stamp = window.moment().format("YYYY-MM-DD HH-mm-ss");
	const path = normalizePath(`${FIXTURE_FOLDER}/${safe} ${stamp}.md`);
	await vault.create(path, "```json\n" + JSON.stringify(fixture) + "\n```\n");
	return path;
}

function round(v: number, digits: number): number {
	const f = 10 ** digits;
	return Math.round(v * f) / f;
}
