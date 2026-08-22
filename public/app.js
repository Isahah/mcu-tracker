let phasesData = [];
let charactersData = [];
let progress = {};
let activePhaseId = null;
let watching = []; // up to 2 "currently watching" unit ids, kept in the save under _watching

const el = (id) => document.getElementById(id);

// --- The save file ---------------------------------------------------------
// Watch history lives in this browser, not on a server. That's what lets the
// site be hosted as static files with no backend: every visitor gets their own
// save, and nobody can overwrite anybody else's. The trade is that it's per
// browser and per device, and clearing site data wipes it, which is what the
// Export button on the menu is for.

const SAVE_KEY = 'mcu-field-log-progress';
const MIGRATED_KEY = 'mcu-field-log-migrated-from-server';

function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (err) {
    // A corrupted save shouldn't take the whole app down
    console.warn('Could not read save data, starting empty:', err);
    return {};
  }
}

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(progress));
    return true;
  } catch (err) {
    // Private-browsing modes and a full quota both land here
    saveDataStatus('Could not save. Your browser is blocking local storage.', true);
    return false;
  }
}

// One-time lift of an existing data/progress.json into this browser, so the
// switch away from the server doesn't look like the save was lost. Only fires
// when running against the local Express server; on the hosted site the fetch
// fails and a new visitor simply starts empty.
async function migrateFromServerOnce() {
  if (localStorage.getItem(MIGRATED_KEY)) return;
  // Only ever relevant against the local dev server. Skipping it elsewhere
  // keeps a failed request out of every public visitor's console.
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!isLocal) { localStorage.setItem(MIGRATED_KEY, 'not-applicable'); return; }
  if (Object.keys(readSave()).length) { localStorage.setItem(MIGRATED_KEY, 'skipped'); return; }
  try {
    const res = await fetch('/api/progress');
    if (!res.ok) throw new Error(String(res.status));
    const fromServer = await res.json();
    if (fromServer && typeof fromServer === 'object' && Object.keys(fromServer).length) {
      progress = fromServer;
      writeSave();
      console.info('Moved your existing save into this browser.');
    }
  } catch {
    // No server here, which is the normal case once this is hosted
  }
  localStorage.setItem(MIGRATED_KEY, 'done');
}

async function init() {
  // Relative, not root-absolute, so the site also works from a subfolder
  const [phasesRes, charactersRes] = await Promise.all([
    fetch('data/movies.json').then(r => r.json()),
    fetch('data/characters.json').then(r => r.json())
  ]);
  phasesData = phasesRes.phases;
  charactersData = charactersRes.characters;

  progress = readSave();
  await migrateFromServerOnce();

  el('back-btn').addEventListener('click', () => {
    location.hash = '';
  });

  el('characters-back-btn').addEventListener('click', () => {
    location.hash = '';
  });

  el('character-back-btn').addEventListener('click', () => {
    location.hash = 'characters';
  });

  el('char-search').addEventListener('input', renderCharacters);
  bindTitleBrowse();
  bindSaveData();

  // The close button lives inside #modal-content, which is re-rendered on every
  // open — so listen on the backdrop instead of binding the button directly
  el('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop' || e.target.closest('#modal-close')) closeModal();
  });

  watching = (progress._watching || []).filter(id => findItem(id));
  renderNowWatching();
  mountFooters();

  window.addEventListener('hashchange', route);
  route();
}

// --- "Currently watching" flags ---
// Up to 2 units can be flagged; flagging a third replaces the oldest. Marking a
// flagged unit watched advances its flag to the next unwatched unit in narrative
// order (see nextUnwatchedAfter); marking anything watched with no flags set
// bootstraps a flag on whatever comes next.

// Every watchable unit id (movies, specials, episodes) in global narrative order
function flatUnitIds() {
  const ids = [];
  phasesData.forEach(phase => {
    [...phase.movies].sort((a, b) => a.narrativeOrder - b.narrativeOrder).forEach(entry => {
      if (entry.released === false) return;
      if (entry.type === 'series' && entry.seasons) {
        entry.seasons.forEach(s => s.episodes.forEach(ep => ids.push(ep.id)));
      } else {
        ids.push(entry.id);
      }
    });
  });
  return ids;
}

function nextUnwatchedAfter(id) {
  const ids = flatUnitIds();
  for (let i = ids.indexOf(id) + 1; i < ids.length; i++) {
    if (!progress[ids[i]]?.watched && !watching.includes(ids[i])) return ids[i];
  }
  return null;
}

async function setWatching(ids) {
  watching = ids;
  progress._watching = ids;
  writeSave();
  renderNowWatching();
}

async function toggleFlag(id) {
  if (watching.includes(id)) {
    await setWatching(watching.filter(w => w !== id));
  } else {
    await setWatching([...watching, id].slice(-2)); // cap of 2 — oldest flag drops off
  }
}

function isCurrentlyWatching(entry) {
  if (watching.includes(entry.id)) return true;
  return entry.type === 'series' && entry.seasons
    ? seriesEpisodes(entry).some(ep => watching.includes(ep.id))
    : false;
}

// Short label for a flagged unit — series episodes read as "Loki S1E2"
function watchingLabel(found) {
  return found.series
    ? `${found.series.title} S${found.season.seasonNumber}E${found.item.episodeNumber}`
    : found.item.title;
}

// Fixed corner dock, visible on every screen; chips link to the flagged unit's page.
// The label is dropped when two units are flagged so both chips fit the pill.
function renderNowWatching() {
  const dock = el('now-watching-dock');
  const found = watching.map(id => ({ id, hit: findItem(id) })).filter(w => w.hit);
  if (!found.length) { dock.hidden = true; dock.innerHTML = ''; return; }
  dock.hidden = false;
  const label = found.length > 1 ? '' : '<span class="dock-label">Now watching</span>';
  dock.innerHTML = label + found.map(w =>
    `<a class="dock-chip" href="#/watch/${w.id}"><span>&#9654; ${watchingLabel(w.hit)}</span></a>`
  ).join('');
}

let lastRouteParts = [];

function route() {
  closeModal(); // e.g. following a watchFor character link from inside the series modal
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  const prev = lastRouteParts;
  lastRouteParts = parts;
  renderAppBar();

  if (parts[0] === 'watch' && parts[1]) {
    const found = findItem(parts[1]);
    // A series has no detail page of its own — send it to its phase list and
    // pop the episode picker, so "watch these first" chips work for shows too
    if (found && !found.series && found.item.type === 'series' && found.item.released !== false) {
      activePhaseId = found.phase.id;
      showScreen('phase');
      renderPhase();
      openEpisodeModal(found.item);
      window.scrollTo(0, 0);
      return;
    }
    if (found) {
      showScreen('detail');
      renderDetail(found);
      window.scrollTo(0, 0);
      return;
    }
  }

  if (parts[0] === 'characters') {
    // Keep filters when backing out of a character file, but clear them when the
    // database is opened fresh — otherwise it can look empty on a later visit
    if (prev[0] !== 'character') {
      el('char-search').value = '';
      el('title-input').value = '';
      charTitleFilter = null;
    }
    showScreen('characters');
    renderCharacters();
    window.scrollTo(0, 0);
    return;
  }

  if (parts[0] === 'character' && parts[1]) {
    const character = charactersData.find(c => c.id === parts[1]);
    if (character) {
      showScreen('character');
      renderCharacter(character);
      window.scrollTo(0, 0);
      return;
    }
  }

  const phase = phasesData.find(p => p.id === parts[0]);
  if (phase) {
    if (phase.id !== activePhaseId) phaseFilter = 'all'; // filter is per-visit, not sticky
    activePhaseId = phase.id;
    showScreen('phase');
    renderPhase();
    if (pendingSeriesModal) {
      // came back from an episode page — reopen the series pop-up it belongs to
      const series = phase.movies.find(m => m.id === pendingSeriesModal);
      pendingSeriesModal = null;
      if (series) openEpisodeModal(series);
    }
  } else {
    activePhaseId = null;
    showScreen('menu');
    renderMenu();
  }
  window.scrollTo(0, 0);
}

