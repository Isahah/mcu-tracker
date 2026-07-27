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

  el('modal-close').addEventListener('click', closeModal);
  el('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
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

// Fixed corner dock, visible on every screen; chips link to the flagged unit's page
function renderNowWatching() {
  const dock = el('now-watching-dock');
  if (!watching.length) { dock.hidden = true; dock.innerHTML = ''; return; }
  dock.hidden = false;
  dock.innerHTML = '<div class="nw-label">NOW WATCHING</div>' + watching.map(id => {
    const found = findItem(id);
    if (!found) return '';
    const title = found.series
      ? `${found.series.title} — S${found.season.seasonNumber}E${found.item.episodeNumber}`
      : found.item.title;
    return `<a class="nw-chip" href="#/watch/${id}">&#9654; ${title}</a>`;
  }).join('');
}

let lastRouteParts = [];

function route() {
  closeModal(); // e.g. following a watchFor character link from inside the series modal
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  const prev = lastRouteParts;
  lastRouteParts = parts;

  if (parts[0] === 'watch' && parts[1]) {
    const found = findItem(parts[1]);
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
    activePhaseId = phase.id;
    showScreen('phase');
    renderPhase();
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
  document.querySelector('.dossier').classList.toggle('wide', name === 'detail' || name === 'characters');
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
  if (!charId) return `<span class="watchfor-tag">${w.name}</span>`;
  return `<a class="watchfor-tag watchfor-link" href="#/character/${charId}" title="Open character file">${w.name} &#128194;</a>`;
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

function renderMenu() {
  const grid = el('phase-grid');
  grid.innerHTML = '';

  phasesData.forEach(phase => {
    const { watched, total } = phaseCounts(phase);

    const card = document.createElement('a');
    card.className = 'phase-card';
    card.href = `#/${phase.id}`;
    card.innerHTML = `
      <div class="phase-card-name">${phase.name}</div>
      <div class="phase-card-label">${phase.label}</div>
      <div class="phase-card-progress-row">
        <div class="progress-track small">
          <div class="progress-fill" style="width: ${total ? (watched / total) * 100 : 0}%"></div>
        </div>
        <span class="phase-card-count">${watched} / ${total}</span>
      </div>
    `;
    grid.appendChild(card);
  });

  el('menu-character-count').textContent = `${charactersData.length} files on record`;
}

// Portrait slot shared by the grid cards and the character detail page: renders the
// image if the data has one, otherwise a "NO PHOTO ON FILE" placeholder.
// Optional `imagePosition` shifts which part of the photo the square crop keeps
// (CSS object-position — e.g. "top", "center", "50% 20%"); default is center.
function portraitHtml(c) {
  return `
    <div class="character-portrait">
      ${c.image
        ? `<img src="${c.image}" alt="${c.name}"${c.imagePosition ? ` style="object-position: ${c.imagePosition}"` : ''}>`
        : `<span class="portrait-placeholder">NO PHOTO<br>ON FILE</span>`}
    </div>
  `;
}

// Character database: dense grid of photo + name cards. All other info lives on the
// per-character page (#/character/<id>) so browsing the grid can't spoil anything.
// Filtered live by the search box (name match, case-insensitive).
function renderCharacters() {
  const grid = el('character-grid');
  grid.innerHTML = '';

  const query = el('char-search').value.trim().toLowerCase();
  const shown = query
    ? charactersData.filter(c => c.name.toLowerCase().includes(query))
    : charactersData;

  if (!shown.length) {
    grid.innerHTML = '<p class="no-matches">NO MATCHING FILES ON RECORD.</p>';
    return;
  }

  shown.forEach(c => {
    const card = document.createElement('a');
    card.className = 'character-card';
    card.href = `#/character/${c.id}`;
    card.innerHTML = `
      ${portraitHtml(c)}
      <div class="character-name">${c.name}</div>
    `;
    grid.appendChild(card);
  });
}

// Full-page personnel file for one character: portrait, spoiler-light overview, then
// the phase-by-phase accordion. Every phase is listed for every character — even ones
// they aren't in — so the accordion itself reveals nothing; expanding a phase shows
// what they did in it (spoilers scoped to that phase only), or a "no activity" line.
function renderCharacter(c) {
  el('character-content').innerHTML = `
    <div class="character-file-header">
      ${portraitHtml(c)}
      <div class="character-file-title">
        <h3>${c.name}</h3>
        <span class="file-stamp">PERSONNEL FILE</span>
      </div>
    </div>

    <div class="modal-section">
      <h4>Overview</h4>
      <p>${c.description}</p>
    </div>

    <div class="modal-section">
      <h4>Phase-by-Phase Record</h4>
      <p class="phase-record-hint">Every phase is listed for every character, so the list itself spoils nothing. Expanding a phase reveals what they did in it &mdash; only open phases you've finished.</p>
      <div class="season-list" id="char-phase-list"></div>
    </div>
  `;

  const listEl = el('char-phase-list');
  phasesData.forEach(phase => {
    const entry = c.phases && c.phases[phase.id];

    const block = document.createElement('div');
    block.className = 'season-block';

    const header = document.createElement('button');
    header.className = 'season-header';
    header.innerHTML = `
      <span>${phase.name}</span>
      <span class="season-header-count">${phase.label}</span>
    `;

    const body = document.createElement('div');
    body.className = 'phase-record-body';
    body.hidden = true; // all collapsed by default — that's the spoiler protection
    body.innerHTML = entry
      ? `<p>${entry}</p>`
      : `<p class="phase-record-empty">No significant activity on file for this phase.</p>`;

    header.addEventListener('click', () => { body.hidden = !body.hidden; });

    block.appendChild(header);
    block.appendChild(body);
    listEl.appendChild(block);
  });
}

function getActivePhase() {
  return phasesData.find(p => p.id === activePhaseId);
}

function renderPhase() {
  const phase = getActivePhase();
  el('phase-title').textContent = `${phase.name} — ${phase.label}`;

  const entries = [...phase.movies].sort((a, b) => a.narrativeOrder - b.narrativeOrder);

  const container = el('case-files');
  container.innerHTML = '';

  let watchedCount = 0;
  let totalCount = 0;

  entries.forEach(entry => {
    const isSeries = entry.type === 'series';
    const isUnreleased = entry.released === false;
    const { watched, total } = unitCounts(entry);
    watchedCount += watched;
    totalCount += total;

    const isCurrent = !isUnreleased && isCurrentlyWatching(entry);

    const card = document.createElement('div');
    card.className = 'case-card' + (isUnreleased ? ' unreleased' : (watched === total && total > 0 ? ' watched' : ''))
      + (isCurrent ? ' watching-now' : '');
    card.addEventListener('click', () => {
      if (isSeries && !isUnreleased) {
        openEpisodeModal(entry);
      } else {
        location.hash = `watch/${entry.id}`;
      }
    });

    const creditBadge = entry.postCredit
      ? `<span class="credit-badge">🎬 ${creditLabel(entry.postCredit)}</span>`
      : '';

    let statusHtml;
    if (isUnreleased) {
      statusHtml = `<span class="unreleased-badge">NOT YET RELEASED</span>`;
    } else if (isSeries) {
      const sp = progress[entry.id] || {};
      statusHtml = `
        <span class="episode-count-badge">${watched} / ${total} episodes</span>
        ${sp.rating ? `<div class="rating-display">${formatRating(sp.rating)}/10</div>` : ''}
      `;
    } else {
      const p = progress[entry.id] || {};
      statusHtml = `
        ${p.watched
          ? `<span class="watched-stamp">VIEWED</span>`
          : `<span class="unwatched-mark">unwatched</span>`}
        ${p.rating ? `<div class="rating-display">${formatRating(p.rating)}/10</div>` : ''}
      `;
    }

    let typeBadge = '';
    if (isSeries) typeBadge = '<span class="type-badge">SERIES</span>';
    else if (entry.type === 'special') typeBadge = '<span class="type-badge">SPECIAL</span>';

    card.innerHTML = `
      <div class="case-number">${entry.narrativeOrder}.</div>
      <div class="case-info">
        <div class="case-title">${entry.title} ${typeBadge}</div>
        <div class="case-meta">
          <span>${entry.year}</span>
          ${creditBadge}
        </div>
      </div>
      <div class="case-status">
        ${isCurrent ? '<div class="watching-badge">&#9654; CURRENTLY WATCHING</div>' : ''}
        ${statusHtml}
      </div>
    `;

    // Pin toggle: flag/unflag straight from the list without opening the page.
    // For a series, "flag" means its first unwatched episode; "unflag" clears
    // any flagged episode it contains.
    if (!isUnreleased) {
      const pin = document.createElement('button');
      pin.className = 'pin-btn' + (isCurrent ? ' pinned' : '');
      pin.title = isCurrent ? 'Unflag currently watching' : 'Flag as currently watching';
      pin.innerHTML = isCurrent ? '&#9873;' : '&#9872;';
      pin.addEventListener('click', async (e) => {
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

  el('progress-fill').style.width = totalCount ? `${(watchedCount / totalCount) * 100}%` : '0%';
  el('progress-label').textContent = `${watchedCount} / ${totalCount} viewed`;
}

function creditLabel(postCredit) {
  if (postCredit.count === 0) return 'No credit scene';
  if (postCredit.count === 1) return '1 credit scene';
  return `${postCredit.count} credit scenes`;
}

function creditText(postCredit) {
  let base;
  if (postCredit.count === 0) {
    base = 'No credit scene — safe to leave once it ends.';
  } else if (postCredit.type === 'mid+post') {
    base = `Has both a mid-credit and a post-credit scene (${postCredit.count} total) — stay through the whole credits.`;
  } else if (postCredit.type === 'mid') {
    base = `Has 1 mid-credit scene — you can leave once credits start rolling.`;
  } else {
    base = `Has ${postCredit.count} post-credit scene${postCredit.count > 1 ? 's' : ''} — stay through to the very end.`;
  }
  return postCredit.timing ? `${base} ${postCredit.timing}` : base;
}

function formatRating(rating) {
  return Number(rating).toFixed(1);
}

// Builds the two-tier "watch for" + spoiler markup shared by the detail page and the series modal
function watchForBlockHtml(entry) {
  if (!entry.watchFor || !entry.watchFor.length) return '';
  return `
    <div class="modal-section">
      <h4>Important People &amp; Things to Watch For</h4>
      <div class="watchfor-list">
        ${entry.watchFor.map(watchForTagHtml).join('')}
      </div>
    </div>
    <div class="modal-section spoiler-block">
      <button class="spoiler-toggle" data-tier="film" data-uid="${entry.id}">⚠ Show Spoilers (This Movie)</button>
      <div class="spoiler-content" data-panel="film" data-uid="${entry.id}" hidden>
        <ul>
          ${entry.watchFor.map(w => `<li><strong>${w.name}:</strong> ${w.thisFilm}</li>`).join('')}
        </ul>
      </div>
    </div>
    <div class="modal-section spoiler-block">
      <button class="spoiler-toggle future-toggle" data-tier="future" data-uid="${entry.id}">⚠⚠ Show Spoilers (Future Movies)</button>
      <div class="spoiler-content" data-panel="future" data-uid="${entry.id}" hidden>
        <ul>
          ${entry.watchFor.map(w => `<li><strong>${w.name}:</strong> ${w.future}${w.spoils ? ` <span class="spoils-tag">Spoils: ${w.spoils}</span>` : ''}</li>`).join('')}
        </ul>
      </div>
    </div>
  `;
}

// In-universe setting chips ("Set: Spring 2023", "⏳ 5-year time skip") — only rendered
// when the data actually specifies them, since guessed dates aren't worth showing. Lives
// inside the Deep Dive section's "Why This Order" note rather than up top, to keep the
// top of the page uncluttered.
function timelineChipsHtml(entry) {
  if (!entry.inUniverseSetting) return '';
  let chips = `<span class="fact-chip timeline-chip">📅 Set: ${entry.inUniverseSetting}</span>`;
  if (entry.timeSkip) chips += `<span class="fact-chip timeskip-chip">⏳ ${entry.timeSkip}</span>`;
  return `<div class="quick-facts timeline-facts">${chips}</div>`;
}

// Builds the optional "Deep Dive" section: a fuller plot rundown, why it matters, and why
// it's placed here in narrative order. Collapsed by default since a full plot is a bigger
// spoiler than the one-line teaser summary.
function deepDiveBlockHtml(entry) {
  if (!entry.deepDive) return '';
  const { plot, significance, orderNote } = entry.deepDive;
  return `
    <div class="modal-section deepdive-block">
      <button class="deepdive-toggle" data-uid="${entry.id}">📖 Show Full Plot &amp; Context</button>
      <div class="deepdive-content" data-uid="${entry.id}" hidden>
        ${plot ? `<div class="deepdive-sub"><h5>The Full Plot</h5><p>${plot}</p></div>` : ''}
        ${significance ? `<div class="deepdive-sub"><h5>Why It Matters</h5><p>${significance}</p></div>` : ''}
        ${orderNote ? `<div class="deepdive-sub"><h5>Why This Order</h5><p>${orderNote}</p>${timelineChipsHtml(entry)}</div>` : ''}
      </div>
    </div>
  `;
}

function bindDeepDiveToggle(container) {
  container.querySelectorAll('.deepdive-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      const panel = container.querySelector(`.deepdive-content[data-uid="${uid}"]`);
      panel.hidden = !panel.hidden;
      btn.textContent = panel.hidden ? '📖 Show Full Plot & Context' : '📖 Hide Full Plot & Context';
    });
  });
}

// Static warning for the rare movie whose credit scene reveals something from a later
// point in the narrative-order watch-through — e.g. Black Widow, Ant-Man and the Wasp
function skipWarningHtml(postCredit) {
  if (!postCredit || !postCredit.skipNote) return '';
  return `<p class="skip-warning">[!] NOTE: ${postCredit.skipNote}</p>`;
}

// Optional-viewing note for titles that lean on movies outside the tracker's order
// (e.g. No Way Home and the pre-MCU Spider-Man films). Add an "optionalViewing"
// string to any entry in movies.json and it renders right under the summary.
function optionalViewingHtml(entry) {
  if (!entry.optionalViewing) return '';
  return `<p class="optional-viewing">[+] OPTIONAL VIEWING: ${entry.optionalViewing}</p>`;
}

function bindSpoilerToggles(container) {
  container.querySelectorAll('.spoiler-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const tier = btn.dataset.tier;
      const uid = btn.dataset.uid;
      const panel = container.querySelector(`.spoiler-content[data-panel="${tier}"][data-uid="${uid}"]`);
      panel.hidden = !panel.hidden;
      const label = tier === 'film' ? 'Spoilers (This Movie)' : 'Spoilers (Future Movies)';
      const icon = tier === 'film' ? '⚠' : '⚠⚠';
      btn.textContent = `${icon} ${panel.hidden ? 'Show' : 'Hide'} ${label}`;
    });
  });
}

// Series card click opens a picker: seasons as an accordion, each expanding to its episode list
function openEpisodeModal(series) {
  const content = el('modal-content');
  const sp = progress[series.id] || {};

  content.innerHTML = `
    <h3>${series.title}</h3>

    <div class="modal-section">
      <h4>Summary</h4>
      <p>${series.summary}</p>
      ${optionalViewingHtml(series)}
      ${skipWarningHtml(series.postCredit)}
    </div>

    ${deepDiveBlockHtml(series)}

    ${watchForBlockHtml(series)}

    <div class="modal-section">
      <h4>Your Rating</h4>
      <div class="rating-control" id="series-rating-control"></div>
    </div>

    <div class="modal-section">
      <h4>Seasons</h4>
      <div class="season-list" id="season-list"></div>
    </div>
  `;

  bindSpoilerToggles(content);
  bindDeepDiveToggle(content);
  renderRatingControl(series, sp.rating || 0, 'series-rating-control');

  const seasonListEl = el('season-list');
  series.seasons.forEach((season, idx) => {
    const watchedInSeason = season.episodes.filter(ep => progress[ep.id]?.watched).length;

    const block = document.createElement('div');
    block.className = 'season-block';

    const header = document.createElement('button');
    header.className = 'season-header';
    header.innerHTML = `
      <span>Season ${season.seasonNumber}</span>
      <span class="season-header-count">${watchedInSeason} / ${season.episodes.length} watched</span>
    `;

    const list = document.createElement('div');
    list.className = 'episode-list';
    list.hidden = idx !== 0; // first season open by default

    season.episodes.forEach(ep => {
      const p = progress[ep.id] || {};
      const row = document.createElement('button');
      row.className = 'episode-row' + (p.watched ? ' watched' : '');
      row.innerHTML = `
        <span class="episode-num">${ep.episodeNumber}.</span>
        <span class="episode-title">${ep.title}</span>
        ${watching.includes(ep.id) ? `<span class="watching-badge">&#9654; WATCHING</span>` : ''}
        ${p.watched ? `<span class="watched-stamp">VIEWED</span>` : ''}
      `;
      row.addEventListener('click', () => {
        closeModal();
        location.hash = `watch/${ep.id}`;
      });
      list.appendChild(row);
    });

    header.addEventListener('click', () => { list.hidden = !list.hidden; });

    block.appendChild(header);
    block.appendChild(list);
    seasonListEl.appendChild(block);
  });

  el('modal-backdrop').classList.add('open');
}

function closeModal() {
  el('modal-backdrop').classList.remove('open');
}

// Full-page detail view for a single movie or episode
function renderDetail({ item, phase, series, season }) {
  el('detail-back-btn').textContent = `← ${phase.name}`;
  el('detail-back-btn').onclick = () => { location.hash = phase.id; };

  const p = progress[item.id] || {};
  const isUnreleased = item.released === false;

  const titleHtml = series ? `${series.title} — S${season.seasonNumber}E${item.episodeNumber}: ${item.title}` : item.title;

  const isFlagged = watching.includes(item.id);
  const controlsHtml = isUnreleased
    ? `<div class="modal-section"><span class="unreleased-note">🕒 Not yet released${item.expectedRelease ? ` — expected ${item.expectedRelease}` : ''}. Check back after it premieres to log it here.</span></div>`
    : `
      <div class="controls-row">
        <button class="watch-toggle ${p.watched ? 'is-watched' : ''}" id="watch-toggle-btn">
          ${p.watched ? '✓ Watched' : 'Mark as Watched'}
        </button>
        <button class="flag-toggle ${isFlagged ? 'is-flagged' : ''}" id="flag-toggle-btn">
          ${isFlagged ? '&#9654; Currently Watching' : '&#9655; Flag as Currently Watching'}
        </button>
        <div class="rating-control" id="rating-control"></div>
        ${p.watched && p.watchedAt ? `<div class="watched-timestamp">Logged: ${new Date(p.watchedAt).toLocaleString()}</div>` : ''}
      </div>
    `;

  el('detail-content').innerHTML = `
    <h3>${titleHtml}</h3>

    <div class="modal-section">
      <h4>Summary</h4>
      <p>${item.summary}</p>
      ${optionalViewingHtml(item)}
      ${skipWarningHtml(item.postCredit)}
    </div>

    ${deepDiveBlockHtml(item)}

    ${watchForBlockHtml(item)}

    ${item.postCredit ? `<div class="modal-section"><span class="credit-note">${creditText(item.postCredit)}</span></div>` : ''}

    ${controlsHtml}
  `;

  bindSpoilerToggles(el('detail-content'));
  bindDeepDiveToggle(el('detail-content'));

  if (!isUnreleased) {
    renderRatingControl(item, p.rating || 0, 'rating-control');

    el('watch-toggle-btn').addEventListener('click', async () => {
      const nowWatched = !p.watched;
      const updated = await updateProgress(item.id, { watched: nowWatched });
      progress[item.id] = updated;
      if (nowWatched) {
        const next = nextUnwatchedAfter(item.id);
        if (watching.includes(item.id)) {
          // advance this unit's flag to the next unwatched thing (or drop it at the end)
          await setWatching(watching.map(w => w === item.id ? next : w).filter(Boolean).slice(0, 2));
        } else if (!watching.length && next) {
          // no flags yet — bootstrap one on whatever comes next
          await setWatching([next]);
        }
      }
      renderDetail({ item, phase, series, season });
    });

    el('flag-toggle-btn').addEventListener('click', async () => {
      await toggleFlag(item.id);
      renderDetail({ item, phase, series, season });
    });
  }
}

function renderRatingControl(item, currentRating, containerId) {
  const container = el(containerId);
  container.innerHTML = `
    <button class="rating-arrow" data-action="down" aria-label="Decrease rating">&#9660;</button>
    <span class="rating-value">${currentRating ? formatRating(currentRating) : '—'}/10</span>
    <button class="rating-arrow" data-action="up" aria-label="Increase rating">&#9650;</button>
  `;

  container.querySelector('[data-action="down"]').addEventListener('click', async () => {
    const next = Math.max(0, currentRating - 0.5);
    const updated = await updateProgress(item.id, { rating: next });
    progress[item.id] = updated;
    renderRatingControl(item, next, containerId);
  });

  container.querySelector('[data-action="up"]').addEventListener('click', async () => {
    const next = Math.min(10, currentRating + 0.5);
    const updated = await updateProgress(item.id, { rating: next });
    progress[item.id] = updated;
    renderRatingControl(item, next, containerId);
  });
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
