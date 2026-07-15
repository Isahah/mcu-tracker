let phasesData = [];
let progress = {};
let activePhaseId = null;
let sortMode = 'narrative'; // 'narrative' | 'release'

const el = (id) => document.getElementById(id);

async function init() {
  const [phasesRes, progressRes] = await Promise.all([
    fetch('/api/phases').then(r => r.json()),
    fetch('/api/progress').then(r => r.json())
  ]);
  phasesData = phasesRes.phases;
  progress = progressRes;

  el('sort-toggle').addEventListener('click', () => {
    sortMode = sortMode === 'narrative' ? 'release' : 'narrative';
    renderPhase();
  });

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
  const requestedId = location.hash.replace(/^#\/?/, '');
  const phase = phasesData.find(p => p.id === requestedId);

  if (phase) {
    activePhaseId = phase.id;
    el('screen-menu').hidden = true;
    el('screen-phase').hidden = false;
    renderPhase();
  } else {
    activePhaseId = null;
    el('screen-menu').hidden = false;
    el('screen-phase').hidden = true;
    renderMenu();
  }
  window.scrollTo(0, 0);
}

function phaseWatchedCount(phase) {
  return phase.movies.reduce((n, m) => n + (progress[m.id]?.watched ? 1 : 0), 0);
}

function renderMenu() {
  const grid = el('phase-grid');
  grid.innerHTML = '';

  phasesData.forEach(phase => {
    const total = phase.movies.length;
    const watched = phaseWatchedCount(phase);

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

  const movies = [...phase.movies].sort((a, b) => {
    const key = sortMode === 'narrative' ? 'narrativeOrder' : 'releaseOrder';
    return a[key] - b[key];
  });

  const container = el('case-files');
  container.innerHTML = '';

  let watchedCount = 0;

  movies.forEach(movie => {
    const p = progress[movie.id] || {};
    if (p.watched) watchedCount++;

    const card = document.createElement('div');
    card.className = 'case-card' + (p.watched ? ' watched' : '');
    card.addEventListener('click', () => openModal(movie));

    const orderNum = sortMode === 'narrative' ? movie.narrativeOrder : movie.releaseOrder;
    const creditLabel = movie.postCredit.count === 0
      ? 'No credit scene'
      : movie.postCredit.count === 1
      ? '1 credit scene'
      : `${movie.postCredit.count} credit scenes`;

    card.innerHTML = `
      <div class="case-number">${orderNum}.</div>
      <div class="case-info">
        <div class="case-title">${movie.title}</div>
        <div class="case-meta">
          <span>${movie.year}</span>
          <span class="credit-badge">🎬 ${creditLabel}</span>
        </div>
      </div>
      <div class="case-status">
        ${p.watched
          ? `<span class="watched-stamp">VIEWED</span>`
          : `<span class="unwatched-mark">unwatched</span>`}
        ${p.rating ? `<div class="rating-display">${'★'.repeat(p.rating)}${'☆'.repeat(10 - p.rating)}</div>` : ''}
      </div>
    `;
    container.appendChild(card);
  });

  const total = movies.length;
  el('progress-fill').style.width = total ? `${(watchedCount / total) * 100}%` : '0%';
  el('progress-label').textContent = `${watchedCount} / ${total} viewed`;
}

function openModal(movie) {
  const p = progress[movie.id] || {};
  const content = el('modal-content');

  const creditText = movie.postCredit.count === 0
    ? `No credit scene — safe to leave once the movie ends.`
    : movie.postCredit.type === 'mid+post'
    ? `Has both a mid-credit and a post-credit scene (${movie.postCredit.count} total) — stay through the whole credits.`
    : movie.postCredit.type === 'mid'
    ? `Has 1 mid-credit scene — you can leave once credits start rolling.`
    : `Has ${movie.postCredit.count} post-credit scene${movie.postCredit.count > 1 ? 's' : ''} — stay through to the very end.`;

  content.innerHTML = `
    <h3>${movie.title}</h3>
    <div class="modal-year">${movie.year} · Narrative #${movie.narrativeOrder} · Release #${movie.releaseOrder}</div>

    <div class="modal-section">
      <h4>Summary</h4>
      <p>${movie.summary}</p>
    </div>

    <div class="modal-section">
      <h4>Key characters to track</h4>
      <div class="character-tags">
        ${movie.keyCharacters.map(c => `<span class="character-tag">${c}</span>`).join('')}
      </div>
    </div>

    <div class="modal-section">
      <span class="credit-note">${creditText}</span>
    </div>

    <div class="controls-row">
      <button class="watch-toggle ${p.watched ? 'is-watched' : ''}" id="watch-toggle-btn">
        ${p.watched ? '✓ Watched' : 'Mark as Watched'}
      </button>
      <div class="rating-stars" id="rating-stars"></div>
      ${p.watched && p.watchedAt ? `<div class="watched-timestamp">Logged: ${new Date(p.watchedAt).toLocaleString()}</div>` : ''}
    </div>
  `;

  renderStars(movie, p.rating || 0);

  el('watch-toggle-btn').addEventListener('click', async () => {
    const newWatched = !p.watched;
    const updated = await updateProgress(movie.id, { watched: newWatched });
    progress[movie.id] = updated;
    openModal(movie); // re-render modal with fresh state
    renderPhase();
  });

  el('modal-backdrop').classList.add('open');
}

function renderStars(movie, currentRating) {
  const starContainer = el('rating-stars');
  starContainer.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const span = document.createElement('span');
    span.className = 'star' + (i <= currentRating ? ' filled' : '');
    span.textContent = i <= currentRating ? '★' : '☆';
    span.addEventListener('click', async (e) => {
      e.stopPropagation();
      const updated = await updateProgress(movie.id, { rating: i });
      progress[movie.id] = updated;
      renderStars(movie, i);
      renderPhase();
    });
    starContainer.appendChild(span);
  }
}

async function updateProgress(movieId, body) {
  const res = await fetch(`/api/progress/${movieId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

function closeModal() {
  el('modal-backdrop').classList.remove('open');
}

init();