function showScreen(name) {
  el('screen-menu').hidden = name !== 'menu';
  el('screen-phase').hidden = name !== 'phase';
  el('screen-detail').hidden = name !== 'detail';
  el('screen-characters').hidden = name !== 'characters';
  el('screen-character').hidden = name !== 'character';
}

// Finds a movie or episode by id anywhere in the data, along with its parent phase
// (and parent series/season, for episodes)
function findItem(id) {
  for (const phase of phasesData) {
    for (const entry of phase.movies) {
      if (entry.id === id) return { item: entry, phase, series: null, season: null };
      if (entry.type === 'series' && entry.seasons) {
        for (const season of entry.seasons) {
          const ep = season.episodes.find(e => e.id === id);
          if (ep) return { item: ep, phase, series: entry, season };
        }
      }
    }
  }
  return null;
}

function seriesEpisodes(series) {
  return series.seasons.flatMap(s => s.episodes);
}

// --- watchFor → character page linking ---
// A watchFor tag links to #/character/<id> when either:
//   1. the watchFor item has an explicit "characterId" (always wins — use this in
//      movies.json when the name is phrasey, e.g. "Mysterio's frame job"), or
//   2. any "/"-segment of the watchFor name (parentheticals stripped, case-insensitive)
//      exactly matches any "/"-segment of a character's name in characters.json —
//      so "Kingpin / Wilson Fisk" or "Hawkeye (cameo)" link with no extra data.
// Unmatched names just render as plain tags, so nothing breaks if a name is unknown.

