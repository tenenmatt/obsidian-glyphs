// On-screen event log. Works where no devtools are available (iPad without
// Safari Web Inspector) and can save the full log into the vault, where Sync
// carries it back to the Mac.

import { Notice, Plugin, normalizePath } from "obsidian";

const MAX_LINES = 3000;
const VISIBLE_LINES = 40;
const LOG_FOLDER = "pen-glyphs-logs";

export interface PanelAction {
	label: () => string;
	run: () => void;
}

export class DebugPanel {
	private lines: string[] = [];
	private el: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;
	private actionsEl: HTMLElement | null = null;
	private renderQueued = false;
	private collapsed = false;
	private readonly t0 = performance.now();

	constructor(private plugin: Plugin, private actions: PanelAction[]) {}

	log = (line: string): void => {
		const t = ((performance.now() - this.t0) / 1000).toFixed(2).padStart(7);
		this.lines.push(`${t}  ${line}`);
		if (this.lines.length > MAX_LINES) this.lines.splice(0, this.lines.length - MAX_LINES);
		this.queueRender();
	};

	get isShown(): boolean {
		return this.el !== null;
	}

	show(): void {
		if (this.el) return;
		this.el = document.body.createDiv({ cls: "pen-glyphs-debug" });
		const header = this.el.createDiv({ cls: "pen-glyphs-debug-header" });
		// The version of the running code, which lags the installed manifest until the plugin reloads.
		header.createSpan({ text: `pen-glyphs ${__PLUGIN_VERSION__}`, cls: "pen-glyphs-debug-title" });
		this.actionsEl = header.createDiv({ cls: "pen-glyphs-debug-actions" });
		this.bodyEl = this.el.createEl("pre", { cls: "pen-glyphs-debug-body" });
		this.refreshActions();
		this.applyCollapsed();
		this.queueRender();
	}

	hide(): void {
		this.el?.remove();
		this.el = this.bodyEl = this.actionsEl = null;
	}

	refreshActions(): void {
		if (!this.actionsEl) return;
		this.actionsEl.empty();
		for (const action of this.actions) this.addButton(action.label(), action.run);
		this.addButton(this.collapsed ? "▢" : "–", () => {
			this.collapsed = !this.collapsed;
			this.applyCollapsed();
			this.refreshActions();
		});
	}

	clear(): void {
		this.lines = [];
		this.queueRender();
	}

	text(): string {
		return this.lines.join("\n");
	}

	async copy(): Promise<void> {
		try {
			await navigator.clipboard.writeText(this.text());
			new Notice(`Copied ${this.lines.length} log lines`);
		} catch (err) {
			new Notice(`Copy failed: ${String(err)}`);
		}
	}

	async saveToVault(header: string): Promise<void> {
		const vault = this.plugin.app.vault;
		const stamp = window.moment().format("YYYY-MM-DD HH-mm-ss");
		const path = normalizePath(`${LOG_FOLDER}/${stamp}.md`);
		if (!vault.getAbstractFileByPath(LOG_FOLDER)) await vault.createFolder(LOG_FOLDER);
		await vault.create(path, `${header}\n\n\`\`\`\n${this.text()}\n\`\`\`\n`);
		new Notice(`Saved log to ${path}`);
	}

	private addButton(label: string, run: () => void): void {
		const btn = this.actionsEl!.createEl("button", { text: label });
		btn.addEventListener("click", (e) => {
			e.stopPropagation();
			run();
		});
	}

	private applyCollapsed(): void {
		this.el?.toggleClass("is-collapsed", this.collapsed);
	}

	private queueRender(): void {
		if (this.renderQueued || !this.bodyEl) return;
		this.renderQueued = true;
		requestAnimationFrame(() => {
			this.renderQueued = false;
			if (this.bodyEl) this.bodyEl.setText(this.lines.slice(-VISIBLE_LINES).join("\n"));
		});
	}
}
