/**
 * Local development server.
 *
 * The site is a static one: everything it needs lives in public/, including
 * the two data files, and watch history lives in each visitor's browser
 * (localStorage). So this server exists only so you can open the project on
 * this machine without a build step, and a host like Netlify serves the same
 * public/ folder with no Node involved at all.
 *
 * The single endpoint below is a migration aid: the first time the app runs
 * against this server it lifts an existing data/progress.json into the
 * browser, then never asks again. Once every browser you use has been
 * migrated, this can go too.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3939;

// Deliberately outside public/, so it is never served as a static file
const LEGACY_PROGRESS_PATH = path.join(__dirname, 'data', 'progress.json');

app.use(express.static(path.join(__dirname, 'public')));

// One-time migration source, read-only. Nothing writes to progress.json now.
app.get('/api/progress', (req, res) => {
  if (!fs.existsSync(LEGACY_PROGRESS_PATH)) return res.json({});
  try {
    res.json(JSON.parse(fs.readFileSync(LEGACY_PROGRESS_PATH, 'utf-8')));
  } catch (err) {
    res.status(500).json({ error: `Could not read the legacy save file: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`\nMCU Field Log running!`);
  console.log(`Open http://localhost:${PORT} in your browser\n`);
});