function normalizeCharName(s) {
  return s.toLowerCase().replace(/\(.*?\)/g, '').replace(/["'.’]/g, '').trim();
}

let charNameLookup = null;

function resolveWatchForCharacter(w) {
  if (w.characterId) {
    return charactersData.some(c => c.id === w.characterId) ? w.characterId : null;
  }
  if (!charNameLookup) {
    charNameLookup = new Map();
    charactersData.forEach(c => {
      charNameLookup.set(normalizeCharName(c.name), c.id);
      c.name.split('/').forEach(part => charNameLookup.set(normalizeCharName(part), c.id));
    });
  }
  if (charNameLookup.has(normalizeCharName(w.name))) return charNameLookup.get(normalizeCharName(w.name));
  for (const part of w.name.split('/')) {
    if (charNameLookup.has(normalizeCharName(part))) return charNameLookup.get(normalizeCharName(part));
  }
  return null;
}

function watchForTagHtml(w) {
  const charId = resolveWatchForCharacter(w);
  if (!charId) return `<span class="chip">${w.name}</span>`;
  return `<a class="chip" href="#/character/${charId}">${w.name}</a>`;
}

// A "unit" is a movie, or one episode of a series — used for progress counts
function unitCounts(entry) {
  if (entry.released === false) return { watched: 0, total: 0 };
  if (entry.type === 'series') {
    const episodes = seriesEpisodes(entry);
    const watched = episodes.reduce((n, ep) => n + (progress[ep.id]?.watched ? 1 : 0), 0);
    return { watched, total: episodes.length };
  }
  return { watched: progress[entry.id]?.watched ? 1 : 0, total: 1 };
}

function phaseCounts(phase) {
  return phase.movies.reduce((acc, entry) => {
    const { watched, total } = unitCounts(entry);
    acc.watched += watched;
    acc.total += total;
    return acc;
  }, { watched: 0, total: 0 });
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

// --- Title artwork (TMDB) ---
// An entry can carry `art: { poster, backdrop }` holding TMDB path fragments
// (e.g. "/abc123.jpg"). Until those are filled in, every art box falls back to
// a tinted monogram tile, so the layout is identical either way and nothing
// looks broken. The image itself is never filtered or overlaid — status is
// signalled by the ring on the box, which the stylesheet handles.
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'and', 'in', 'to', 'is']);

function titleInitials(title) {
  const words = title.replace(/[:&—-]/g, ' ').split(/\s+/)
    .filter(w => w && !SMALL_WORDS.has(w.toLowerCase()));
  if (!words.length) return title.slice(0, 2).toUpperCase();
  // one-word titles read better as two letters than a lone initial
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

// posterHtml(entry, tmdbSize, cssWidth, cssHeight, extraClass)
function posterHtml(entry, size, w, h, extraClass) {
  const cls = ['art', 'art--poster', extraClass].filter(Boolean).join(' ');
  const path = entry.art && entry.art.poster;
  if (!path) {
    return `<span class="${cls} no-photo--t${tintFor(entry.title)}"><span class="art-none">${titleInitials(entry.title)}</span></span>`;
  }
  return `<span class="${cls}"><img src="${TMDB_IMG}${size}${path}" alt="" width="${w}" height="${h}"`
    + ` loading="lazy" decoding="async" onload="this.classList.add('is-loaded')"></span>`;
}

function backdropSize() {
  return window.innerWidth > 1024 ? 'w1280' : 'w780';
}

// 10c "card wash": the backdrop becomes a card-level layer that fades out
// behind the content. Must be the FIRST child of the .dossier / #modal-content,
// which must in turn carry `has-wash`.
function cardWashHtml(entry) {
  const path = entry.art && entry.art.backdrop;
  if (!path) return `<span class="card-wash no-photo--t${tintFor(entry.title)}"></span>`;
  return `<span class="card-wash"><img src="${TMDB_IMG}${backdropSize()}${path}" alt=""`
    + ` loading="lazy" decoding="async" onload="this.classList.add('is-loaded')"></span>`;
}

// The hero carries the poster and the title. Inside a washed card the hero
// drops its own background, so no .title-hero__bg here — the wash does that job.
// `artEntry` is the title the artwork belongs to (a series, for an episode).
function titleHeroHtml(artEntry, titleText, kickerText, titleSize) {
  const chips = [];
  if (artEntry.inUniverseSetting) chips.push(`<span class="chip chip--fact">Set: ${artEntry.inUniverseSetting}</span>`);
  // long time-skip notes read badly as a chip; they're still in "When this happens"
  if (artEntry.timeSkip && artEntry.timeSkip.length <= 60) {
    chips.push(`<span class="chip chip--fact">${artEntry.timeSkip}</span>`);
  }
  return `
    <header class="title-hero">
      <div class="title-hero__body">
        ${posterHtml(artEntry, 'w342', 150, 225, 'title-hero__poster')}
        <div class="title-hero__text">
          <h2 class="page-title" style="font-size:${titleSize}px">${titleText}</h2>
          <p class="kicker">${kickerText}</p>
          ${chips.length ? `<div class="chip-row">${chips.join('')}</div>` : ''}
        </div>
      </div>
    </header>
  `;
}

// Artwork on/off for the phase list — a local display preference, so it lives
// in localStorage rather than the save file
function artEnabled() {
  return localStorage.getItem('mcu-art') !== 'off';
}

function setArtEnabled(on) {
  localStorage.setItem('mcu-art', on ? 'on' : 'off');
}

// The credit line every screen carries, per the artwork handoff
function footerHtml() {
  return `
    <footer class="site-footer">
      <p class="tmdb-credit">
        <img class="tmdb-logo" src="assets/tmdb.svg" alt="TMDB" width="273" height="36">
        This product uses the TMDB API but is not endorsed or certified by TMDB.
      </p>
      <p>Unofficial fan project. Not affiliated with, endorsed by or sponsored by Marvel or
         Disney. All titles, characters and logos are the property of their respective owners.</p>
    </footer>
  `;
}

function mountFooters() {
  document.querySelectorAll('.screen-inner').forEach(inner => {
    if (!inner.querySelector('.site-footer')) inner.insertAdjacentHTML('beforeend', footerHtml());
  });
}

// --- Save data: export / import ---
// progress.json is the one file in the project that can't be regenerated, and
// it's gitignored, so nothing backs it up. Export writes a self-describing
// wrapper; import hands the file to the server, which validates it whole and
// keeps a copy of what it replaced.

function saveDataStatus(message, isError) {
  const node = el('save-data-status');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', !!isError);
}

// A save file is either an export wrapper or a bare copy of progress.json
function progressFromFile(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const p = parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : parsed;
  return (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
}

function describeSave(p) {
  const entries = Object.entries(p).filter(([id]) => id !== '_watching');
  const watched = entries.filter(([, v]) => v && v.watched).length;
  const rated = entries.filter(([, v]) => v && typeof v.rating === 'number').length;
  return `${watched} watched, ${rated} rated`;
}

// Validation moved here from server.js when the save moved into the browser.
// The payload is checked whole: one bad entry rejects the lot, so a corrupt
// file can never half-overwrite a good save. Returns an error string, or null.
function validateSave(incoming) {
  for (const [id, value] of Object.entries(incoming)) {
    if (id === '_watching') {
      if (!Array.isArray(value) || value.length > 2 || !value.every(i => typeof i === 'string')) {
        return 'The "currently watching" list is not up to 2 ids.';
      }
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return `Entry "${id}" is not an object.`;
    const { watched, watchedAt, rating } = value;
    if (watched !== undefined && typeof watched !== 'boolean') return `Entry "${id}" has a non-boolean "watched".`;
    if (watchedAt !== undefined && watchedAt !== null && typeof watchedAt !== 'string') return `Entry "${id}" has an invalid "watchedAt".`;
    if (rating !== undefined && rating !== null && (typeof rating !== 'number' || rating < 0 || rating > 10)) {
      return `Entry "${id}" has a rating outside 0–10.`;
    }
  }
  return null;
}

async function exportProgress() {
  try {
    const data = readSave();
    const stamp = new Date().toISOString().slice(0, 10);
    const name = `mcu-field-log-${stamp}.json`;
    const payload = {
      app: 'mcu-field-log',
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: data
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    saveDataStatus(`Saved ${name} (${describeSave(data)}).`);
  } catch (err) {
    saveDataStatus(`Export failed: ${err.message}`, true);
  }
}

async function importProgress(file) {
  let incoming;
  try {
    incoming = progressFromFile(JSON.parse(await file.text()));
  } catch (err) {
    return saveDataStatus(`That file isn't valid JSON (${err.message}).`, true);
  }
  if (!incoming) return saveDataStatus("That file doesn't look like an MCU Field Log save.", true);

  const problem = validateSave(incoming);
  if (problem) return saveDataStatus(`Import refused: ${problem}`, true);

  const ok = confirm(
    `Restore from ${file.name}?\n\n` +
    `That file: ${describeSave(incoming)}\n` +
    `Right now: ${describeSave(progress)}\n\n` +
    `This replaces your current save. The one it replaces is kept in this browser ` +
    `as a single undo step, but only until the next import, so export a copy first if you're unsure.`
  );
  if (!ok) return saveDataStatus('Import cancelled. Nothing changed.');

  // One level of undo, since there's no longer a server keeping a backup file
  try { localStorage.setItem(SAVE_KEY + '-previous', JSON.stringify(progress)); } catch { /* not fatal */ }

  progress = incoming;
  if (!writeSave()) return;

  // Every screen reads the progress loaded at startup, so reload rather than
  // trying to re-sync each one
  location.reload();
}

function bindSaveData() {
  const exportBtn = el('export-btn');
  const importBtn = el('import-btn');
  const fileInput = el('import-file');
  if (!exportBtn || !importBtn || !fileInput) return;

  exportBtn.addEventListener('click', exportProgress);
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // so picking the same file twice still fires change
    if (file) importProgress(file);
  });
}

function overallCounts() {
  return phasesData.reduce((acc, phase) => {
    const { watched, total } = phaseCounts(phase);
    acc.watched += watched;
    acc.total += total;
    return acc;
  }, { watched: 0, total: 0 });
}

function pct(watched, total) {
  return total ? (watched / total) * 100 : 0;
}

// The "currently watching" card(s) at the top of the menu — the primary action.
// One card per flag; a flagged episode shows its series' name plus season progress.
function resumeCardHtml(id) {
  const found = findItem(id);
  if (!found) return '';
  const { item, phase, series, season } = found;
  const title = series ? series.title : item.title;
  const kind = series ? 'series' : (item.type === 'special' ? 'special' : 'film');
  const year = series ? series.year : item.year;

  let episodeLine = '';
  if (series) {
    const eps = season.episodes;
    const watchedInSeason = eps.filter(e => progress[e.id]?.watched).length;
    episodeLine = `
      <span class="resume-episode">Season ${season.seasonNumber} &middot; on episode ${item.episodeNumber} of ${eps.length}</span>
      <span class="progress"><span class="progress-track"><span class="progress-fill" style="width:${pct(watchedInSeason, eps.length)}%"></span></span></span>
    `;
  }

  return `
    <a class="resume-card" href="#/watch/${id}">
      ${posterHtml(series || item, 'w154', 64, 96)}
      <span>
        <span class="resume-kicker">Currently watching</span>
        <span class="resume-title">${title}</span>
        <span class="resume-meta">${phase.name} &middot; ${kind} &middot; ${year}</span>
        ${episodeLine}
      </span>
      <span class="resume-cta">Open &rarr;</span>
    </a>
  `;
}

// The app bar is fixed to the top of every screen, so it refreshes on each route
function renderAppBar() {
  const overall = overallCounts();
  el('app-bar-sub').textContent = `Narrative order · ${overall.watched} / ${overall.total}`;
}

function renderMenu() {
  const overall = overallCounts();

  el('overall-fill').style.width = `${pct(overall.watched, overall.total)}%`;
  el('overall-count').textContent = `${overall.watched} / ${overall.total} watched`;
  el('menu-kicker').textContent = `${phasesData.length} phases · ${overall.total} titles in story order`;

  el('resume-slot').innerHTML = watching.map(resumeCardHtml).join('');

  const grid = el('phase-grid');
  grid.innerHTML = '';

  phasesData.forEach((phase, i) => {
    const { watched, total } = phaseCounts(phase);
    const isComplete = total > 0 && watched === total;

    const card = document.createElement('a');
    card.className = 'phase-card' + (isComplete ? ' is-complete' : '');
    card.href = `#/${phase.id}`;
    card.innerHTML = `
      <span class="phase-index">${ROMAN[i] || i + 1}</span>
      <span class="phase-name">${phase.name}</span>
      <p class="phase-sub">${phase.label}</p>
      <span class="progress progress--sm">
        <span class="progress-track"><span class="progress-fill" style="width:${pct(watched, total)}%"></span></span>
        <span class="progress-count">${watched} / ${total}</span>
      </span>
    `;
    grid.appendChild(card);
  });

  el('menu-character-count').textContent = `${charactersData.length} files`;
}

// Monogram fallback for characters with no photo yet. The tint is hashed from the
// name so the same person always gets the same tile — otherwise the mosaic
// reshuffles on every render.
// Words that carry no identity, so they never earn a letter in a monogram.
// Without this "The Void" reads as TV and "The Avengers" as TA.
const MONOGRAM_SKIP = new Set(['the', 'of', 'a', 'an']);

function initialsFor(name) {
  const primary = name.split('/')[0].trim();
  // A dotted acronym (S.H.I.E.L.D., S.W.O.R.D.) is one word once the dots come
  // out. Left alone it splits into a single "word" and yields "S." as initials.
  const flat = /^(?:[A-Za-z]\.){2,}[A-Za-z]?\.?$/.test(primary)
    ? primary.replace(/\./g, '')
    : primary;
  const all = flat.split(/\s+/).filter(Boolean);
  const words = all.length > 1 ? all.filter(w => !MONOGRAM_SKIP.has(w.toLowerCase())) : all;
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || flat).slice(0, 2).toUpperCase();
}

function tintFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % 6) + 1;
}

