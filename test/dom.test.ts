import { describe as suite, expect, it } from "vitest";
import { describe } from "../src/util/dom";

suite("describe", () => {
	it("names the tag and up to three classes", () => {
		const el = document.createElement("div");
		el.className = "a b c d";
		expect(describe(el)).toBe("div.a.b.c");
	});

	it("names just the tag when there are no classes", () => {
		expect(describe(document.createElement("P"))).toBe("p");
	});
});
