let phasesData = [];
let charactersData = [];
let progress = {};
let activePhaseId = null;
let watching = []; // up to 2 "currently watching" unit ids, persisted in progress.json under _watching

const el = (id) => document.getElementById(id);

async function init() {
  const [phasesRes, progressRes, charactersRes] = await Promise.all([
    fetch('/api/phases').then(r => r.json()),
    fetch('/api/progress').then(r => r.json()),
    fetch('/api/characters').then(r => r.json())
  ]);
  phasesData = phasesRes.phases;
  progress = progressRes;
  charactersData = charactersRes.characters;

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

  // The close button lives inside #modal-content, which is re-rendered on every
  // open — so listen on the backdrop instead of binding the button directly
  el('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop' || e.target.closest('#modal-close')) closeModal();
  });

  watching = (progress._watching || []).filter(id => findItem(id));
  renderNowWatching();

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
  await fetch('/api/now-watching', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
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
    // Keep the filter when backing out of a character file, but clear it when the
    // database is opened fresh — otherwise it can look empty on a later visit
    if (prev[0] !== 'character') el('char-search').value = '';
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
function initialsFor(name) {
  const primary = name.split('/')[0].trim();
  const words = primary.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return primary.slice(0, 2).toUpperCase();
}

function tintFor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (h % 6) + 1;
}

function portraitInnerHtml(c, extraStyle) {
  const style = [c.imagePosition ? `object-position:${c.imagePosition}` : '', extraStyle || '']
    .filter(Boolean).join(';');
  return c.image
    ? `<img src="${c.image}" alt="${c.name}"${style ? ` style="${style}"` : ''}>`
    : `<span class="no-photo no-photo--t${tintFor(c.name)}"${extraStyle ? ` style="${extraStyle}"` : ''}>${initialsFor(c.name)}</span>`;
}

// A phase counts as "seen" once the user has finished every released unit in it —
// this drives which character records are safe to open.
function phaseIsFinished(phase) {
  const c = phaseCounts(phase);
  return c.total > 0 && c.watched === c.total;
}

// UI-local database controls
let charSort = 'appearance';

// Earliest phase the character has a record for — used by the "first appearance"
// sort. Characters with no records sort last, keeping the order stable.
function firstPhaseIndex(c) {
  if (!c.phases) return 99;
  for (let i = 0; i < phasesData.length; i++) {
    if (c.phases[phasesData[i].id]) return i;
  }
  return 99;
}