function portraitInnerHtml(c, extraStyle) {
  const style = [c.imagePosition ? `object-position:${c.imagePosition}` : '', extraStyle || '']
    .filter(Boolean).join(';');
  // characters.json stores "/img/characters/x.png"; drop the leading slash so
  // the page works from a subfolder as well as from a domain root
  // For an org or a place the monogram is the intended treatment, not a missing
  // asset, so the tile carries its type instead of the "no photo on file" label.
  const kind = c.type ? ` no-photo--${c.type}` : '';
  return c.image
    ? `<img src="${c.image.replace(/^\//, '')}" alt="${c.name}"${style ? ` style="${style}"` : ''}>`
    : `<span class="no-photo no-photo--t${tintFor(c.name)}${kind}"${extraStyle ? ` style="${extraStyle}"` : ''}>${initialsFor(c.name)}</span>`;
}

// A phase counts as "seen" once the user has finished every released unit in it —
// this drives which character records are safe to open.
function phaseIsFinished(phase) {
  const c = phaseCounts(phase);
  return c.total > 0 && c.watched === c.total;
}

// UI-local database controls
let charSort = 'appearance';
let charTitleFilter = null; // entry id of the title whose cast is being shown, or null
let charKind = 'all';       // 'all' | 'people' | 'places' — see charMatchesKind

// A file with no "type" is a person. Orgs and places share one filter bucket:
// there are far fewer of them than there are people, and someone narrowing the
// grid is usually after "the non-person files", not orgs specifically.
function charMatchesKind(c) {
  if (charKind === 'people') return !c.type;
  if (charKind === 'places') return !!c.type;
  return true;
}

// Earliest phase the character has a record for — used by the "first appearance"
// sort. Characters with no records sort last, keeping the order stable.
function firstPhaseIndex(c) {
  if (!c.phases) return 99;
  for (let i = 0; i < phasesData.length; i++) {
    if (c.phases[phasesData[i].id]) return i;
  }
  return 99;
}

// --- Browse by film or series ---
// Filters the grid to the cast of one title, using each character's `titles`
// list in characters.json. Deliberately gated behind a collapsed, warning-
// labelled panel: a cast list gives away who turns up in something.

// Every released title, in narrative order, for the datalist
function browsableTitles() {
  return phasesData.flatMap(p =>
    [...p.movies].sort((a, b) => a.narrativeOrder - b.narrativeOrder).filter(m => m.released !== false)
  );
}

function titleIdFromLabel(label) {
  const match = browsableTitles().find(m => m.title.toLowerCase() === label.trim().toLowerCase());
  return match ? match.id : null;
}

function bindTitleBrowse() {
  el('mcu-titles').innerHTML = browsableTitles()
    .map(m => `<option value="${m.title.replace(/"/g, '&quot;')}"></option>`).join('');

  const head = el('title-browse-head');
  head.addEventListener('click', () => {
    const nowOpen = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(nowOpen));
    el('title-browse-body').hidden = !nowOpen;
    head.querySelector('.tb-title').innerHTML = `${nowOpen ? '&#9660;' : '&#9654;'} Browse by film or series`;
    if (nowOpen) el('title-input').focus();
  });

  const input = el('title-input');
  const apply = () => {
    const id = titleIdFromLabel(input.value);
    if (id) {
      charTitleFilter = id;
      renderCharacters();
    } else if (!input.value.trim()) {
      charTitleFilter = null;
      renderCharacters();
    }
  };
  input.addEventListener('change', apply); // fires when a datalist option is picked
  input.addEventListener('input', apply);
}

function clearTitleFilter() {
  charTitleFilter = null;
  el('title-input').value = '';
  renderCharacters();
}

function renderActiveFilter(shownCount) {
  const box = el('active-filter');
  if (!charTitleFilter) {
    box.innerHTML = `<span class="result-count">${shownCount} files</span>`;
    return;
  }
  const found = findItem(charTitleFilter);
  box.innerHTML = `
    <span class="filter-tag">${found.item.title}<a class="clear" href="#" role="button" aria-label="Clear title filter">&#10005;</a></span>
    <span class="result-count">${shownCount} file${shownCount === 1 ? '' : 's'} on record</span>
  `;
  box.querySelector('.clear').addEventListener('click', e => {
    e.preventDefault();
    clearTitleFilter();
  });
}

function renderDbControls() {
  el('db-controls').innerHTML = `
    <span class="segmented">
      <span class="seg-label">Sort</span>
      <a href="#"${charSort === 'appearance' ? ' class="is-active"' : ''} data-sort="appearance">First appearance</a>
      <a href="#"${charSort === 'az' ? ' class="is-active"' : ''} data-sort="az">A &ndash; Z</a>
    </span>
    <span class="segmented">
      <span class="seg-label">Show</span>
      <a href="#"${charKind === 'all' ? ' class="is-active"' : ''} data-kind="all">All</a>
      <a href="#"${charKind === 'people' ? ' class="is-active"' : ''} data-kind="people">People</a>
      <a href="#"${charKind === 'places' ? ' class="is-active"' : ''} data-kind="places">Places &amp; groups</a>
    </span>
    <span class="spacer"></span>
  `;
  el('db-controls').querySelectorAll('[data-sort]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      charSort = a.dataset.sort;
      renderCharacters();
    });
  });
  el('db-controls').querySelectorAll('[data-kind]').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      charKind = a.dataset.kind;
      renderCharacters();
    });
  });
}

// Character database: dense grid of photo + name cards. All other info lives on the
// per-character page (#/character/<id>) so browsing the grid can't spoil anything.
// Filtered live by the search box (name match, case-insensitive).
function renderCharacters() {
  el('char-db-kicker').textContent = `${charactersData.length} files on record`;
  renderDbControls();

  const grid = el('character-grid');
  grid.innerHTML = '';

  const query = el('char-search').value.trim().toLowerCase();
  let shown = charactersData.slice();
  if (charKind !== 'all') shown = shown.filter(charMatchesKind);
  if (charTitleFilter) shown = shown.filter(c => (c.titles || []).includes(charTitleFilter));
  if (query) shown = shown.filter(c => c.name.toLowerCase().includes(query));

  if (charSort === 'az') {
    // Stays purely alphabetical across both kinds: the point of A–Z is finding a
    // name you already have, and grouping first would mean knowing which group
    // it's in before you could look it up.
    shown.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const order = new Map(charactersData.map((c, i) => [c.id, i]));
    // People first, then places and organisations. Interleaving them by first
    // appearance put S.H.I.E.L.D. and Wakanda in among the Phase One cast, which
    // reads as a muddle rather than as one browsable list.
    shown.sort((a, b) =>
      (a.type ? 1 : 0) - (b.type ? 1 : 0)
      || firstPhaseIndex(a) - firstPhaseIndex(b)
      || order.get(a.id) - order.get(b.id));
  }

  renderActiveFilter(shown.length);

  if (!shown.length) {
    grid.innerHTML = '<p class="kicker" style="grid-column:1/-1; text-align:center; padding:32px 0">No matching files on record</p>';
    return;
  }

  shown.forEach(c => {
    const card = document.createElement('a');
    card.className = 'character-card';
    card.href = `#/character/${c.id}`;
    card.innerHTML = `
      <span class="portrait-wrap">${portraitInnerHtml(c)}</span>
      <span class="char-name"><span>${c.name}</span></span>
    `;
    grid.appendChild(card);
  });
}

