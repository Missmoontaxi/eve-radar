#!/usr/bin/env node
// Copy a freshly generated ecosystem.json from the ecosystem-qualifier skill into the app.
//   npm run import:ecosystem -- ../../Eve/outputs/ecosystem.json
// Validates the shape AND the privacy contract (aggregate-only — no person-level fields),
// then writes public/ecosystem.json.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dest = resolve(here, "..", "public", "ecosystem.json");

const src = process.argv[2];
if (!src) {
  console.error("Usage: npm run import:ecosystem -- <path-to>/outputs/ecosystem.json");
  process.exit(1);
}

let raw, data;
try {
  raw = readFileSync(resolve(process.cwd(), src), "utf8");
  data = JSON.parse(raw);
} catch (e) {
  console.error(`✗ Could not read/parse ${src}: ${e.message}`);
  process.exit(1);
}

if (!data || !data.meta || !data.portfolio || !Array.isArray(data.sources)) {
  console.error("✗ That doesn't look like an ecosystem.json (expected { meta, portfolio, sources:[] }).");
  process.exit(1);
}

// Privacy gate: the published feed must be aggregate-only. Person-level markers = hard stop.
for (const marker of ["linkedin.com", '"followup_date"', '"attio_stage"', '"company_title"']) {
  if (raw.includes(marker)) {
    console.error(`✗ PRIVACY GATE: payload contains person-level marker ${marker} — refusing to publish.`);
    console.error("  Regenerate with score_ecosystem.py (it writes the aggregate-only outputs/ecosystem.json).");
    process.exit(1);
  }
}
const missing = data.sources.find((s) => !s.slug);
if (missing) {
  console.error("✗ A source is missing a stable `slug` — regenerate with the updated score_ecosystem.py.");
  process.exit(1);
}

writeFileSync(dest, JSON.stringify(data, null, 2));
const p = data.portfolio;
console.log(`✓ Imported ${data.sources.length} sources (run ${data.meta.run_date}) → public/ecosystem.json`);
console.log(`  ${p.n} contacts · follow-up ${Math.round(p.followup_rate * 100)}% · demo ${Math.round(p.demo_rate * 100)}% · ${data.history.length} run(s) of history`);
console.log(`  Privacy gate passed: aggregate-only payload.`);
console.log(`  Next: vercel deploy --prod   (or commit & push if the project auto-deploys)`);
