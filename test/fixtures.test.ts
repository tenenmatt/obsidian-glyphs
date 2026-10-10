import { App, FakeVault, Notice } from "./obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GestureLog, SaveFixtureModal, serializeFixture } from "../src/dev/fixtures";
import { pt, stroke } from "./helpers";

describe("GestureLog", () => {
	it("ignores taps and groups the last strokes into a gesture", () => {
		const log = new GestureLog();
		const first = stroke([pt(0, 0, 0), pt(1, 1, 100)]);
		const second = stroke([pt(0, 0, 300), pt(1, 1, 400)]);
		log.add(first);
		log.add(stroke([pt(0, 0, 200)], "tap"));
		log.add(second);
		expect(log.lastGesture()).toEqual([first, second]);
	});

	it("keeps only the 20 most recent strokes", () => {
		const log = new GestureLog();
		for (let i = 0; i < 25; i++) log.add(stroke([pt(0, 0, i * 10), pt(1, 1, i * 10 + 5)]));
		const gesture = log.lastGesture();
		expect(gesture).toHaveLength(20);
		expect(gesture[0].points[0].t).toBe(50);
	});
});

describe("serializeFixture", () => {
	it("writes rounded, gesture-relative points inside a json block", () => {
		vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
		const text = serializeFixture(
			"x",
			[stroke([pt(10.04, 20.06, 1000.04, 0.12345)]), stroke([pt(30, 40, 1100.5, 1)])],
			new Date("2026-10-09T12:00:00Z"),
		);
		expect(text.startsWith("```json\n")).toBe(true);
		expect(text.endsWith("\n```\n")).toBe(true);
		const data = JSON.parse(text.slice(8, -5));
		expect(data).toMatchObject({
			label: "x",
			savedAt: "2026-10-09T12:00:00.000Z",
			device: { devicePixelRatio: 2, viewport: [window.innerWidth, window.innerHeight] },
			strokes: [[[10, 20.1, 0, 0.123]], [[30, 40, 100.5, 1]]],
		});
		expect(data.device.userAgent).toBe(navigator.userAgent);
	});
});

describe("SaveFixtureModal", () => {
	let app: App;
	const gesture = [stroke([pt(0, 0, 0), pt(5, 5, 10)]), stroke([pt(9, 9, 300)])];

	function open() {
		const modal = new SaveFixtureModal(app as never, gesture);
		modal.open();
		return modal;
	}
	function vault(): FakeVault {
		return app.vault as unknown as FakeVault;
	}
	async function settle() {
		await new Promise((r) => setTimeout(r, 0));
	}

	beforeEach(() => {
		app = new App();
	});

	it("describes the gesture and offers quick labels", () => {
		const modal = open();
		expect((modal as unknown as { title: string }).title).toBe("Save last gesture as fixture");
		expect(modal.contentEl.querySelector("p")!.textContent).toBe("2 stroke(s), 3 points. Pick what it was meant to be:");
		const labels = Array.from(modal.contentEl.querySelectorAll(".pen-glyphs-fixture-labels button")).map(
			(b) => b.textContent,
		);
		expect(labels).toEqual(["x", "lasso", "caret", "v", "square", "line", "other"]);
	});

	it("saves under a quick label and closes", async () => {
		const modal = open();
		const quick = modal.contentEl.querySelectorAll<HTMLButtonElement>(".pen-glyphs-fixture-labels button");
		quick[3].click();
		await settle();
		const path = "pen-glyphs-fixtures/v 2026-10-09 12-00-00.md";
		expect(vault().files.get(path)).toContain('"label":"v"');
		expect(Notice.shown).toEqual([`Saved ${path}`]);
		expect(modal.contentEl.childElementCount).toBe(0);
	});

	it("saves under a typed label, made filename-safe", async () => {
		const modal = open();
		const input = modal.contentEl.querySelector("input")!;
		input.value = " x / sloppy ";
		input.dispatchEvent(new Event("input"));
		modal.contentEl.querySelector<HTMLButtonElement>("button.mod-cta")!.click();
		await settle();
		expect(vault().files.has("pen-glyphs-fixtures/x-sloppy 2026-10-09 12-00-00.md")).toBe(true);
	});

	it("falls back to 'unlabeled' when no label is typed", async () => {
		const modal = open();
		modal.contentEl.querySelector<HTMLButtonElement>("button.mod-cta")!.click();
		await settle();
		expect(vault().files.has("pen-glyphs-fixtures/unlabeled 2026-10-09 12-00-00.md")).toBe(true);
	});

	it("reuses an existing fixture folder", async () => {
		await vault().createFolder("pen-glyphs-fixtures");
		const createFolder = vi.spyOn(vault(), "createFolder");
		const modal = open();
		modal.contentEl.querySelector<HTMLButtonElement>(".pen-glyphs-fixture-labels button")!.click();
		await settle();
		expect(createFolder).not.toHaveBeenCalled();
	});

	it("reports a failed save", async () => {
		vault().files.set("pen-glyphs-fixtures/x 2026-10-09 12-00-00.md", "taken");
		const modal = open();
		modal.contentEl.querySelector<HTMLButtonElement>(".pen-glyphs-fixture-labels button")!.click();
		await settle();
		expect(Notice.shown).toEqual([
			"Saving fixture failed: Error: File already exists: pen-glyphs-fixtures/x 2026-10-09 12-00-00.md",
		]);
	});
});