// Full-page personnel file: portrait, spoiler-light overview, then the phase-by-phase
// accordion. Every phase is listed on every file, including the ones it has no entry for, so
// the list itself reveals nothing. Each row's state is driven by the *user's* progress:
// brass where they've finished the phase, crimson "NOT SEEN" where they haven't.
function renderCharacter(c) {
  el('character-content').innerHTML = `
    <div class="char-head">
      <div class="portrait-frame">${portraitInnerHtml(c, 'font-size:52px')}</div>
      <div>
        <h2 class="char-name-lg">${c.name}</h2>
        <p class="char-overview">${c.description}</p>
      </div>
    </div>

    <div class="section-rule">
      <p class="kicker">Phase-by-phase record</p>
      <p class="lede" style="margin:8px 0 16px; font-size:14px">Every phase is listed on every file, so the list itself spoils nothing. Open only the phases you've finished.</p>
      <div id="char-phase-list"></div>
    </div>
  `;

  const listEl = el('char-phase-list');
  phasesData.forEach(phase => {
    const record = c.phases && c.phases[phase.id];
    const seen = phaseIsFinished(phase);

    const block = document.createElement('div');
    block.className = seen ? 'has-record' : 'is-unseen';

    const header = document.createElement('button');
    header.className = 'phase-record-head';
    header.type = 'button';
    header.setAttribute('aria-expanded', 'false');
    header.innerHTML = `${phase.name}`
      + (seen ? '' : '<span class="rec-flag rec-flag--unseen">Not seen</span>')
      + `<span class="phase-record-sub">${phase.label}</span>`;

    const body = document.createElement('div');
    body.className = 'phase-record-body'
      + (record ? '' : ' is-empty')
      + (seen ? '' : ' is-unseen-warning');
    body.hidden = true; // collapsed by default — that's the spoiler protection
    body.textContent = record || 'No notable activity in this phase.';

    header.addEventListener('click', () => {
      const nowOpen = header.getAttribute('aria-expanded') !== 'true';
      header.setAttribute('aria-expanded', String(nowOpen));
      body.hidden = !nowOpen;
    });

    block.appendChild(header);
    block.appendChild(body);
    listEl.appendChild(block);
  });
}

function getActivePhase() {
  return phasesData.find(p => p.id === activePhaseId);
}

// UI-local filter for the phase list — reset whenever a different phase is opened
let phaseFilter = 'all';

const PHASE_FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'unwatched', label: 'Unwatched', test: e => e.released !== false && entryCounts(e).watched < entryCounts(e).total },
  { id: 'watched', label: 'Watched', test: e => { const c = entryCounts(e); return c.total > 0 && c.watched === c.total; } },
  { id: 'series', label: 'Series', test: e => e.type === 'series' }
];

function entryCounts(entry) {
  return unitCounts(entry);
}

// "2021 · series · 3 of 6 eps"
function caseMetaText(entry) {
  const kind = entry.type === 'series' ? 'series' : (entry.type === 'special' ? 'special' : 'film');
  const bits = [entry.year, kind];
  if (entry.type === 'series' && entry.released !== false) {
    const { watched, total } = unitCounts(entry);
    bits.push(`${watched} of ${total} eps`);
  }
  return bits.join(' · ');
}

function phaseNavHtml(phase) {
  const i = phasesData.indexOf(phase);
  const prev = phasesData[i - 1];
  const next = phasesData[i + 1];
  return (prev ? `<a class="nav-btn" href="#/${prev.id}">&larr; ${prev.name}</a>` : '')
    + (next ? `<a class="nav-btn" href="#/${next.id}">${next.name} &rarr;</a>` : '');
}

function renderFilterStrip(entries) {
  el('filter-strip').innerHTML = PHASE_FILTERS.map(f => {
    const n = entries.filter(f.test).length;
    return `<a class="filter-chip${f.id === phaseFilter ? ' is-active' : ''}" href="#" data-filter="${f.id}">${f.label}<span class="filter-count">${n}</span></a>`;
  }).join('')
    + '<span class="filter-spacer"></span>'
    + `<a class="filter-chip${artEnabled() ? ' is-active' : ''}" href="#" data-density><span class="chip-swatch"></span>Artwork</a>`
    + '<a class="filter-chip" href="#" data-jump="next">Next unwatched &darr;</a>';

  el('filter-strip').querySelectorAll('[data-filter]').forEach(chip => {
    chip.addEventListener('click', e => {
      e.preventDefault();
      phaseFilter = chip.dataset.filter;
      renderPhase();
    });
  });

  el('filter-strip').querySelector('[data-density]').addEventListener('click', e => {
    e.preventDefault();
    setArtEnabled(!artEnabled());
    renderPhase();
  });

  el('filter-strip').querySelector('[data-jump]').addEventListener('click', e => {
    e.preventDefault();
    const target = el('case-files').querySelector('.case-card:not(.is-watched):not(.is-unreleased)');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function renderPhase() {
  const phase = getActivePhase();
  el('phase-kicker').textContent = phase.name;
  el('phase-title').textContent = phase.label;

  // Phase-to-phase nav sits after the (statically bound) back button
  const nav = el('phase-nav');
  nav.querySelectorAll('.nav-btn').forEach(n => n.remove());
  nav.insertAdjacentHTML('beforeend', phaseNavHtml(phase));
  el('list-footer-nav').innerHTML = (() => {
    const next = phasesData[phasesData.indexOf(phase) + 1];
    return next ? `<a class="nav-btn" href="#/${next.id}">${next.name} &rarr;</a>` : '';
  })();

  const entries = [...phase.movies].sort((a, b) => a.narrativeOrder - b.narrativeOrder);

  // Phase progress always reflects the whole phase, not the current filter
  const totals = entries.reduce((acc, e) => {
    const { watched, total } = unitCounts(e);
    acc.watched += watched;
    acc.total += total;
    return acc;
  }, { watched: 0, total: 0 });
  el('progress-fill').style.width = `${pct(totals.watched, totals.total)}%`;
  el('progress-label').textContent = `${totals.watched} / ${totals.total}`;

  renderFilterStrip(entries);

  const container = el('case-files');
  container.innerHTML = '';
  container.classList.toggle('is-compact', !artEnabled());

  const activeFilter = PHASE_FILTERS.find(f => f.id === phaseFilter) || PHASE_FILTERS[0];
  const shown = entries.filter(activeFilter.test);

  if (!shown.length) {
    container.innerHTML = '<p class="kicker" style="text-align:center; padding:32px 0">Nothing matches this filter</p>';
    return;
  }

  shown.forEach(entry => {
    const isSeries = entry.type === 'series';
    const isUnreleased = entry.released === false;
    const { watched, total } = unitCounts(entry);
    const isWatched = total > 0 && watched === total;
    const isCurrent = !isUnreleased && isCurrentlyWatching(entry);
    const p = progress[entry.id] || {};

    const card = document.createElement('a');
    card.className = 'case-card'
      + (isUnreleased ? ' is-unreleased' : '')
      + (isCurrent ? ' is-watching' : (isWatched ? ' is-watched' : ''));
    card.href = isSeries && !isUnreleased ? '#' : `#/watch/${entry.id}`;
    if (isSeries && !isUnreleased) {
      card.addEventListener('click', e => {
        e.preventDefault();
        openEpisodeModal(entry);
      });
    }

    let typeBadge = '';
    if (isUnreleased) typeBadge = '<span class="badge badge--muted">Not yet released</span>';
    else if (isSeries) typeBadge = '<span class="badge">Series</span>';
    else if (entry.type === 'special') typeBadge = '<span class="badge">Special</span>';

    const rating = p.rating ? `<span class="case-rating">${formatRating(p.rating)}</span>` : '';
    let statusHtml;
    if (isUnreleased) statusHtml = '';
    else if (isCurrent) statusHtml = `<span class="badge badge--crimson">&#9654; Watching</span>${rating}`;
    else if (isWatched) statusHtml = `<span class="stamp">Watched</span>${rating}`;
    else statusHtml = rating || '<span class="case-dash">&mdash;</span>';

    card.innerHTML = `
      <span class="case-num">${entry.narrativeOrder}</span>
      ${posterHtml(entry, 'w92', 52, 78)}
      <span class="case-main">
        <span class="case-titleline"><span class="case-title">${entry.title}</span>${typeBadge}</span>
        <span class="case-meta">${caseMetaText(entry)}</span>
      </span>
      <span class="case-status">${statusHtml}</span>
    `;

    // Pin toggle: flag/unflag straight from the list without opening the page.
    // For a series, "flag" means its first unwatched episode; "unflag" clears
    // any flagged episode it contains.
    if (isUnreleased) {
      card.insertAdjacentHTML('beforeend', '<span class="pin-btn" aria-hidden="true"></span>');
    } else {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'pin-btn' + (isCurrent ? ' is-active' : '');
      pin.setAttribute('aria-label', isCurrent ? 'Unflag currently watching' : 'Flag as currently watching');
      pin.textContent = '⚑';
      pin.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isSeries) {
          const flaggedEps = seriesEpisodes(entry).filter(ep => watching.includes(ep.id));
          if (flaggedEps.length) {
            await setWatching(watching.filter(id => !flaggedEps.some(ep => ep.id === id)));
          } else {
            const target = seriesEpisodes(entry).find(ep => !progress[ep.id]?.watched) || seriesEpisodes(entry)[0];
            await toggleFlag(target.id);
          }
        } else {
          await toggleFlag(entry.id);
        }
        renderPhase();
      });
      card.appendChild(pin);
    }

    container.appendChild(card);
  });
}

