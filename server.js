const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3939;

const MOVIES_PATH = path.join(__dirname, 'data', 'movies.json');
const CHARACTERS_PATH = path.join(__dirname, 'data', 'characters.json');
const PROGRESS_PATH = path.join(__dirname, 'data', 'progress.json');
// Written just before an import overwrites the save file — the one undo we have
const BACKUP_PATH = path.join(__dirname, 'data', 'progress.backup.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadProgress() {
  if (!fs.existsSync(PROGRESS_PATH)) {
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf-8'));
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2));
}

// Get all movie/phase data
app.get('/api/phases', (req, res) => {
  const data = JSON.parse(fs.readFileSync(MOVIES_PATH, 'utf-8'));
  res.json(data);
});

// Get the character database
app.get('/api/characters', (req, res) => {
  const data = JSON.parse(fs.readFileSync(CHARACTERS_PATH, 'utf-8'));
  res.json(data);
});

// Get saved progress (watched status, ratings, timestamps) for all movies
app.get('/api/progress', (req, res) => {
  res.json(loadProgress());
});

// Replace the whole save file from an exported copy.
//
// This is the only destructive write in the app, and progress.json can't be
// regenerated from anything else — so the incoming payload is validated whole
// (a malformed file is rejected outright rather than half-written), and the
// current file is copied to data/progress.backup.json before it's replaced.
// Accepts either an export wrapper ({ app, version, progress }) or a bare
// progress object, so a raw copy of progress.json imports too.
app.post('/api/progress/import', (req, res) => {
  const body = req.body;
  const incoming = body && typeof body === 'object' && body.progress ? body.progress : body;

  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Not a save file: expected a JSON object of entries.' });
  }

  const clean = {};
  for (const [id, value] of Object.entries(incoming)) {
    if (id === '_watching') {
      if (!Array.isArray(value) || value.length > 2 || !value.every(i => typeof i === 'string')) {
        return res.status(400).json({ error: '_watching must be an array of up to 2 id strings.' });
      }
      clean._watching = value;
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return res.status(400).json({ error: `Entry "${id}" is not an object.` });
    }
    const { watched, watchedAt, rating } = value;
    if (watched !== undefined && typeof watched !== 'boolean') {
      return res.status(400).json({ error: `Entry "${id}" has a non-boolean "watched".` });
    }
    if (watchedAt !== undefined && watchedAt !== null && typeof watchedAt !== 'string') {
      return res.status(400).json({ error: `Entry "${id}" has an invalid "watchedAt".` });
    }
    if (rating !== undefined && rating !== null && (typeof rating !== 'number' || rating < 0 || rating > 10)) {
      return res.status(400).json({ error: `Entry "${id}" has a rating outside 0–10.` });
    }
    // Copy the entry through rather than rebuilding it from known fields —
    // older saves carry keys this version doesn't read (postCreditSeen), and
    // an import must never be the thing that quietly drops them.
    clean[id] = { ...value };
  }

  if (fs.existsSync(PROGRESS_PATH)) fs.copyFileSync(PROGRESS_PATH, BACKUP_PATH);
  saveProgress(clean);

  const entries = Object.keys(clean).filter(k => k !== '_watching').length;
  res.json({ ok: true, entries, backup: 'data/progress.backup.json' });
});

// Update progress for a single movie: { watched: bool, rating: number|null }
app.post('/api/progress/:movieId', (req, res) => {
  const { movieId } = req.params;
  const { watched, rating } = req.body;

  const progress = loadProgress();
  const existing = progress[movieId] || {};

  const updated = { ...existing };

  if (typeof watched === 'boolean') {
    updated.watched = watched;
    if (watched && !existing.watchedAt) {
      updated.watchedAt = new Date().toISOString();
    }
    if (!watched) {
      updated.watchedAt = null;
    }
  }

  if (rating !== undefined) {
    updated.rating = rating;
  }

  progress[movieId] = updated;
  saveProgress(progress);
  res.json({ movieId, ...updated });
});

// Set the "currently watching" flags: up to 2 unit ids, stored in progress.json
// under the reserved _watching key (never a real entry id, so it can't collide)
app.post('/api/now-watching', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length > 2 || !ids.every(i => typeof i === 'string')) {
    return res.status(400).json({ error: 'ids must be an array of up to 2 id strings' });
  }
  const progress = loadProgress();
  progress._watching = ids;
  saveProgress(progress);
  res.json({ _watching: ids });
});

app.listen(PORT, () => {
  console.log(`\nMCU Tracker running!`);
  console.log(`Open http://localhost:${PORT} in your browser\n`);
});
