// Bundles src/main.ts into build/ and copies the plugin into
// <vault>/.obsidian/plugins/pen-glyphs/ for each vault listed in .vault-path
// (one vault folder per line; blank lines and lines starting with # are ignored).
// `npm run dev` watches; `npm run build` does a single production build.
import esbuild from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const prod = process.argv[2] === "production";
// Compiled into the bundle, so the code reports the version it was built as,
// even if Sync has since replaced manifest.json on disk.
const version = JSON.parse(readFileSync("manifest.json", "utf8")).version;
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];

function pluginDirs() {
  if (!existsSync(".vault-path")) return [];
  const vaults = readFileSync(".vault-path", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return vaults.flatMap((vault) => {
    if (existsSync(join(vault, ".obsidian"))) return [join(vault, ".obsidian", "plugins", "pen-glyphs")];
    console.warn(`[pen-glyphs] .vault-path: no .obsidian folder in ${vault}; skipping copy`);
    return [];
  });
}

function deploy() {
  copyFileSync("manifest.json", "build/manifest.json");
  copyFileSync("styles.css", "build/styles.css");
  for (const dest of pluginDirs()) {
    mkdirSync(dest, { recursive: true });
    for (const f of PLUGIN_FILES) copyFileSync(join("build", f), join(dest, f));
    console.log(`[pen-glyphs] ${new Date().toLocaleTimeString()} copied to ${dest}`);
  }
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
  define: { __PLUGIN_VERSION__: JSON.stringify(version) },
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
