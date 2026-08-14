#!/usr/bin/env node
/**
 * check-data.js — reads data/movies.json, data/characters.json and
 * data/progress.json and reports anything that looks broken. Read-only:
 * it never writes a file. Run it after hand-editing:
 *
 *   npm run check
 *
 * ERROR   something is actually broken — a missing required field, a
 *         duplicate id, a reference that points at nothing.
 * WARNING probably a mistake, but the app still renders — a link that
 *         silently degraded to plain text, a convention not followed.
 * NOTE    worth an eye, nothing wrong.
 *
 * The silent failures are the point. A typo in a watchFirst id, or a
 * watchFor name that no longer matches a character, doesn't throw and
 * doesn't look wrong on the page — the chip just stops being a link.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// movies.json and characters.json live inside public/ so a static host serves
// them; progress.json stays outside it, since it must never be served.
// MCU_DATA points the checker at a copy, used to test the checker itself.
const DATA = process.env.MCU_DATA || path.join(ROOT, 'public', 'data');
const LEGACY_DATA = process.env.MCU_DATA || path.join(ROOT, 'data');

const errors = [];
const warnings = [];
const notes = [];
const err = (where, msg) => errors.push({ where, msg });
const warn = (where, msg) => warnings.push({ where, msg });
const note = (where, msg) => notes.push({ where, msg });

// --- load ----------------------------------------------------------------
// A JSON syntax error is fatal and worth reporting precisely: node gives a
// character offset, which is useless on its own in a 10k-line file.
function loadJson(file, { optional = false, dir = DATA } = {}) {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) {
    if (!optional) err(file, 'File is missing.');
    return null;
  }
  const text = fs.readFileSync(full, 'utf-8');
  try {
    return JSON.parse(text);
  } catch (e) {
    // Node reports a character offset, which is useless in a 10k-line file.
    // Newer versions add their own "(line N column N)" — drop it so the
    // message doesn't say the same thing twice.
    const at = /position (\d+)/.exec(e.message);
    const why = e.message.replace(/\s*\(line \d+ column \d+\)/, '').replace(/\s*in JSON at position \d+/, '');
    let place = '';
    if (at) {
      const upto = text.slice(0, Number(at[1]));
      const line = upto.split('\n').length;
      const col = upto.length - upto.lastIndexOf('\n');
      place = ` — line ${line}, column ${col}`;
      const context = text.split('\n')[line - 1];
      if (context) place += `\n            ${context.trim().slice(0, 120)}`;
    }
    err(file, `Not valid JSON: ${why}${place}`);
    return null;
  }
}

const movies = loadJson('movies.json');
const chars = loadJson('characters.json');
// The legacy save file, still worth checking for ids orphaned by a rename
const progress = loadJson('progress.json', { optional: true, dir: LEGACY_DATA });

if (!movies) {
  report();
  process.exit(1);
}

// --- index everything ----------------------------------------------------
const ENTRY_KEYS = new Set([
  'id', 'title', 'year', 'narrativeOrder', 'releaseOrder', 'type', 'summary',
  'art', 'beforeWatch', 'optionalViewing', 'inUniverseSetting', 'timeSkip',
  'deepDive', 'watchFor', 'postCredit', 'released', 'expectedRelease', 'seasons'
]);
const EPISODE_KEYS = new Set([
  'id', 'episodeNumber', 'title', 'summary', 'watchFor', 'postCredit',
  'inUniverseSetting', 'timeSkip', 'runtime', 'art',
  // Episodes carry their own deepDive.plot now, so each one has a recap behind
  // the spoiler toggle instead of only the series having one.
  'deepDive'
]);
const REQUIRED = ['id', 'title', 'year', 'narrativeOrder', 'releaseOrder', 'type', 'summary'];
const TYPES = new Set(['movie', 'series', 'special']);

const entries = [];        // every top-level entry, with its phase
const unitIds = new Set();  // everything progress can be keyed by
const entryIds = new Set(); // top-level ids only (what watchFirst may point at)
const phaseIds = new Set();
const seenIds = new Map();  // id -> where first seen, for duplicate detection

function claimId(id, where) {
  if (seenIds.has(id)) err(where, `Duplicate id "${id}" — already used by ${seenIds.get(id)}.`);
  else seenIds.set(id, where);
}

(movies.phases || []).forEach(phase => {
  phaseIds.add(phase.id);
  (phase.movies || []).forEach(entry => {
    entries.push({ entry, phase });
    if (entry.id) {
      entryIds.add(entry.id);
      unitIds.add(entry.id);
      claimId(entry.id, `${phase.id}`);
    }
    (entry.seasons || []).forEach(season => {
      (season.episodes || []).forEach(ep => {
        if (ep.id) {
          unitIds.add(ep.id);
          claimId(ep.id, `${entry.id} S${season.seasonNumber}`);
        }
      });
    });
  });
});

const charById = new Map((chars?.characters || []).map(c => [c.id, c]));

// Mirrors normalizeCharName() + resolveWatchForCharacter() in public/app.js.
// Keep the two in step: a checker that models the matcher loosely reports
// links as broken when the page renders them perfectly well.
const normName = s => String(s).toLowerCase().replace(/\(.*?\)/g, '').replace(/["'.’]/g, '').trim();

const charByName = new Map();
(chars?.characters || []).forEach(c => {
  charByName.set(normName(c.name), c);
  String(c.name).split('/').forEach(part => charByName.set(normName(part), c));
});

function resolveWatchFor(w) {
  if (w.characterId) return charById.get(w.characterId) || null;
  const whole = charByName.get(normName(w.name));
  if (whole) return whole;
  for (const part of String(w.name || '').split('/')) {
    const hit = charByName.get(normName(part));
    if (hit) return hit;
  }
  return null;
}

// --- movies.json ---------------------------------------------------------
(movies.phases || []).forEach(phase => {
  const where = phase.id || '(phase with no id)';
  if (!phase.id) err('movies.json', 'A phase has no id.');
  if (!phase.name) err(where, 'Phase has no name.');

  const narrative = new Map();
  (phase.movies || []).forEach(entry => {
    const at = `${where} / ${entry.id || entry.title || '(unnamed entry)'}`;

    REQUIRED.forEach(k => {
      if (entry[k] === undefined) err(at, `Missing required field "${k}".`);
    });
    if (entry.type && !TYPES.has(entry.type)) {
      err(at, `type is "${entry.type}" — must be movie, series or special.`);
    }

    // A misspelled key is invisible: the app just ignores it and the section
    // silently vanishes from the page.
    Object.keys(entry).forEach(k => {
      if (!ENTRY_KEYS.has(k)) warn(at, `Unrecognised field "${k}" — typo? The app ignores it.`);
    });

    if (typeof entry.narrativeOrder === 'number') {
      if (narrative.has(entry.narrativeOrder)) {
        err(at, `narrativeOrder ${entry.narrativeOrder} is also used by "${narrative.get(entry.narrativeOrder)}".`);
      } else {
        narrative.set(entry.narrativeOrder, entry.id);
      }
    }

    const released = entry.released !== false;
    if (!released && !entry.expectedRelease) {
      warn(at, 'released:false but no expectedRelease.');
    }

    // series shape
    if (entry.type === 'series' && released) {
      if (!Array.isArray(entry.seasons) || !entry.seasons.length) {
        err(at, 'A released series needs a seasons array (always nested, even for one season).');
      } else {
        entry.seasons.forEach(season => {
          if (!Array.isArray(season.episodes) || !season.episodes.length) {
            err(at, `Season ${season.seasonNumber} has no episodes.`);
          }
          (season.episodes || []).forEach(ep => {
            if (!ep.id) err(at, `An episode in season ${season.seasonNumber} has no id.`);
            if (!ep.title) err(at, `Episode ${ep.id || '?'} has no title.`);
            Object.keys(ep).forEach(k => {
              if (!EPISODE_KEYS.has(k)) warn(at, `Episode ${ep.id}: unrecognised field "${k}".`);
            });
          });
        });
      }
    }
    if (entry.type !== 'series' && entry.seasons) {
      warn(at, `Has seasons but type is "${entry.type}".`);
    }

    // beforeWatch — the two spoiler-sensitive fields
    if (entry.beforeWatch) {
      const bw = entry.beforeWatch;
      Object.keys(bw).forEach(k => {
        if (!['context', 'watchFirst'].includes(k)) warn(at, `beforeWatch has unrecognised field "${k}".`);
      });
      if (bw.watchFirst !== undefined) {
        if (!Array.isArray(bw.watchFirst)) {
          err(at, 'beforeWatch.watchFirst must be an array of entry ids.');
        } else {
          bw.watchFirst.forEach(id => {
            if (!entryIds.has(id)) err(at, `watchFirst points at "${id}", which is not an entry id.`);
          });
        }
      }
      if (bw.context !== undefined && typeof bw.context !== 'string') {
        err(at, 'beforeWatch.context must be a string.');
      }
    }

    // optionalViewing — an id becomes a link, anything else renders as a plain
    // chip. A typo'd id therefore looks completely normal on the page.
    if (entry.optionalViewing !== undefined) {
      if (typeof entry.optionalViewing === 'string') {
        note(at, 'optionalViewing is a string — renders as prose. An array renders as chips.');
      } else if (!Array.isArray(entry.optionalViewing)) {
        err(at, 'optionalViewing must be an array (or a string).');
      } else {
        entry.optionalViewing.forEach(v => {
          if (typeof v !== 'string') return err(at, 'optionalViewing items must be strings.');
          // Looks like one of our ids but isn't one → almost certainly a typo
          if (!entryIds.has(v) && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(v)) {
            warn(at, `optionalViewing "${v}" looks like an entry id but matches none — it will render as a plain chip, not a link.`);
          }
        });
      }
    }

    // watchFor — the two-tier spoiler payloads, plus character linking
    if (entry.watchFor !== undefined) {
      if (!Array.isArray(entry.watchFor)) {
        err(at, 'watchFor must be an array.');
      } else {
        entry.watchFor.forEach((w, i) => {
          const tag = `watchFor[${i}] ${w.name ? `"${w.name}"` : '(no name)'}`;
          if (!w.name) err(at, `${tag} has no name.`);
          Object.keys(w).forEach(k => {
            if (!['name', 'thisFilm', 'future', 'spoils', 'characterId', 'nameIsSpoiler'].includes(k)) {
              warn(at, `${tag}: unrecognised field "${k}".`);
            }
          });
          // A name with no payloads is a deliberate pattern — a thing to keep
          // an eye on that needs no explanation. Only flag it when the name is
          // also hidden, because then the item renders nowhere at all.
          if (!w.thisFilm && !w.future && w.nameIsSpoiler) {
            err(at, `${tag} is nameIsSpoiler with no thisFilm or future — it renders nowhere at all.`);
          }
          if (w.spoils && !w.future) warn(at, `${tag} has spoils but no future.`);
          if (w.characterId && !charById.has(w.characterId)) {
            err(at, `${tag}: characterId "${w.characterId}" matches no character.`);
          }
        });
      }
    }

    if (entry.postCredit) {
      Object.keys(entry.postCredit).forEach(k => {
        if (!['count', 'type', 'timing', 'skipNote'].includes(k)) {
          warn(at, `postCredit has unrecognised field "${k}".`);
        }
      });
    }

    if (entry.art) {
      ['poster', 'backdrop'].forEach(k => {
        if (entry.art[k] && /^https?:/.test(entry.art[k])) {
          err(at, `art.${k} is a full URL — store only the TMDB path fragment (re-run scripts/fetch-artwork.js).`);
        }
      });
    }
  });

  // narrativeOrder should be 1..n with no gaps — a gap usually means a
  // half-finished reorder
  const nums = [...narrative.keys()].sort((a, b) => a - b);
  if (nums.length) {
    const expected = Array.from({ length: nums.length }, (_, i) => i + 1);
    if (nums.join(',') !== expected.join(',')) {
      warn(where, `narrativeOrder runs ${nums.join(', ')} — expected 1–${nums.length} with no gaps or repeats.`);
    }
  }
});

// releaseOrder is a global sequence, so duplicates are checked across phases
const byRelease = new Map();
entries.forEach(({ entry }) => {
  if (typeof entry.releaseOrder !== 'number') return;
  if (byRelease.has(entry.releaseOrder)) {
    warn('movies.json', `releaseOrder ${entry.releaseOrder} used by both "${byRelease.get(entry.releaseOrder)}" and "${entry.id}".`);
  } else {
    byRelease.set(entry.releaseOrder, entry.id);
  }
});

// --- characters.json -----------------------------------------------------
const CHAR_KEYS = new Set(['id', 'name', 'description', 'titles', 'image', 'imagePosition', 'phases']);

if (chars) {
  const seenChar = new Set();
  (chars.characters || []).forEach(c => {
    const at = `characters / ${c.id || c.name || '(unnamed)'}`;
    ['id', 'name', 'description', 'titles', 'phases'].forEach(k => {
      if (c[k] === undefined) err(at, `Missing required field "${k}".`);
    });
    Object.keys(c).forEach(k => {
      if (!CHAR_KEYS.has(k)) warn(at, `Unrecognised field "${k}" — typo? The app ignores it.`);
    });

    if (c.id) {
      if (seenChar.has(c.id)) err(at, `Duplicate character id "${c.id}".`);
      seenChar.add(c.id);
    }

    if (Array.isArray(c.titles)) {
      c.titles.forEach(t => {
        if (!entryIds.has(t)) err(at, `titles lists "${t}", which is not an entry id.`);
      });
      // convention: unreleased titles are excluded from the cast filter
      c.titles.forEach(t => {
        const found = entries.find(e => e.entry.id === t);
        if (found && found.entry.released === false) {
          warn(at, `titles includes "${t}", which is unreleased — convention is to leave those out.`);
        }
      });
    } else if (c.titles !== undefined) {
      err(at, 'titles must be an array of entry ids.');
    }

    if (c.phases && typeof c.phases === 'object') {
      Object.keys(c.phases).forEach(p => {
        if (!phaseIds.has(p)) err(at, `phases has key "${p}", which is not a phase id.`);
      });
    }

    if (c.image) {
      const rel = path.join('public', 'img', 'characters', path.basename(c.image));
      const guess = path.join(ROOT, c.image.startsWith('img/') ? path.join('public', c.image) : rel);
      if (!fs.existsSync(guess)) err(at, `image "${c.image}" — no file found at ${path.relative(ROOT, guess)}.`);
    }
  });
}

// --- cross-file: the silent link failures --------------------------------
// A watchFor tag renders as a link only if it resolves to a character. When it
// doesn't, the page looks completely normal — so list them and let the human
// decide which are deliberate ("The Tesseract") and which are broken.
const unlinked = [];
entries.forEach(({ entry, phase }) => {
  (entry.watchFor || []).forEach(w => {
    if (!resolveWatchFor(w)) unlinked.push(`${phase.id}/${entry.id}: "${w.name}"`);
  });
  (entry.seasons || []).forEach(s => (s.episodes || []).forEach(ep => {
    (ep.watchFor || []).forEach(w => {
      if (!resolveWatchFor(w)) unlinked.push(`${phase.id}/${ep.id}: "${w.name}"`);
    });
  }));
});
if (unlinked.length) {
  note('watchFor → character', `${unlinked.length} tag(s) render as plain text, not links. Concepts (\"The Tesseract\") belong here; people probably don't:\n    ` + unlinked.join('\n    '));
}

// A character in a film's watchFor should normally list that film in titles
if (chars) {
  const missing = [];
  entries.forEach(({ entry }) => {
    (entry.watchFor || []).forEach(w => {
      const c = resolveWatchFor(w);
      if (c && Array.isArray(c.titles) && !c.titles.includes(entry.id)) {
        missing.push(`${c.id} is a watchFor tag on "${entry.id}" but doesn't list it in titles`);
      }
    });
  });
  if (missing.length) note('characters ↔ watchFor', `${missing.length} mismatch(es):\n    ` + missing.join('\n    '));
}

// --- house style: em dashes -----------------------------------------------
// Not an error, and not a grammar problem. Em dashes are correct punctuation.
// They're counted because LLMs overuse them badly, so a page full of them
// reads as machine-written, and the prose here is being rewritten by hand to
// avoid exactly that. Counts per phase, so progress is visible.
{
  const perPhase = new Map();
  (movies.phases || []).forEach(phase => {
    let n = 0;
    const look = s => { if (typeof s === 'string' && s.includes('—')) n++; };
    (phase.movies || []).forEach(entry => {
      look(entry.summary);
      look(entry.beforeWatch && entry.beforeWatch.context);
      if (entry.deepDive) ['plot', 'significance', 'orderNote'].forEach(k => look(entry.deepDive[k]));
      (entry.watchFor || []).forEach(w => { look(w.thisFilm); look(w.future); });
      if (entry.postCredit) look(entry.postCredit.skipNote);
      (entry.seasons || []).forEach(s => (s.episodes || []).forEach(ep => {
        look(ep.summary);
        (ep.watchFor || []).forEach(w => { look(w.thisFilm); look(w.future); });
      }));
    });
    if (n) perPhase.set(phase.id, n);
  });
  if (perPhase.size) {
    const total = [...perPhase.values()].reduce((a, b) => a + b, 0);
    note('house style', `${total} field(s) still contain an em dash: ` +
      [...perPhase].map(([p, n]) => `${p} ${n}`).join(', '));
  }
}

// --- progress.json: orphaned save keys ------------------------------------
// Renaming an id silently orphans its watch history. Nothing in the app will
// tell you; the title just goes back to unwatched.
if (progress) {
  const orphans = Object.keys(progress).filter(k => k !== '_watching' && !unitIds.has(k));
  if (orphans.length) {
    warn('progress.json', `${orphans.length} saved entr${orphans.length === 1 ? 'y' : 'ies'} no longer match any id — watch history for these is stranded (did an id get renamed?):\n    ` + orphans.join(', '));
  }
  const flags = progress._watching || [];
  flags.filter(id => !unitIds.has(id)).forEach(id => {
    warn('progress.json', `_watching points at "${id}", which is not an id any more.`);
  });
}

// --- report ---------------------------------------------------------------
function report() {
  const block = (label, list) => {
    if (!list.length) return;
    console.log(`\n${label} (${list.length})`);
    list.forEach(({ where, msg }) => console.log(`  [${where}] ${msg}`));
  };
  block('ERRORS', errors);
  block('WARNINGS', warnings);
  block('NOTES', notes);

  console.log('');
  if (!errors.length && !warnings.length) {
    console.log(`All clear — ${entries.length} entries, ${unitIds.size} watchable units, ${charById.size} characters.`);
  } else {
    console.log(`${errors.length} error(s), ${warnings.length} warning(s), ${notes.length} note(s).`);
  }
}

report();
process.exit(errors.length ? 1 : 0);