function formatRating(rating) {
  return Number(rating).toFixed(1);
}

// --- Shared detail components (movie page, episode page, series modal) ---

// "When this happens" prose, built from whatever timeline data the entry actually has.
function whenText(entry) {
  const bits = [];
  if (entry.inUniverseSetting) bits.push(`Set in ${entry.inUniverseSetting}.`);
  if (entry.timeSkip) bits.push(`${entry.timeSkip}.`);
  return bits.join(' ');
}

// The spoiler-free orientation panel. Its "No spoilers" label is a contract —
// only put things in here that can't reveal an event from the title itself.
// "Watch these first" chips — each is an entry id from movies.json, so the label
// and link come straight from the referenced title
// "Watch these first" chips. Same rule as the optional row below: an entry id
// links to that title, anything else (Logan, the Deadpool films) is a hard
// prerequisite that simply isn't in this tracker, so it renders as a plain chip.
function prereqChipHtml(id) {
  const found = findItem(id);
  if (found) return `<a class="chip" href="#/watch/${id}">${found.item.title}</a>`;
  return `<span class="chip chip--fact">${id}</span>`;
}

// "Helps, but optional" chips. An item that matches an entry id links to that
// title; anything else (films outside this tracker) renders as a plain chip.
function optionalChipHtml(value) {
  const found = findItem(value);
  if (found) return `<a class="chip" href="#/watch/${value}">${found.item.title}</a>`;
  return `<span class="chip chip--fact">${value}</span>`;
}

function beforeWatchHtml(entry) {
  const blocks = [];
  const bw = entry.beforeWatch || {};
  const when = whenText(entry);
  if (when) {
    blocks.push(`<div><p class="kicker">When this happens</p><p style="margin-top:8px">${when}</p></div>`);
  }
  if (bw.context) {
    blocks.push(`<div><p class="kicker">What you need to know going in</p><p style="margin-top:8px">${bw.context}</p></div>`);
  }
  // The chip row sits inside "Before you watch", so it's bound by the same
  // no-spoilers contract as everything else in here: naming someone can itself
  // give the game away. nameIsSpoiler keeps an item out of this row while it
  // still appears in whichever panels its payloads earn it.
  const namable = (entry.watchFor || []).filter(w => !w.nameIsSpoiler);
  if (namable.length) {
    blocks.push(`<div><p class="kicker">People &amp; things to watch for</p>
      <div class="chip-row" style="margin-top:10px">${namable.map(watchForTagHtml).join('')}</div></div>`);
  }
  if (bw.watchFirst && bw.watchFirst.length) {
    blocks.push(`<div><p class="kicker">Watch these first</p>
      <div class="bw-prereq">${bw.watchFirst.map(prereqChipHtml).join('')}</div></div>`);
  }
  if (entry.optionalViewing) {
    // Three accepted shapes. An array renders as chips (the usual case); a plain
    // string still renders as prose; { note, items } puts a line of prose above
    // the chips, which is how an entry says these are watched *after* this film
    // rather than before it — the default reading of the heading.
    const ov = entry.optionalViewing;
    let body;
    if (Array.isArray(ov)) {
      body = `<div class="bw-prereq">${ov.map(optionalChipHtml).join('')}</div>`;
    } else if (typeof ov === 'object') {
      body = (ov.note ? `<p class="bw-note">${ov.note}</p>` : '')
        + `<div class="bw-prereq">${(ov.items || []).map(optionalChipHtml).join('')}</div>`;
    } else {
      body = `<p style="margin-top:8px">${ov}</p>`;
    }
    blocks.push(`<div><p class="kicker">Helps, but optional</p>${body}</div>`);
  }
  if (!blocks.length) return '';
  return `
    <section class="before-watch">
      <div class="before-watch__head">
        <h3>Before you watch</h3>
        <span class="bw-safe">No spoilers</span>
      </div>
      <div class="bw-body">${blocks.join('')}</div>
    </section>
  `;
}

// A collapsed disclosure panel. The body is always in the DOM but hidden, so the
// button is never left at aria-expanded="true" with nothing beneath it.
function revealPanelHtml(kind, uid, label, bodyHtml) {
  if (!bodyHtml) return '';
  const btnCls = kind === 'spoiler' ? 'spoiler-toggle spoiler-toggle--head' : 'deepdive-toggle deepdive-toggle--head';
  const panelCls = kind === 'spoiler' ? 'reveal-panel reveal-panel--spoiler' : 'reveal-panel';
  return `
    <section class="deep-panel">
      <button class="${btnCls}" type="button" aria-expanded="false" data-reveal="${uid}" data-label="${label}">&#9654; ${label}</button>
      <div class="${panelCls}" data-reveal-body="${uid}" hidden>${bodyHtml}</div>
    </section>
  `;
}

function bindReveals(container) {
  container.querySelectorAll('[data-reveal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = container.querySelector(`[data-reveal-body="${btn.dataset.reveal}"]`);
      const isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      body.hidden = isOpen;
      btn.innerHTML = `${isOpen ? '&#9654;' : '&#9660;'} ${btn.dataset.label}`;
    });
  });
}

