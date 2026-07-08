// Genericize team owner names in public/events.json before committing.
// The live internal deploy keeps real names (deploy from the freshly imported
// file, then run this before git commit). Paula stays: this is her public repo.
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = new URL('../public/events.json', import.meta.url);
const KEEP = new Set(['Paula', 'Eve team']);

const data = JSON.parse(readFileSync(PATH, 'utf8'));
let scrubbed = 0;
for (const e of data.events) {
  if (e.owner && !KEEP.has(e.owner)) {
    e.owner = 'Eve team';
    scrubbed++;
  }
}
writeFileSync(PATH, JSON.stringify(data, null, 2) + '\n');
console.log(`scrubbed ${scrubbed} owner value(s); safe to commit.`);
