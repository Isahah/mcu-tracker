#!/usr/bin/env node
/**
 * prose-check.js — the mechanical half of the writing-check skill, as a
 * script instead of something rebuilt from scratch every session. Read-only.
 *
 *   npm run prose                    one line per entry, worst first
 *   npm run prose eternals           every flag on one entry, with context
 *   npm run prose -- --phase phase-5 one phase only
 *   npm run prose -- --words         word counts only, for length comparisons
 *
 * WHAT THIS IS NOT. It cannot tell good prose from bad. Phase One (approved,
 * hand-written) and Phase Four score the same on it, and untouched Phase Five
 * scores best of all, because the original AI pass wrote short flat sentences
 * and the hand-written entries are longer and richer. So the counts run
 * backwards across the file and a low score is not a pass.
 *
 * Use it one way only: on text you have just written, before handing it back,
 * to catch the mechanical slips a read-through misses. Then read the thing.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.MCU_DATA || path.join(ROOT, 'public', 'data');
const movies = JSON.parse(fs.readFileSync(path.join(DATA, 'movies.json'), 'utf8'));

const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = n => { const i = argv.indexOf('--' + n); return i < 0 ? null : argv[i + 1]; };
const target = argv.find(a => !a.startsWith('--') && a !== opt('phase')) || null;

// ---------------------------------------------------------------- the rules

// Words and phrases from the "Words and phrases to avoid" list in CLAUDE.md,
// plus the patterns found in finished entries. A hit is a flag, not a verdict.
const BANNED = [
  // puffing up importance
  'testament', 'stands as', 'serves as', 'pivotal', 'crucial', 'turning point', 'watershed',
  'landmark', 'iconic', 'legendary', 'legacy', 'profound', 'indelible', 'cements', 'solidif',
  'underscore', 'highlight',
  // AI vocabulary
  'delve', 'tapestry', 'intricate', 'nuanced', 'multifaceted', 'interplay', 'compelling',
  'resonat', 'showcase', 'foster', 'bolster', 'embark', 'unravel', 'grappl',
  // editorializing and essay transitions
  "it's worth", 'worth noting', 'worth knowing', 'notably', 'interestingly', 'importantly',
  'remarkably', 'moreover', 'furthermore', 'additionally', 'in addition', 'that said', 'overall',
  // trailer and cliche plot talk
  'from the shadows', 'comes to a head', 'quietly', 'looming', 'shocking', 'sets the stage',
  'lays the groundwork', 'stakes have never',
  // "the film" doing human things
  'the film refuses', 'the film argues', 'the film insists', 'the film is careful',
  // intensifiers
  'absolutely', 'totally', 'completely', 'incredibly', 'extremely', 'utterly', 'truly', 'deeply',
  // banned outright
  'rather than', 'go in cold', 'dive into', 'unleash', 'game-changing',
  // critic vocabulary and the patterns found in finished entries
  'runs with', 'reach back', 'reaches back', 'arrives with', 'leans on', 'lands on', 'the run',
  'thread', 'deliberate', 'fresh', 'picks up', 'picked up', 'built on', 'load-bearing',
  'best scene', 'widely', 'takes nothing', 'leaves it there', 'ever since'
];

// A sentence or clause ending on one of these makes the reader do the work.
// A pronoun whose subject is named in the same sentence is fine, so this
// flags for a human to judge: it is the noisiest check here.
const TRAILING = new RegExp(
  '(?:\\b(?:it|them|this|that|those|these|one|ones|here|there|somewhere|anyway|ever since)' +
  '|(?:some|these|those|the|other|all|such|a few)\\s+(?:things?|stuff|elements?|aspects?))\\s*[.,;]',
  'gi');

// "nobody" opening the clause that closes a sentence, as in "a supply nobody
// knew about". Same family as TRAILING, but the word sits at the front of the
// vague clause instead of the end, so it needs its own pattern.
const NOBODY = /\b(?:nobody|no one)\b[^.;"]{0,34}(?=[.;"]|$)/gi;

// Banned words that are also somebody's name. Matched lowercase only, or the
// scan fires on every mention of Jane Foster.
const CASED = new Set(['foster']);

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every real entry title, read from the data so the list cannot drift. Titles
// legitimately contain colons, so they are blanked before the colon scan.
const TITLES = [];
for (const p of movies.phases) {
  for (const m of p.movies) {
    if (m.title.includes(':')) TITLES.push(m.title);
    (m.seasons || []).forEach(s => s.episodes.forEach(x => {
      if (x.title && x.title.includes(':')) TITLES.push(x.title);
    }));
  }
}
TITLES.sort((a, b) => b.length - a.length);

// ---------------------------------------------------------------- the fields

function fieldsOf(m) {
  const f = [];
  if (m.summary) f.push(['summary', m.summary]);
  if (m.beforeWatch && m.beforeWatch.context) f.push(['context', m.beforeWatch.context]);
  if (typeof m.optionalViewing === 'string') f.push(['optionalViewing', m.optionalViewing]);
  if (m.optionalViewing && m.optionalViewing.note) f.push(['optionalViewing.note', m.optionalViewing.note]);
  for (const k of ['plot', 'significance', 'orderNote']) {
    if (m.deepDive && m.deepDive[k]) f.push([k, m.deepDive[k]]);
  }
  if (m.postCredit && m.postCredit.skipNote) f.push(['skipNote', m.postCredit.skipNote]);
  (m.watchFor || []).forEach(w => {
    if (w.thisFilm) f.push(['card:' + w.name, w.thisFilm]);
    if (w.future) f.push(['future:' + w.name, w.future]);
  });
  (m.seasons || []).forEach(s => s.episodes.forEach(x => {
    const tag = 'e' + (s.seasonNumber > 1 ? s.seasonNumber + 'x' : '') + x.episodeNumber;
    if (x.summary) f.push([tag + '.summary', x.summary]);
    if (x.deepDive && x.deepDive.plot) f.push([tag + '.plot', x.deepDive.plot]);
    (x.watchFor || []).forEach(w => {
      if (w.thisFilm) f.push([tag + '.card:' + w.name, w.thisFilm]);
      if (w.future) f.push([tag + '.future:' + w.name, w.future]);
    });
  }));
  return f;
}

function scan(value) {
  const issues = [];
  let bare = value;
  for (const t of TITLES) bare = bare.split(t).join('@');

  if (bare.includes(':')) issues.push(['COLON', 'colon in prose, write two sentences']);
  if (value.includes('—')) issues.push(['EMDASH', 'em dash']);
  if (/[‘’“”]/.test(value)) issues.push(['CURLY', 'curly quote or apostrophe']);
  if (/\?/.test(value)) issues.push(['QUESTION', 'rhetorical question']);
  if (/[a-z]\.[A-Z]/.test(value)) issues.push(['NOSPACE', 'missing space after a full stop']);
  if (/\band also\b/i.test(value)) issues.push(['AND-ALSO', '"X and also Y"']);
  if (/\bnot (just )?[^.,]{1,40},? but\b/i.test(value)) issues.push(['NOT-X-BUT-Y', '"not X, but Y"']);
  if (/,\s+\w+ing\b[^.]{0,40}\.\s*$/.test(value)) issues.push(['ING-TAIL', '"-ing" tail adding an opinion']);
  if (/\bdo(es)? \w+,/.test(value)) issues.push(['EMPHATIC-DO', 'emphatic "do"/"does" faking a contrast']);

  const words = BANNED.filter(b => new RegExp('\\b' + esc(b), CASED.has(b) ? '' : 'i').test(value));
  if (words.length) issues.push(['WORDS', words.join(', ')]);

  const sentences = value.split(/(?<=[.!?])\s+/).filter(Boolean);
  const longest = sentences.reduce((a, s) => Math.max(a, s.trim().split(/\s+/).length), 0);
  if (longest > 32) issues.push(['LONG', longest + '-word sentence']);

  const opens = sentences.map(s => s.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z']/g, ''));
  for (let i = 2; i < opens.length; i++) {
    if (opens[i] && opens[i] === opens[i - 1] && opens[i] === opens[i - 2]) {
      issues.push(['REPEAT-OPEN', 'three sentences in a row opening on "' + opens[i] + '"']);
      break;
    }
  }

  const trail = [...value.matchAll(TRAILING)].map(m => {
    const s = Math.max(0, m.index - 44);
    return (s ? '...' : '') + value.slice(s, m.index + m[0].length);
  });
  if (trail.length) issues.push(['TRAILING', trail.join('  |  ')]);

  const nb = [...value.matchAll(NOBODY)].map(m => {
    const s = Math.max(0, m.index - 40);
    return (s ? '...' : '') + value.slice(s, m.index + m[0].length);
  });
  if (nb.length) issues.push(['NOBODY', nb.join('  |  ')]);

  return issues;
}

const words = s => s.trim().split(/\s+/).length;

// ---------------------------------------------------------------- the report

const rows = [];
for (const p of movies.phases) {
  if (opt('phase') && p.id !== opt('phase')) continue;
  for (const m of [...p.movies].sort((a, b) => a.narrativeOrder - b.narrativeOrder)) {
    const fields = fieldsOf(m);
    const flagged = fields.map(([k, v]) => [k, v, scan(v)]).filter(x => x[2].length);
    // Episode text is counted separately: a series entry carries one block of
    // text per episode, so its total is not comparable to a film's.
    const isEp = k => /^e\d/.test(k);
    rows.push({
      phase: p.id, id: m.id, title: m.title, released: m.released !== false,
      series: !!m.seasons, fields, flagged,
      words: fields.reduce((a, [, v]) => a + words(v), 0),
      topWords: fields.filter(([k]) => !isEp(k)).reduce((a, [, v]) => a + words(v), 0),
      cards: (m.watchFor || []).length
    });
  }
}

if (target) {
  const r = rows.find(x => x.id === target);
  if (!r) {
    console.error('no entry "' + target + '". ids: ' + rows.map(x => x.id).join(', '));
    process.exit(2);
  }
  console.log(r.title + '  (' + r.phase + ')');
  console.log(r.topWords + ' words across ' + r.fields.length + ' fields, ' + r.cards + ' cards' +
    (r.series ? ', plus ' + (r.words - r.topWords) + ' in the episodes' : '') + '\n');
  for (const [name, , issues] of r.flagged) {
    console.log('!! ' + name);
    for (const [code, detail] of issues) console.log('     ' + code.padEnd(12) + detail);
  }
  console.log('\n' + r.flagged.length + ' of ' + r.fields.length + ' fields flagged.');
  console.log('TRAILING needs a human: a pronoun whose subject is named in the same sentence is fine.');
  // Entry-level word counts for the approved references, episodes excluded, so
  // a film and a series can be compared on the same basis.
  const refs = rows.filter(x => ['cap-1', 'shang-chi', 'doctor-strange-2', 'loki-s2', 'wandavision', 'moon-knight'].includes(x.id));
  if (refs.length) {
    console.log('\nreference entries: ' + refs.map(x => x.id + ' ' + x.topWords).join(', '));
  }
} else if (flag('words')) {
  for (const r of rows) {
    console.log(r.phase.padEnd(9) + r.id.padEnd(26) + String(r.topWords).padStart(5) + ' words' +
      String(r.cards).padStart(4) + ' cards' +
      (r.series ? '  +' + (r.words - r.topWords) + ' in episodes' : '') +
      (r.released ? '' : '   (unreleased)'));
  }
} else {
  const worst = [...rows].sort((a, b) => b.flagged.length - a.flagged.length);
  for (const r of worst) {
    const codes = {};
    for (const [, , issues] of r.flagged) for (const [c] of issues) codes[c] = (codes[c] || 0) + 1;
    const summary = Object.entries(codes).sort((a, b) => b[1] - a[1])
      .map(([c, n]) => c + (n > 1 ? '*' + n : '')).join(' ');
    console.log(String(r.flagged.length).padStart(3) + '/' + String(r.fields.length).padEnd(4) +
      r.id.padEnd(26) + summary);
  }
  console.log('\nflagged fields / total fields, worst first. One entry: npm run prose <id>');
}
