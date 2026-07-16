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
}

// Finds a movie or episode by id anywhere in the data, along with its parent phase (and parent series, for episodes)
function findItem(id) {
  for (const phase of phasesData) {
    for (const entry of phase.movies) {
      if (entry.id === id) return { item: entry, phase, series: null };
      if (entry.type === 'series' && entry.episodes) {
        const ep = entry.episodes.find(e => e.id === id);
        if (ep) return { item: ep, phase, series: entry };
      }
    }
  }
  return null;
}

// A "unit" is a movie, or one episode of a series — used for progress counts
function unitCounts(entry) {
  if (entry.type === 'series') {
    const total = entry.episodes.length;
    const watched = entry.episodes.reduce((n, ep) => n + (progress[ep.id]?.watched ? 1 : 0), 0);
    return { watched, total };
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
    const { watched, total } = unitCounts(entry);
    watchedCount += watched;
    totalCount += total;

    const card = document.createElement('div');
    card.className = 'case-card' + (watched === total ? ' watched' : '');
    card.addEventListener('click', () => {
      if (isSeries) {
        openEpisodeModal(entry);
      } else {
        location.hash = `watch/${entry.id}`;
      }
    });

    const creditBadge = entry.postCredit
      ? `<span class="credit-badge">🎬 ${creditLabel(entry.postCredit)}</span>`
      : '';

    const p = progress[entry.id] || {};
    const statusHtml = isSeries
      ? `<span class="episode-count-badge">${watched} / ${total} episodes</span>`
      : `
        ${p.watched
          ? `<span class="watched-stamp">VIEWED</span>`
          : `<span class="unwatched-mark">unwatched</span>`}
        ${p.rating ? `<div class="rating-display">${formatRating(p.rating)}/10</div>` : ''}
      `;

    card.innerHTML = `
      <div class="case-number">${entry.narrativeOrder}.</div>
      <div class="case-info">
        <div class="case-title">${entry.title} ${isSeries ? '<span class="type-badge">SERIES</span>' : ''}</div>
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

// Series card click opens a picker listing episodes; each episode opens its own detail page
function openEpisodeModal(series) {
  const content = el('modal-content');
  content.innerHTML = `
    <h3>${series.title}</h3>
    <div class="modal-year">${series.year} · Narrative #${series.narrativeOrder}</div>
    <div class="modal-section">
      <h4>Summary</h4>
      <p>${series.summary}</p>
    </div>
    <div class="modal-section">
      <h4>Episodes</h4>
      <div class="episode-list" id="episode-list"></div>
    </div>
  `;

  const list = el('episode-list');
  series.episodes.forEach(ep => {
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

  el('modal-backdrop').classList.add('open');
}

function closeModal() {
  el('modal-backdrop').classList.remove('open');
}

// Full-page detail view for a single movie or episode
function renderDetail({ item, phase, series }) {
  el('detail-back-btn').textContent = `← ${phase.name}`;
  el('detail-back-btn').onclick = () => { location.hash = phase.id; };

  const p = progress[item.id] || {};

  const titleHtml = series ? `${series.title} — Ep. ${item.episodeNumber}: ${item.title}` : item.title;
  const metaHtml = series
    ? `${series.year} · Episode ${item.episodeNumber}`
    : `${item.year} · Narrative #${item.narrativeOrder} · Release #${item.releaseOrder}`;

  const watchForHtml = (item.watchFor && item.watchFor.length) ? `
    <div class="modal-section">
      <h4>Important People &amp; Things to Watch For</h4>
      <div class="watchfor-list">
        ${item.watchFor.map(w => `<span class="watchfor-tag">${w.name}</span>`).join('')}
      </div>
    </div>
    <div class="modal-section spoiler-block">
      <button class="spoiler-toggle" id="spoiler-toggle">⚠ Show Spoilers</button>
      <div class="spoiler-content" id="spoiler-content" hidden>
        <ul>
          ${item.watchFor.map(w => `<li><strong>${w.name}:</strong> ${w.note}</li>`).join('')}
        </ul>
      </div>
    </div>
  ` : '';

  el('detail-content').innerHTML = `
    <h3>${titleHtml}</h3>
    <div class="modal-year">${metaHtml}</div>

    <div class="modal-section">
      <h4>Summary</h4>
      <p>${item.summary}</p>
    </div>

    ${watchForHtml}

    ${item.postCredit ? `<div class="modal-section"><span class="credit-note">${creditText(item.postCredit)}</span></div>` : ''}

    <div class="controls-row">
      <button class="watch-toggle ${p.watched ? 'is-watched' : ''}" id="watch-toggle-btn">
        ${p.watched ? '✓ Watched' : 'Mark as Watched'}
      </button>
      <div class="rating-control" id="rating-control"></div>
      ${p.watched && p.watchedAt ? `<div class="watched-timestamp">Logged: ${new Date(p.watchedAt).toLocaleString()}</div>` : ''}
    </div>
  `;

  renderRatingControl(item, p.rating || 0);

  if (item.watchFor && item.watchFor.length) {
    el('spoiler-toggle').addEventListener('click', () => {
      const box = el('spoiler-content');
      box.hidden = !box.hidden;
      el('spoiler-toggle').textContent = box.hidden ? '⚠ Show Spoilers' : '⚠ Hide Spoilers';
    });
  }

  el('watch-toggle-btn').addEventListener('click', async () => {
    const updated = await updateProgress(item.id, { watched: !p.watched });
    progress[item.id] = updated;
    renderDetail({ item, phase, series });
  });
}

function renderRatingControl(item, currentRating) {
  const container = el('rating-control');
  container.innerHTML = `
    <button class="rating-arrow" id="rating-down" aria-label="Decrease rating">&#9660;</button>
    <span class="rating-value" id="rating-value">${currentRating ? formatRating(currentRating) : '—'}/10</span>
    <button class="rating-arrow" id="rating-up" aria-label="Increase rating">&#9650;</button>
  `;

  el('rating-down').addEventListener('click', async () => {
    const next = Math.max(0, currentRating - 0.5);
    const updated = await updateProgress(item.id, { rating: next });
    progress[item.id] = updated;
    renderRatingControl(item, next);
  });

  el('rating-up').addEventListener('click', async () => {
    const next = Math.min(10, currentRating + 0.5);
    const updated = await updateProgress(item.id, { rating: next });
    progress[item.id] = updated;
    renderRatingControl(item, next);
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
