import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_MS, Flash } from "../src/ui/Flash";

let flash: Flash;
const el = () => document.querySelector<HTMLElement>(".pen-glyphs-flash")!;

beforeEach(() => {
	vi.useFakeTimers();
	flash = new Flash();
});
afterEach(() => vi.useRealTimers());

describe("Flash", () => {
	it("starts hidden", () => {
		expect(el().classList.contains("is-visible")).toBe(false);
	});

	it("shows a label, then hides it", () => {
		flash.show("delete card");
		expect(el().textContent).toBe("delete card");
		expect(el().classList.contains("is-visible")).toBe(true);
		expect(el().classList.contains("is-miss")).toBe(false);
		vi.advanceTimersByTime(FLASH_MS);
		expect(el().classList.contains("is-visible")).toBe(false);
	});

	it("styles a miss differently", () => {
		flash.show("?", "miss");
		expect(el().classList.contains("is-miss")).toBe(true);
		flash.show("new card");
		expect(el().classList.contains("is-miss")).toBe(false);
	});

	it("restarts the timer when a new label arrives", () => {
		flash.show("select 2 cards");
		vi.advanceTimersByTime(FLASH_MS - 100);
		flash.show("delete 2 cards");
		vi.advanceTimersByTime(FLASH_MS - 100);
		expect(el().classList.contains("is-visible")).toBe(true);
		vi.advanceTimersByTime(100);
		expect(el().classList.contains("is-visible")).toBe(false);
	});

	it("removes itself and its timer on destroy", () => {
		flash.show("connect");
		flash.destroy();
		expect(el()).toBeNull();
		vi.advanceTimersByTime(FLASH_MS);
	});

	it("can be destroyed when idle", () => {
		flash.destroy();
		expect(el()).toBeNull();
	});
});
