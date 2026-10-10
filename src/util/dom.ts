/** Short label for an element in logs: tag plus its first three classes. */
export function describe(el: Element): string {
	const cls = Array.from(el.classList).slice(0, 3).join(".");
	return el.tagName.toLowerCase() + (cls ? `.${cls}` : "");
}
