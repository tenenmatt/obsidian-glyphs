// Minimal fake of the parts of the Obsidian API the plugin uses. Aliased to
// "obsidian" in vitest.config.ts. Test-only helpers (Notice.shown, FakeVault,
// Plugin.commands, ...) are not part of the real API.

export const apiVersion = "1.0.0-test";

export const Platform = {
	isIosApp: false,
	isTablet: false,
	isPhone: false,
	isMobileApp: false,
};

export class Notice {
	static shown: string[] = [];
	constructor(message: string) {
		Notice.shown.push(message);
	}
}

export function normalizePath(path: string): string {
	return path.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

export class FakeVault {
	files = new Map<string, string>();
	folders = new Set<string>();
	getAbstractFileByPath(path: string): object | null {
		return this.files.has(path) || this.folders.has(path) ? { path } : null;
	}
	async createFolder(path: string): Promise<void> {
		this.folders.add(path);
	}
	async create(path: string, data: string): Promise<object> {
		if (this.files.has(path)) throw new Error(`File already exists: ${path}`);
		this.files.set(path, data);
		return { path };
	}
}

export class FakeWorkspace {
	leaves: { view: unknown }[] = [];
	mostRecent: { view: unknown } | null = null;
	getLeavesOfType(type: string): { view: unknown }[] {
		return type === "canvas" ? this.leaves : [];
	}
	getMostRecentLeaf(): { view: unknown } | null {
		return this.mostRecent;
	}
}

export class App {
	vault = new FakeVault();
	workspace = new FakeWorkspace();
}

export class Component {
	private cleanups: (() => void)[] = [];

	register(cb: () => void): void {
		this.cleanups.push(cb);
	}

	registerDomEvent(
		el: EventTarget,
		type: string,
		cb: (e: Event) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void {
		el.addEventListener(type, cb, options);
		this.register(() => el.removeEventListener(type, cb, options));
	}

	unload(): void {
		for (const cb of this.cleanups.splice(0)) cb();
	}
}

export interface Command {
	id: string;
	name: string;
	callback?: () => unknown;
	checkCallback?: (checking: boolean) => boolean | void;
}

export class Plugin extends Component {
	commands: Command[] = [];
	ribbon: { icon: string; title: string; callback: (e: MouseEvent) => unknown }[] = [];
	data: unknown = null;

	constructor(public app: App, public manifest: { id: string; version: string }) {
		super();
	}

	async loadData(): Promise<unknown> {
		return this.data;
	}

	async saveData(data: unknown): Promise<void> {
		this.data = JSON.parse(JSON.stringify(data));
	}

	addCommand(command: Command): Command {
		this.commands.push(command);
		return command;
	}

	settingTabs: PluginSettingTab[] = [];
	addSettingTab(tab: PluginSettingTab): void {
		this.settingTabs.push(tab);
	}

	addRibbonIcon(icon: string, title: string, callback: (e: MouseEvent) => unknown): HTMLElement {
		this.ribbon.push({ icon, title, callback });
		return document.createElement("div");
	}

	/** Test helper: run a command by id. */
	/**
	 * Test helper: run a command by id, as the command palette would. A
	 * checkCallback command must report itself available first; its (possibly
	 * async) work is given a macrotask to finish before the returned promise resolves.
	 */
	runCommand(id: string): unknown {
		const command = this.commands.find((c) => c.id === id);
		if (!command) throw new Error(`no command ${id}`);
		if (command.checkCallback) {
			if (!command.checkCallback(true)) throw new Error(`command ${id} is unavailable`);
			command.checkCallback(false);
			return new Promise((resolve) => setTimeout(resolve, 0));
		}
		return command.callback!();
	}

	/** Test helper: whether the command palette would list a command right now. */
	isCommandAvailable(id: string): boolean {
		const command = this.commands.find((c) => c.id === id);
		return !!command && (!command.checkCallback || command.checkCallback(true) === true);
	}
}

export class Modal {
	static opened: Modal[] = [];
	contentEl = document.createElement("div");
	title = "";

	constructor(public app: App) {}

	setTitle(title: string): this {
		this.title = title;
		return this;
	}

	open(): void {
		Modal.opened.push(this);
		this.onOpen();
	}

	close(): void {
		this.onClose();
	}

	onOpen(): void {}
	onClose(): void {}
}

export class PluginSettingTab {
	containerEl = document.createElement("div");
	constructor(
		public app: App,
		public plugin: Plugin,
	) {}
	display(): void {}
}

class ToggleComponent {
	toggleEl = document.createElement("input");
	constructor() {
		this.toggleEl.type = "checkbox";
	}
	setValue(on: boolean): this {
		this.toggleEl.checked = on;
		return this;
	}
	onChange(cb: (on: boolean) => unknown): this {
		this.toggleEl.addEventListener("change", () => cb(this.toggleEl.checked));
		return this;
	}
}

class TextComponent {
	inputEl = document.createElement("input");
	setPlaceholder(placeholder: string): this {
		this.inputEl.placeholder = placeholder;
		return this;
	}
	onChange(cb: (value: string) => unknown): this {
		this.inputEl.addEventListener("input", () => cb(this.inputEl.value));
		return this;
	}
}

class ButtonComponent {
	buttonEl = document.createElement("button");
	setButtonText(text: string): this {
		this.buttonEl.textContent = text;
		return this;
	}
	setCta(): this {
		this.buttonEl.classList.add("mod-cta");
		return this;
	}
	onClick(cb: () => unknown): this {
		this.buttonEl.addEventListener("click", () => cb());
		return this;
	}
}

export class Setting {
	settingEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		this.settingEl = containerEl.createDiv({ cls: "setting-item" });
	}
	setName(name: string): this {
		this.settingEl.createDiv({ cls: "setting-item-name", text: name });
		return this;
	}
	setDesc(desc: string): this {
		this.settingEl.createDiv({ cls: "setting-item-description", text: desc });
		return this;
	}
	addToggle(cb: (t: ToggleComponent) => unknown): this {
		const t = new ToggleComponent();
		this.settingEl.appendChild(t.toggleEl);
		cb(t);
		return this;
	}
	addText(cb: (t: TextComponent) => unknown): this {
		const t = new TextComponent();
		this.settingEl.appendChild(t.inputEl);
		cb(t);
		return this;
	}
	addButton(cb: (b: ButtonComponent) => unknown): this {
		const b = new ButtonComponent();
		this.settingEl.appendChild(b.buttonEl);
		cb(b);
		return this;
	}
}
