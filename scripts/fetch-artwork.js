/*
 * Fetch TMDB poster + backdrop paths for every title in data/movies.json.
 *
 *   node scripts/fetch-artwork.js            # fill in anything missing
 *   node scripts/fetch-artwork.js --refresh  # re-fetch everything
 *   node scripts/fetch-artwork.js --dry-run  # show matches, write nothing
 *
 * Only the path fragments are stored (e.g. "/abc123.jpg"); the images
 * themselves are always loaded from TMDB's CDN, never copied here.
 *
 * TMDB's API terms cap caching at six months, so re-run this occasionally
 * with --refresh rather than treating the stored paths as permanent.
 *
 * The key is read from tmdb.key in the project root, which is gitignored.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MOVIES = path.join(ROOT, 'public', 'data', 'movies.json');
const KEY_FILE = path.join(ROOT, 'tmdb.key');

const REFRESH = process.argv.includes('--refresh');
const DRY_RUN = process.argv.includes('--dry-run');

function readKey() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error('\nNo tmdb.key found.\n');
    console.error('  1. Copy tmdb.key.example to tmdb.key');
    console.error('  2. Paste your TMDB v3 API key into it as the only contents');
    console.error('  3. Run this again\n');
    process.exit(1);
  }
  const key = fs.readFileSync(KEY_FILE, 'utf8').trim();
  if (!key || key.startsWith('PASTE_')) {
    console.error('\ntmdb.key still has the placeholder in it — paste your real key.\n');
    process.exit(1);
  }
  return key;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function tmdb(key, endpoint, params) {
  const url = 'https://api.themoviedb.org/3' + endpoint + '?'
    + new URLSearchParams({ api_key: key, ...params });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; }
    if (res.status === 401) throw new Error('TMDB rejected the key (401). Check tmdb.key.');
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

// Titles that TMDB files under a different name than this tracker uses,
// or where a plain search picks the wrong thing.
const SEARCH_OVERRIDES = {
  'loki': { query: 'Loki', year: 2021 },
  'loki-s2': { query: 'Loki', year: 2021 },
  'guardians-holiday-special': { query: 'The Guardians of the Galaxy Holiday Special', year: 2022 },
  'thunderbolts': { query: 'Thunderbolts', year: 2025 },
  'cap-4': { query: 'Captain America: Brave New World', year: 2025 },
  'spiderman-4': { query: 'Spider-Man: Brand New Day', year: 2026 }
};

function searchFor(entry) {
  const o = SEARCH_OVERRIDES[entry.id];
  if (o) return o;
  return { query: entry.title.replace(/\*$/, ''), year: entry.year };
}

// A series and its seasons share one TMDB show, so both Loki entries
// resolve to the same artwork — which is correct.
async function lookup(key, entry) {
  const { query, year } = searchFor(entry);
  const isSeries = entry.type === 'series';
  const endpoint = isSeries ? '/search/tv' : '/search/movie';
  const yearKey = isSeries ? 'first_air_date_year' : 'primary_release_year';

  let data = await tmdb(key, endpoint, { query, [yearKey]: year });
  if (!data || !data.results || !data.results.length) {
    data = await tmdb(key, endpoint, { query });          // retry without the year
  }
  if (!data || !data.results || !data.results.length) return null;

  const hit = data.results[0];
  return {
    tmdbId: hit.id,
    matched: hit.title || hit.name,
    poster: hit.poster_path || null,
    backdrop: hit.backdrop_path || null
  };
}

(async () => {
  const key = readKey();
  const data = JSON.parse(fs.readFileSync(MOVIES, 'utf8'));
  const entries = data.phases.flatMap(p => p.movies);

  const todo = entries.filter(e => REFRESH || !(e.art && e.art.poster));
  console.log(`${entries.length} titles total, ${todo.length} to look up`
    + (DRY_RUN ? '  (dry run — nothing will be written)' : ''));

  const found = {}, missing = [], suspicious = [];
  for (const entry of todo) {
    let hit = null;
    try { hit = await lookup(key, entry); }
    catch (e) { console.error('\n' + e.message); process.exit(1); }

    if (!hit || !hit.poster) {
      missing.push(entry.id);
      console.log('  --  ' + entry.title.padEnd(46) + 'no artwork found');
    } else {
      found[entry.id] = hit;
      const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const close = clean(hit.matched).includes(clean(entry.title).slice(0, 10))
        || clean(entry.title).includes(clean(hit.matched).slice(0, 10));
      if (!close) suspicious.push(`${entry.id}: "${entry.title}" -> TMDB "${hit.matched}"`);
      console.log('  ok  ' + entry.title.padEnd(46) + hit.matched);
    }
    await sleep(120);
  }

  if (suspicious.length) {
    console.log('\nCheck these matches — the titles differ noticeably:');
    suspicious.forEach(s => console.log('  ! ' + s));
  }
  if (missing.length) console.log('\nNo artwork (will keep their fallback tiles): ' + missing.join(', '));

  if (DRY_RUN) { console.log('\nDry run — no changes written.'); return; }

  // Write art blocks into movies.json, preserving the file's formatting.
  // Each entry is located by brace-matching so edits can't leak into a
  // neighbour, and the block goes immediately BEFORE the summary line —
  // summary is the last property on unreleased entries, so inserting after
  // it would land on a line with no trailing comma.
  let text = fs.readFileSync(MOVIES, 'utf8').replace(/\r\n/g, '\n');

  function entryBounds(t, id) {
    const idAt = t.indexOf('"id": ' + JSON.stringify(id) + ',');
    if (idAt === -1) return null;
    // "id" is always the first property, so the nearest preceding brace opens
    // this entry — don't assume a newline before it, entries aren't always
    // separated the same way once the file has been hand-edited
    const start = t.lastIndexOf('{', idAt);
    let i = t.indexOf('{', start), depth = 0, inStr = false, esc = false;
    for (; i < t.length; i++) {
      const c = t[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return { start, end: i + 1 }; }
    }
    return null;
  }

  let written = 0;
  for (const [id, hit] of Object.entries(found)) {
    const b = entryBounds(text, id);
    if (!b) continue;
    let block = text.slice(b.start, b.end);

    block = block.replace(/\n {10}"art": \{[^}]*\},/, '');   // drop any previous one
    const line = '          "art": { "tmdbId": ' + hit.tmdbId
      + ', "poster": ' + JSON.stringify(hit.poster)
      + ', "backdrop": ' + JSON.stringify(hit.backdrop) + ' },\n';
    const sumAt = block.indexOf('\n          "summary": ');
    if (sumAt === -1) continue;
    block = block.slice(0, sumAt + 1) + line + block.slice(sumAt + 1);

    text = text.slice(0, b.start) + block + text.slice(b.end);
    written++;
  }

  JSON.parse(text);                       // fail loudly rather than write bad JSON
  fs.writeFileSync(MOVIES, text);
  console.log(`\nwrote artwork for ${written} titles into data/movies.json`);
  console.log('re-run with --refresh every few months to stay inside TMDB\'s caching terms');
})();
