#!/usr/bin/env node
// Copy a freshly generated events.json from the events-radar skill into the app.
//   npm run import -- ../../Eve/outputs/events.json
// Validates the shape, reports a quick summary, then writes public/events.json.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = resolve(here, "..", "public", "events.json");

const src = process.argv[2];
if (!src) {
  console.error("Usage: npm run import -- <path-to>/outputs/events.json");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(readFileSync(resolve(process.cwd(), src), "utf8"));
} catch (e) {
  console.error(`✗ Could not read/parse ${src}: ${e.message}`);
  process.exit(1);
}

if (!data || !Array.isArray(data.events) || !data.meta) {
  console.error("✗ That file doesn't look like a radar events.json (expected { meta, events:[] }).");
  process.exit(1);
}
const missing = data.events.find((e) => !e.id);
if (missing) {
  console.error("✗ An event is missing a stable `id` — regenerate with the updated score_events.py.");
  process.exit(1);
}

writeFileSync(dest, JSON.stringify(data, null, 2));
const c = data.meta.counts || {};
console.log(`✓ Imported ${data.events.length} events (run ${data.meta.run_date}) → public/events.json`);
console.log(`  Top Events ${c["Top Events"] ?? 0} · Worth it ${c["Worth it"] ?? 0} · Monitor ${c["Monitor"] ?? 0}`);
console.log(`  Next: vercel deploy --prod   (or commit & push if the project auto-deploys)`);
