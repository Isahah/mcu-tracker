#!/usr/bin/env node
/**
 * splice-entry.js — replace one entry in public/data/movies.json in place,
 * without reformatting the rest of the file.
 *
 *   node scripts/splice-entry.js <entry.json> [...]
 *
 * Each argument is a file holding one complete entry object, including its
 * "id". The entry with that id is found by brace-matching and swapped out.
 *
 * WHY THIS EXISTS. Two hazards, both of which have bitten this project:
 *
 * 1. movies.json is not uniformly formatted. Hand-edits have left some
 *    entries as `},{` on one line, so entry bounds have to come from
 *    brace-matching out from the nearest `{` before the `"id"`, never from
 *    assuming a newline. A naive line-based edit corrupts neighbours.
 *
 * 2. Writing the whole file back with JSON.stringify reformats every line of
 *    it. A 30-line content change arrives as a 2000-line diff, and real
 *    mistakes hide in the noise. An `art` block and the short string arrays
 *    (`watchFirst`, `titles`, `optionalViewing`) are kept on one line in most
 *    of the file, and JSON.stringify explodes all of them, so this script
 *    re-collapses them after serialising.
 *
 * Verifies that the entry count is unchanged and that the result still parses
 * before writing. Run `npm run check` afterwards regardless.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.MCU_DATA || path.join(ROOT, 'public', 'data');
const FILE = path.join(DATA, 'movies.json');

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('usage: node scripts/splice-entry.js <entry.json> [...]');
  process.exit(2);
}

// Entry bounds by brace-matching, skipping over braces inside strings.
function findBlock(src, id) {
  const marker = '"id": "' + id + '"';
  const at = src.indexOf(marker);
  if (at < 0) throw new Error('id not found in movies.json: ' + id);
  if (src.indexOf(marker, at + 1) >= 0) throw new Error('id appears twice: ' + id);
  const start = src.lastIndexOf('{', at);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('unbalanced braces around ' + id);
  const text = src.slice(start, end);
  if (!text.includes(marker)) throw new Error('bounds wrong for ' + id);
  return { start, end, text };
}

const STR = '"(?:[^"\\\\]|\\\\.)*"';
const ONE_LINE_ARRAYS = new RegExp(
  '"(watchFirst|titles|optionalViewing)": \\[\\n((?:[ \\t]*' + STR + ',?\\n)+)[ \\t]*\\]', 'g');

function render(entry, indent) {
  let out = JSON.stringify(entry, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : ' '.repeat(indent) + line))
    .join('\n');
  // art blocks live on one line throughout the file
  out = out.replace(/"art": \{\n[\s\S]*?\n[ \t]*\}/, (m) => {
    const o = JSON.parse(m.replace(/^"art":\s*/, ''));
    return '"art": { ' + Object.entries(o)
      .map(([k, v]) => JSON.stringify(k) + ': ' + JSON.stringify(v)).join(', ') + ' }';
  });
  // so do the short string arrays
  out = out.replace(ONE_LINE_ARRAYS, (m, key, body) =>
    '"' + key + '": [' + body.trim().split('\n')
      .map(s => s.trim().replace(/,$/, '')).join(',') + ']');
  return out;
}

const countEntries = o => o.phases.reduce((a, p) => a + p.movies.length, 0);

let src = fs.readFileSync(FILE, 'utf8');
const before = countEntries(JSON.parse(src));

for (const input of inputs) {
  const entry = JSON.parse(fs.readFileSync(input, 'utf8'));
  if (!entry.id) throw new Error('no id in ' + input);
  const block = findBlock(src, entry.id);
  // match the indentation the existing block sits at
  const lineStart = src.lastIndexOf('\n', block.start) + 1;
  const indent = block.start - lineStart;
  const next = src.slice(0, block.start) + render(entry, indent) + src.slice(block.end);
  const parsed = JSON.parse(next);
  if (countEntries(parsed) !== before) throw new Error('entry count changed on ' + entry.id);
  src = next;
  console.log('spliced ' + entry.id + ': ' + block.text.length + ' chars in, ' +
    (next.length - src.length + render(entry, indent).length) + ' out');
}

fs.writeFileSync(FILE, src);
console.log('wrote ' + FILE + '. Run npm run check.');
