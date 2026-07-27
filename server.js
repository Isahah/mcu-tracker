const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3939;

const MOVIES_PATH = path.join(__dirname, 'data', 'movies.json');
const CHARACTERS_PATH = path.join(__dirname, 'data', 'characters.json');
const PROGRESS_PATH = path.join(__dirname, 'data', 'progress.json');

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