// Tier one of the spoiler system: everything that happens *in this title*.
// Holds the deep dive plus each watchFor item's in-title payoff.
function deepDivePanelHtml(entry, noun) {
  const dd = entry.deepDive || {};
  const inTitle = (entry.watchFor || []).filter(w => w.thisFilm);
  const parts = [
    dd.plot ? `<div><p class="kicker">The full plot</p><p style="margin-top:6px">${dd.plot}</p></div>` : '',
    dd.significance ? `<div><p class="kicker">Why it matters</p><p style="margin-top:6px">${dd.significance}</p></div>` : '',
    dd.orderNote ? `<div><p class="kicker">Why this order</p><p style="margin-top:6px">${dd.orderNote}</p></div>` : '',
    inTitle.length ? `<div><p class="kicker">What to watch for, in this ${noun}</p>
      <ul class="detail-list">${inTitle.map(w => `<li><span class="term">${w.name}:</span> ${w.thisFilm}</li>`).join('')}</ul></div>` : ''
  ].join('');
  return revealPanelHtml('deepdive', `dd-${entry.id}`, `Plot &amp; context: spoilers for this ${noun}`, parts);
}

// Tier two: what these people and things mean for titles you haven't reached yet.
function futureSpoilersPanelHtml(entry) {
  const items = (entry.watchFor || []).filter(w => w.future);
  if (!items.length) return '';
  const body = `<ul class="detail-list">${items.map(w =>
    `<li><span class="term">${w.name}:</span> ${w.future}${w.spoils ? ` <span class="spoils-tag">Spoils: ${w.spoils}</span>` : ''}</li>`
  ).join('')}</ul>`;
  return revealPanelHtml('spoiler', `sp-${entry.id}`, 'Spoilers for future films', body);
}

// Static warning for the rare title whose credit scene reveals something from a later
// point in the narrative-order watch-through — e.g. Black Widow, Ant-Man and the Wasp
function skipWarningHtml(postCredit) {
  if (!postCredit || !postCredit.skipNote) return '';
  return `<div class="note note--red" style="margin-top:12px"><span class="note__label">Heads up</span>${postCredit.skipNote}</div>`;
}

function summaryBlockHtml(entry) {
  return `
    <div class="section-rule">
      <p class="kicker">Summary</p>
      <p style="margin-top:8px">${entry.summary}</p>
      ${skipWarningHtml(entry.postCredit)}
    </div>
  `;
}

function ratingHtml(rating) {
  return `
    <span class="rating" data-rating>
      <button type="button" data-action="down" aria-label="Lower rating">&#9660;</button>
      <span class="rating__value${rating ? '' : ' is-empty'}">${rating ? formatRating(rating) : '—'} / 10</span>
      <button type="button" data-action="up" aria-label="Raise rating">&#9650;</button>
    </span>
  `;
}

function bindRating(container, id, onChange) {
  const el2 = container.querySelector('[data-rating]');
  if (!el2) return;
  const step = async (delta) => {
    const current = progress[id]?.rating || 0;
    const next = Math.min(10, Math.max(0, current + delta));
    progress[id] = await updateProgress(id, { rating: next });
    onChange();
  };
  el2.querySelector('[data-action="down"]').addEventListener('click', () => step(-0.5));
  el2.querySelector('[data-action="up"]').addEventListener('click', () => step(0.5));
}

// Marking something watched advances the currently-watching flag (or bootstraps one)
async function setWatchedWithFlagAdvance(id, nowWatched) {
  progress[id] = await updateProgress(id, { watched: nowWatched });
  if (!nowWatched) return;
  const next = nextUnwatchedAfter(id);
  if (watching.includes(id)) {
    await setWatching(watching.map(w => (w === id ? next : w)).filter(Boolean).slice(0, 2));
  } else if (!watching.length && next) {
    await setWatching([next]);
  }
}

// --- Series pop-up ---

// Set when navigating back from an episode page, so the phase list reopens the
// series pop-up the episode came from instead of dumping you on the bare list.
let pendingSeriesModal = null;

function openEpisodeModal(series, openSeasons) {
  const content = el('modal-content');
  const sp = progress[series.id] || {};
  const eps = seriesEpisodes(series);
  const watchedCount = eps.filter(e => progress[e.id]?.watched).length;
  const allWatched = watchedCount === eps.length && eps.length > 0;
  const isFlagged = eps.some(e => watching.includes(e.id));
  const open = openSeasons || new Set([series.seasons[0].seasonNumber]);
  // A one-season show doesn't need an accordion — show its episodes directly
  const multiSeason = series.seasons.length > 1;

  const seasonLabel = `Series &middot; ${series.seasons.length} season${series.seasons.length > 1 ? 's' : ''} &middot; ${series.year}`;

  // The wash has to be the modal's first child, and the modal keeps its own
  // overflow:auto — never add overflow:hidden here or long pop-ups stop scrolling
  content.className = 'modal--series has-wash';
  content.innerHTML = `
    ${cardWashHtml(series)}
    <button id="modal-close" type="button" aria-label="Close">&#10005;</button>

    ${titleHeroHtml(series, series.title, seasonLabel, 30)}

    <div class="progress progress--sm">
      <span class="progress-track"><span class="progress-fill" style="width:${pct(watchedCount, eps.length)}%"></span></span>
      <span class="progress-count">${watchedCount} / ${eps.length} watched</span>
    </div>

    ${summaryBlockHtml(series)}
    ${beforeWatchHtml(series)}
    ${deepDivePanelHtml(series, 'series')}
    ${futureSpoilersPanelHtml(series)}

    <div class="section-rule">
      <div class="episodes-head">
        <p class="kicker">${multiSeason ? 'Seasons' : 'Episodes'}</p>
        ${multiSeason ? '' : `<span class="season-mark" role="button" tabindex="0" data-mark-all>${allWatched ? 'Unmark all' : 'Mark all'}</span>`}
      </div>
      <div id="season-list"></div>
    </div>

    <div class="rating-row">
      <button class="btn btn--primary${allWatched ? ' is-active' : ''}" type="button" data-series-watch>
        ${allWatched ? '&#10003; Series watched' : 'Mark series as watched'}
      </button>
      <button class="btn btn--outline${isFlagged ? ' is-active' : ''}" type="button" data-series-flag>
        ${isFlagged ? '&#9654; Currently watching' : 'Flag as watching'}
      </button>
      ${ratingHtml(sp.rating)}
    </div>
  `;

  bindReveals(content);
  bindRating(content, series.id, () => reopen());

  // Ticking episodes inside the pop-up changes counts and watched state on the
  // phase list behind it, so redraw that too rather than leaving it stale
  const reopen = () => {
    const open = currentOpenSeasons();
    if (!el('screen-phase').hidden) renderPhase();
    renderAppBar();
    openEpisodeModal(series, open);
  };

  const seasonListEl = el('season-list');
  series.seasons.forEach(season => {
    const watchedInSeason = season.episodes.filter(ep => progress[ep.id]?.watched).length;
    const isOpen = open.has(season.seasonNumber);

    const block = document.createElement('div');
    block.className = 'season-block';

    let header = null;
    if (multiSeason) {
      header = document.createElement('button');
      header.className = 'season-header';
      header.type = 'button';
      header.setAttribute('aria-expanded', String(isOpen));
      header.dataset.season = season.seasonNumber;
      header.innerHTML = `Season ${season.seasonNumber}
        <span class="season-meta">${watchedInSeason} of ${season.episodes.length} watched</span>
        <span class="season-mark" role="button" tabindex="0">${watchedInSeason === season.episodes.length ? 'Unmark all' : 'Mark all'}</span>`;
    }

    const list = document.createElement('div');
    list.className = 'episode-list';
    list.hidden = multiSeason && !isOpen;

    season.episodes.forEach(ep => {
      const p = progress[ep.id] || {};
      const row = document.createElement('div');
      row.className = 'episode-row'
        + (p.watched ? ' is-watched' : '')
        + (watching.includes(ep.id) ? ' is-watching' : '');
      row.innerHTML = `
        <button class="ep-check" type="button" role="checkbox" aria-checked="${p.watched ? 'true' : 'false'}" aria-label="Mark ${ep.title} as watched">&#10003;</button>
        <span class="ep-num">${ep.episodeNumber}.</span>
        <button class="ep-title" type="button">${ep.title}</button>
        <span class="ep-go">&rsaquo;</span>
      `;
      row.querySelector('.ep-check').addEventListener('click', async () => {
        await setWatchedWithFlagAdvance(ep.id, !p.watched);
        reopen();
      });
      row.querySelector('.ep-title').addEventListener('click', () => {
        closeModal();
        location.hash = `watch/${ep.id}`;
      });
      list.appendChild(row);
    });

    const markSeason = async () => {
      const target = watchedInSeason !== season.episodes.length;
      for (const ep of season.episodes) {
        if (!!progress[ep.id]?.watched !== target) {
          progress[ep.id] = await updateProgress(ep.id, { watched: target });
        }
      }
      reopen();
    };

    if (header) {
      // "Mark all" sits inside the season header button, so its click must not
      // also toggle the accordion
      header.querySelector('.season-mark').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        markSeason();
      });

      header.addEventListener('click', () => {
        const nowOpen = header.getAttribute('aria-expanded') !== 'true';
        header.setAttribute('aria-expanded', String(nowOpen));
        list.hidden = !nowOpen;
      });
      block.appendChild(header);
    } else {
      // single-season show: the bulk toggle lives in the section heading instead
      const headMark = content.querySelector('[data-mark-all]');
      if (headMark) headMark.addEventListener('click', (e) => { e.preventDefault(); markSeason(); });
    }

    block.appendChild(list);
    seasonListEl.appendChild(block);
  });

  content.querySelector('[data-series-watch]').addEventListener('click', async () => {
    for (const ep of eps) {
      if (!!progress[ep.id]?.watched === allWatched) {
        progress[ep.id] = await updateProgress(ep.id, { watched: !allWatched });
      }
    }
    reopen();
  });

  content.querySelector('[data-series-flag]').addEventListener('click', async () => {
    if (isFlagged) {
      await setWatching(watching.filter(id => !eps.some(e => e.id === id)));
    } else {
      const target = eps.find(e => !progress[e.id]?.watched) || eps[0];
      await toggleFlag(target.id);
    }
    reopen();
  });

  el('modal-backdrop').classList.add('open');
}

