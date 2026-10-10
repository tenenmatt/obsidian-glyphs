// Copies gesture fixtures recorded on the iPad (pen-glyphs-fixtures/ in the
// vault) into test/fixtures/gestures.json, applying any label corrections from
// scripts/relabels.json ({ "<fixture file name without .md>": "<label>" }).
//
//   node scripts/import-fixtures.mjs            # vault from .vault-path
//   node scripts/import-fixtures.mjs <folder>   # explicit fixture folder
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const folder = process.argv[2] ?? join(readFileSync(".vault-path", "utf8").trim(), "pen-glyphs-fixtures");
const relabels = existsSync("scripts/relabels.json") ? JSON.parse(readFileSync("scripts/relabels.json", "utf8")) : {};
const OUT = "test/fixtures/gestures.json";

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const byId = new Map(existing.map((g) => [g.id, g]));

for (const file of readdirSync(folder).filter((f) => f.endsWith(".md")).sort()) {
	const id = file.slice(0, -3);
	const text = readFileSync(join(folder, file), "utf8");
	const data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
	// Fixtures recorded before 0.0.6 repeat coalesced samples; keep each timestamp once.
	const strokes = data.strokes.map((s) => {
		const kept = [];
		for (const p of s) if (kept.length === 0 || p[2] > kept[kept.length - 1][2]) kept.push(p);
		return kept;
	});
	byId.set(id, { id, label: relabels[id] ?? data.label, strokes });
}

const all = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
// One gesture per line keeps diffs readable when fixtures are added.
writeFileSync(OUT, "[\n" + all.map((g) => JSON.stringify(g)).join(",\n") + "\n]\n");

const counts = {};
for (const g of all) counts[g.label] = (counts[g.label] ?? 0) + 1;
console.log(`${all.length} gestures in ${OUT}:`, counts);
