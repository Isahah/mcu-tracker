let phasesData = [];
let progress = {};
let activePhaseId = null;

const el = (id) => document.getElementById(id);

async function init() {
  const [phasesRes, progressRes] = await Promise.all([
    fetch('/api/phases').then(r => r.json()),
    fetch('/api/progress').then(r => r.json())
  ]);
  phasesData = phasesRes.phases;
  progress = progressRes;

  el('back-btn').addEventListener('click', () => {
    location.hash = '';
  });

  el('modal-close').addEventListener('click', closeModal);
  el('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });

  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);

  if (parts[0] === 'watch' && parts[1]) {
    const found = findItem(parts[1]);
    if (found) {
      showScreen('detail');
      renderDetail(found);
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
  document.querySelector('.dossier').classList.toggle('wide', name === 'detail');
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

    const card = document.createElement('div');
    card.className = 'case-card' + (isUnreleased ? ' unreleased' : (watched === total && total > 0 ? ' watched' : ''));
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
        ${statusHtml}
      </div>
    `;
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
  if (postCredit.count === 0) return 'No credit scene — safe to leave once it ends.';
  if (postCredit.type === 'mid+post') return `Has both a mid-credit and a post-credit scene (${postCredit.count} total) — stay through the whole credits.`;
  if (postCredit.type === 'mid') return `Has 1 mid-credit scene — you can leave once credits start rolling.`;
  return `Has ${postCredit.count} post-credit scene${postCredit.count > 1 ? 's' : ''} — stay through to the very end.`;
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
        ${entry.watchFor.map(w => `<span class="watchfor-tag">${w.name}</span>`).join('')}
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
        ${orderNote ? `<div class="deepdive-sub"><h5>Why This Order</h5><p>${orderNote}</p></div>` : ''}
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

// Small "quick facts" chip row shown near the top of a detail page / series modal
function quickFactsHtml(item, series, season) {
  if (series) {
    return `
      <div class="quick-facts">
        <span class="fact-chip">${series.year}</span>
        <span class="fact-chip">Season ${season.seasonNumber}</span>
        <span class="fact-chip">Episode ${item.episodeNumber}</span>
      </div>
    `;
  }
  return `
    <div class="quick-facts">
      <span class="fact-chip">${item.year}</span>
      <span class="fact-chip">Narrative #${item.narrativeOrder}</span>
      ${item.releaseOrder ? `<span class="fact-chip">Release #${item.releaseOrder}</span>` : ''}
    </div>
  `;
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
    ${quickFactsHtml(series, null, null)}

    <div class="modal-section">
      <h4>Summary</h4>
      <p>${series.summary}</p>
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

  const controlsHtml = isUnreleased
    ? `<div class="modal-section"><span class="unreleased-note">🕒 Not yet released${item.expectedRelease ? ` — expected ${item.expectedRelease}` : ''}. Check back after it premieres to log it here.</span></div>`
    : `
      <div class="controls-row">
        <button class="watch-toggle ${p.watched ? 'is-watched' : ''}" id="watch-toggle-btn">
          ${p.watched ? '✓ Watched' : 'Mark as Watched'}
        </button>
        <div class="rating-control" id="rating-control"></div>
        ${p.watched && p.watchedAt ? `<div class="watched-timestamp">Logged: ${new Date(p.watchedAt).toLocaleString()}</div>` : ''}
      </div>
    `;

  el('detail-content').innerHTML = `
    <h3>${titleHtml}</h3>
    ${quickFactsHtml(item, series, season)}

    <div class="modal-section">
      <h4>Summary</h4>
      <p>${item.summary}</p>
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
      const updated = await updateProgress(item.id, { watched: !p.watched });
      progress[item.id] = updated;
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
