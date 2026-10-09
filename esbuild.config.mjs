// Bundles src/main.ts into build/ and, if .vault-path names a vault,
// copies the plugin into <vault>/.obsidian/plugins/pen-glyphs/ on every build.
// `npm run dev` watches; `npm run build` does a single production build.
import esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const prod = process.argv[2] === "production";
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];

function pluginDir() {
  if (!existsSync(".vault-path")) return null;
  const vault = readFileSync(".vault-path", "utf8").trim();
  if (!vault) return null;
  if (!existsSync(join(vault, ".obsidian"))) {
    console.warn(`[pen-glyphs] .vault-path: no .obsidian folder in ${vault}; skipping copy`);
    return null;
  }
  return join(vault, ".obsidian", "plugins", "pen-glyphs");
}

function deploy() {
  copyFileSync("manifest.json", "build/manifest.json");
  copyFileSync("styles.css", "build/styles.css");
  const dest = pluginDir();
  if (!dest) return;
  mkdirSync(dest, { recursive: true });
  for (const f of PLUGIN_FILES) copyFileSync(join("build", f), join(dest, f));
  console.log(`[pen-glyphs] ${new Date().toLocaleTimeString()} copied to ${dest}`);
}

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*", "@lezer/*"],
  format: "cjs",
  target: "es2020",
  outfile: "build/main.js",
  sourcemap: prod ? false : "inline",
  minify: prod,
  logLevel: "info",
  plugins: [{
    name: "deploy",
    setup(build) {
      build.onEnd((result) => { if (result.errors.length === 0) deploy(); });
    },
  }],
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
}
