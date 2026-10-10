import { describe, expect, it } from "vitest";
import { CheatsheetModal, cheatsheetEntries, drawIcon, fitPoints } from "../src/ui/Cheatsheet";
import { TEMPLATES } from "../src/recognize/templates";
import { App } from "./obsidian";

describe("cheatsheetEntries", () => {
	it("lists every glyph, drawing x, caret and v from templates", () => {
		const entries = cheatsheetEntries(TEMPLATES);
		expect(entries.map((e) => e.glyph)).toEqual(["lasso", "x", "square", "line", "tap", "caret", "v"]);
		const caret = entries.find((e) => e.glyph === "caret")!;
		expect(caret.drawing).toBe(TEMPLATES.find((t) => t.name === "caret")!.points);
		expect(entries.find((e) => e.glyph === "tap")!.drawing).toBe("dot");
	});

	it("draws nothing for a glyph with no template", () => {
		expect(cheatsheetEntries([]).find((e) => e.glyph === "x")!.drawing).toEqual([]);
	});
});

describe("fitPoints", () => {
	it("scales into the box keeping aspect ratio, centered", () => {
		const wide = [
			{ x: 0, y: 0 },
			{ x: 10, y: 5 },
		];
		expect(fitPoints(wide, 60, 10)).toBe("10,20 50,40");
	});

	it("handles a single point and no points", () => {
		expect(fitPoints([{ x: 3, y: 3 }], 60, 10)).toBe("30,30");
		expect(fitPoints([], 60, 10)).toBe("");
	});
});

describe("drawIcon", () => {
	it("draws a polyline, or a dot for a tap", () => {
		expect(drawIcon([{ x: 0, y: 0 }, { x: 1, y: 1 }]).querySelector("polyline")!.getAttribute("points")).toBe("8,8 48,48");
		expect(drawIcon("dot").querySelector("circle")).not.toBeNull();
	});
});

describe("CheatsheetModal", () => {
	it("shows a row per glyph and clears on close", () => {
		const modal = new CheatsheetModal(new App() as never, cheatsheetEntries(TEMPLATES));
		modal.open();
		expect((modal as unknown as { title: string }).title).toBe("Pen glyphs");
		const names = Array.from(modal.contentEl.querySelectorAll(".pen-glyphs-cheatsheet-name")).map((n) => n.textContent);
		expect(names[0]).toBe("lasso · around cards");
		expect(modal.contentEl.querySelectorAll("svg")).toHaveLength(7);
		modal.close();
		expect(modal.contentEl.childElementCount).toBe(0);
	});
});