function currentOpenSeasons() {
  const open = new Set();
  document.querySelectorAll('#season-list .season-header[aria-expanded="true"]').forEach(h => {
    open.add(Number(h.dataset.season));
  });
  return open;
}

function closeModal() {
  el('modal-backdrop').classList.remove('open');
}

// --- Movie / episode detail page ---

function detailNav(backLabel, backAction, extraHtml) {
  const backBtn = el('detail-back-btn');
  backBtn.innerHTML = backLabel;
  backBtn.onclick = backAction;
  el('detail-nav').querySelectorAll('.nav-btn').forEach(n => n.remove());
  if (extraHtml) el('detail-nav').insertAdjacentHTML('beforeend', extraHtml);
}

function renderDetail(found) {
  const { item, phase, series, season } = found;
  const p = progress[item.id] || {};
  const isUnreleased = item.released === false;
  const isFlagged = watching.includes(item.id);
  const rerender = () => renderDetail(found);

  let navExtra = '';
  if (series) {
    const eps = season.episodes;
    const i = eps.findIndex(e => e.id === item.id);
    const prev = eps[i - 1];
    const next = eps[i + 1];
    navExtra = `<a class="nav-btn${prev ? '' : ' is-disabled'}" href="${prev ? `#/watch/${prev.id}` : '#'}">&larr; Previous</a>`
      + `<a class="nav-btn${next ? '' : ' is-disabled'}" href="${next ? `#/watch/${next.id}` : '#'}">Next episode &rarr;</a>`;
    detailNav(`&larr; ${series.title}`, () => {
      pendingSeriesModal = series.id;
      location.hash = phase.id;
    }, navExtra);
  } else {
    detailNav(`&larr; ${phase.name}`, () => { location.hash = phase.id; }, '');
  }

  // the season now lives in the series title, so don't repeat it here
  const kindLabel = series
    ? `${series.title} &middot; Episode ${item.episodeNumber}`
    : `${item.type === 'special' ? 'Special' : 'Movie'} &middot; ${item.year}`;

  const controlsHtml = isUnreleased
    ? `<div class="note note--muted"><span class="note__label">Not yet released</span>${item.expectedRelease ? `Expected ${item.expectedRelease}. ` : ''}Check back after it premieres to log it here.</div>`
    : `
      <div class="controls-row">
        <button class="btn btn--primary${p.watched ? ' is-active' : ''}" id="watch-toggle-btn" type="button">
          ${p.watched ? '&#10003; Watched' : 'Mark as watched'}
        </button>
        <button class="btn btn--outline${isFlagged ? ' is-active' : ''}" id="flag-toggle-btn" type="button">
          ${isFlagged ? '&#9654; Currently watching' : 'Flag as watching'}
        </button>
        ${series ? '' : ratingHtml(p.rating)}
      </div>
    `;

  // An episode borrows its series' artwork — same screen, so a bare episode
  // page next to a hero'd movie page would look broken
  const artEntry = series || item;
  const card = el('detail-card');
  card.querySelectorAll('.card-wash').forEach(w => w.remove());
  card.classList.toggle('has-wash', !isUnreleased || !!(artEntry.art && artEntry.art.backdrop));
  card.insertAdjacentHTML('afterbegin', cardWashHtml(artEntry));

  el('detail-content').innerHTML = `
    ${titleHeroHtml(artEntry, item.title, kindLabel, series ? 30 : 34)}

    ${summaryBlockHtml(item)}
    ${beforeWatchHtml(item)}
    ${deepDivePanelHtml(item, series ? 'episode' : 'film')}
    ${futureSpoilersPanelHtml(item)}

    ${controlsHtml}
  `;

  const content = el('detail-content');
  bindReveals(content);

  if (!isUnreleased) {
    if (!series) bindRating(content, item.id, rerender);

    el('watch-toggle-btn').addEventListener('click', async () => {
      await setWatchedWithFlagAdvance(item.id, !p.watched);
      rerender();
    });

    el('flag-toggle-btn').addEventListener('click', async () => {
      await toggleFlag(item.id);
      rerender();
    });
  }
}

// Merge a change into one entry and save. The watchedAt rules are copied from
// server.js exactly: stamped when marked watched if there's no date already,
// cleared when unmarked. Since unmarking clears it, marking again gives a new
// date; changing only a rating leaves the existing date alone. Unknown fields
// on an existing entry (postCreditSeen) are carried through untouched.
async function updateProgress(itemId, body) {
  const existing = progress[itemId] || {};
  const updated = { ...existing };

  if (typeof body.watched === 'boolean') {
    updated.watched = body.watched;
    if (body.watched && !existing.watchedAt) updated.watchedAt = new Date().toISOString();
    if (!body.watched) updated.watchedAt = null;
  }
  if (body.rating !== undefined) updated.rating = body.rating;

  progress[itemId] = updated;
  writeSave();
  return { movieId: itemId, ...updated };
}

init();
