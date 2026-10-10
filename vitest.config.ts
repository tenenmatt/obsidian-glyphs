import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// The obsidian package only ships type definitions; tests run against a fake.
		alias: { obsidian: fileURLToPath(new URL("./test/obsidian.ts", import.meta.url)) },
	},
	test: {
		environment: "happy-dom",
		setupFiles: ["./test/setup.ts"],
		restoreMocks: true,
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			reporter: ["text", "html"],
			thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
		},
	},
});
