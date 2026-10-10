// Recreates the globals Obsidian provides at runtime: the DOM helper methods
// it adds to every element, and window.moment.

import { beforeEach } from "vitest";
import { Modal, Notice, Platform } from "./obsidian";

interface DomInfo {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string>;
}

function applyInfo(el: HTMLElement, info?: DomInfo | string): void {
	if (typeof info === "string") {
		el.className = info;
		return;
	}
	if (!info) return;
	if (info.cls) el.classList.add(...(Array.isArray(info.cls) ? info.cls : info.cls.split(" ")));
	if (info.text !== undefined) el.textContent = info.text;
	for (const [k, v] of Object.entries(info.attr ?? {})) el.setAttribute(k, v);
}

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.createEl = function (this: HTMLElement, tag: string, info?: DomInfo | string) {
	const el = document.createElement(tag);
	applyInfo(el, info);
	this.appendChild(el);
	return el;
};
proto.createDiv = function (this: HTMLElement, info?: DomInfo | string) {
	return (this as unknown as { createEl: (t: string, i?: DomInfo | string) => HTMLElement }).createEl("div", info);
};
proto.createSpan = function (this: HTMLElement, info?: DomInfo | string) {
	return (this as unknown as { createEl: (t: string, i?: DomInfo | string) => HTMLElement }).createEl("span", info);
};
proto.empty = function (this: HTMLElement) {
	this.replaceChildren();
};
proto.setText = function (this: HTMLElement, text: string) {
	this.textContent = text;
};
proto.toggleClass = function (this: HTMLElement, cls: string, on: boolean) {
	this.classList.toggle(cls, on);
};

(window as unknown as { moment: () => { format: () => string } }).moment = () => ({
	format: () => "2026-10-09 12-00-00",
});

beforeEach(() => {
	document.body.replaceChildren();
	Notice.shown = [];
	Modal.opened = [];
	Object.assign(Platform, { isIosApp: false, isTablet: false, isPhone: false, isMobileApp: false });
});