function renderDbControls() {
  el('db-controls').innerHTML = `
    <span class="segmented">
      <span class="seg-label">Sort</span>
      <a href="#"${charSort === 'appearance' ? ' class="is-active"' : ''} data-sort="appearance">First appearance</a>
      <a href="#"${charSort === 'az' ? ' class="is-active"' : ''} data-sort="az">A &ndash; Z</a>
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
  let shown = query
    ? charactersData.filter(c => c.name.toLowerCase().includes(query))
    : charactersData.slice();

  if (charSort === 'az') {
    shown.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const order = new Map(charactersData.map((c, i) => [c.id, i]));
    shown.sort((a, b) => firstPhaseIndex(a) - firstPhaseIndex(b) || order.get(a.id) - order.get(b.id));
  }

  el('char-result-count').textContent = query
    ? `${shown.length} of ${charactersData.length} characters`
    : `${charactersData.length} characters`;

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
// accordion. Every phase is listed for every character — even ones they aren't in — so
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
      <p class="lede" style="margin:8px 0 16px; font-size:14px">Every phase is listed for every character, so the list itself spoils nothing. Open only the phases you've finished.</p>
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
    + '<a class="filter-chip" href="#" data-jump="next">Next unwatched &darr;</a>';

  el('filter-strip').querySelectorAll('[data-filter]').forEach(chip => {
    chip.addEventListener('click', e => {
      e.preventDefault();
      phaseFilter = chip.dataset.filter;
      renderPhase();
    });
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
function prereqChipHtml(id) {
  const found = findItem(id);
  if (!found) return '';
  return `<a class="chip" href="#/watch/${id}">${found.item.title}</a>`;
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
  if (entry.watchFor && entry.watchFor.length) {
    blocks.push(`<div><p class="kicker">People &amp; things to watch for</p>
      <div class="chip-row" style="margin-top:10px">${entry.watchFor.map(watchForTagHtml).join('')}</div></div>`);
  }
  if (bw.watchFirst && bw.watchFirst.length) {
    blocks.push(`<div><p class="kicker">Watch these first</p>
      <div class="bw-prereq">${bw.watchFirst.map(prereqChipHtml).join('')}</div></div>`);
  }
  if (entry.optionalViewing) {
    // an array renders as chips (the usual case); a plain string still renders as prose
    const body = Array.isArray(entry.optionalViewing)
      ? `<div class="bw-prereq">${entry.optionalViewing.map(optionalChipHtml).join('')}</div>`
      : `<p style="margin-top:8px">${entry.optionalViewing}</p>`;
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
  return revealPanelHtml('deepdive', `dd-${entry.id}`, `Plot &amp; context — contains spoilers for this ${noun}`, parts);
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

  content.className = 'modal--series';
  content.innerHTML = `
    <button id="modal-close" type="button" aria-label="Close">&#10005;</button>

    <div class="modal-head">
      <h3 class="card-title" style="font-size:26px">${series.title}</h3>
      <p class="kicker" style="margin-top:8px">Series &middot; ${series.seasons.length} season${series.seasons.length > 1 ? 's' : ''} &middot; ${series.year}</p>
    </div>

    <div class="progress progress--sm">
      <span class="progress-track"><span class="progress-fill" style="width:${pct(watchedCount, eps.length)}%"></span></span>
      <span class="progress-count">${watchedCount} / ${eps.length} watched</span>
    </div>

    ${summaryBlockHtml(series)}
    ${beforeWatchHtml(series)}
    ${deepDivePanelHtml(series, 'series')}
    ${futureSpoilersPanelHtml(series)}

    <div class="section-rule">
      <p class="kicker" style="margin-bottom:12px">Seasons</p>
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

    const header = document.createElement('button');
    header.className = 'season-header';
    header.type = 'button';
    header.setAttribute('aria-expanded', String(isOpen));
    header.dataset.season = season.seasonNumber;
    header.innerHTML = `Season ${season.seasonNumber}
      <span class="season-meta">${watchedInSeason} of ${season.episodes.length} watched</span>
      <span class="season-mark" role="button" tabindex="0">${watchedInSeason === season.episodes.length ? 'Unmark all' : 'Mark all'}</span>`;

    const list = document.createElement('div');
    list.className = 'episode-list';
    list.hidden = !isOpen;

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

    // "Mark all" sits inside the season header button, so its click must not
    // also toggle the accordion
    const mark = header.querySelector('.season-mark');
    mark.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = watchedInSeason !== season.episodes.length;
      for (const ep of season.episodes) {
        if (!!progress[ep.id]?.watched !== target) {
          progress[ep.id] = await updateProgress(ep.id, { watched: target });
        }
      }
      reopen();
    });

    header.addEventListener('click', () => {
      const nowOpen = header.getAttribute('aria-expanded') !== 'true';
      header.setAttribute('aria-expanded', String(nowOpen));
      list.hidden = !nowOpen;
    });

    block.appendChild(header);
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

  const kindLabel = series
    ? `${series.title} &middot; Season ${season.seasonNumber}, episode ${item.episodeNumber}`
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

  el('detail-content').innerHTML = `
    <div>
      <h2 class="page-title" style="font-size:${series ? 30 : 32}px">${item.title}</h2>
      <p class="kicker" style="margin-top:10px">${kindLabel}</p>
    </div>

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

async function updateProgress(itemId, body) {
  const res = await fetch(`/api/progress/${itemId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

init();
