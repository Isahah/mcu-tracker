# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal, local MCU watch tracker: Express serves a JSON API over two flat files (no database), and a vanilla-JS frontend (no framework, no build step, no bundler) consumes it. Runs entirely on the user's own machine.

## Commands

- `npm install` — one-time dependency install (Express is the only dependency)
- `npm start` — runs `node server.js`, serves the app at http://localhost:3939
- There is no test suite, linter, or build step in this project.

## Architecture

### Server (`server.js`)

A thin Express layer (~80 lines). Three JSON files are read/written directly from disk — no database:
- `data/movies.json` — canonical content (phases, movies, series, episodes)
- `data/characters.json` — the character database (see below)
- `data/progress.json` — the user's personal save data (watched/rating/timestamps), gitignored, auto-created empty on first run if missing

Five endpoints: `GET /api/phases` (entire movies.json), `GET /api/characters` (entire characters.json), `GET /api/progress` (entire progress.json), `POST /api/progress/:id` (merges `{watched, rating}` into that id's entry; `watchedAt` is stamped automatically the first time `watched` flips true, cleared when it flips false), `POST /api/now-watching` (replaces the "currently watching" flag list — an array of at most 2 unit ids, stored in progress.json under the reserved `_watching` key).

### Data model (`data/movies.json`)

`{ phases: [ { id, name, label, movies: [...] } ] }`. Despite the array being called `movies`, each phase can contain movies, one-off TV specials, or full TV series — distinguished by `type: "movie" | "series" | "special"`.

Common fields on every top-level entry: `id`, `title`, `year`, `narrativeOrder`, `releaseOrder`, `type`, `summary`. Optional fields (all gracefully omitted from the UI when absent — don't add empty/placeholder values just to fill them in):

- `inUniverseSetting` / `timeSkip` — only set when genuinely well-established, never guessed
- `deepDive: { plot, significance, orderNote }` — a fuller plot rundown, why the title matters to the wider story, and why it's placed at this `narrativeOrder`. Rendered as a collapsed "📖 Show Full Plot & Context" toggle since a full plot is a bigger spoiler than `summary`
- `watchFor: [{ name, thisFilm, future, spoils? }]` — the two-tier spoiler system (see below)
- `postCredit: { count, type, timing?, skipNote? }` — `timing` is qualitative guidance on when in the credits a scene lands; `skipNote` is a static warning for the rare title whose credit scene should be skipped and revisited later (added case-by-case, not as a blanket feature — currently only Black Widow and Ant-Man and the Wasp)
- `optionalViewing` — a plain string listing films *outside* this tracker's order that add context (e.g. No Way Home leaning on the pre-MCU Spider-Man movies). Rendered by `optionalViewingHtml()` directly under the summary, styled like `skipNote` (same red note treatment). Add it to any movie/special/series entry that wants one; phrase it as genuinely optional, never required viewing
- `released: false` + `expectedRelease` — unreleased/future titles. Excluded from watched-count denominators (`unitCounts()`); don't write `deepDive`/`watchFor` for these since nothing's happened yet, just a summary noting it's unreleased
- series only: `seasons: [{ seasonNumber, episodes: [{ id, episodeNumber, title, summary, watchFor?, postCredit? }] }]` — always nested under `seasons`, even for a one-season show

**narrativeOrder vs. releaseOrder**: `narrativeOrder` is scoped per-phase and drives all sorting/display (there is no release-order sort toggle in the UI — it was built, then removed by request). `releaseOrder` is a single global 1–N sequence across the whole dataset, shown only as trivia inside the Deep Dive section. Phases group entries by narrative/story fit, not by official Marvel Studios release-phase branding — e.g. Captain Marvel (released in Phase Three) lives in Phase One's array because it's set in 1995; Black Widow lives in Phase Three because it's set in 2016. Follow this precedent for new entries: bucket by when the story happens, not when it released.

**Series get one Deep Dive, not per-episode**: `deepDive` and `inUniverseSetting` are only written at the series level (shown in the episode-picker modal), never per-episode — writing full deep dives for all ~74 episodes was judged excessive. Only a handful of pivotal episodes carry their own `watchFor`.

### Save data (`data/progress.json`)

Flat object keyed by any entry id — a movie id, an episode id, or a series' own id (for a series-level rating, independent of episode-level watched status). Shape per key: `{ watched?, watchedAt?, rating? }`. `rating` is 0–10 in 0.5 steps. This file is gitignored and personal; don't hand-edit it or assume specific contents when reasoning about app behavior.

### Frontend (`public/app.js`, single file, no framework)

Hash-based client-side router (`route()`) toggles four screens via `showScreen()`:
- `#/` → menu (phase cards + a Character Database entry card below them)
- `#/<phase-id>` → phase list (case-cards sorted by `narrativeOrder`)
- `#/watch/<item-id>` → full-page detail view for a movie, special, or single episode
- `#/characters` → character database (dense grid of photo + name cards, uses the same `.dossier.wide` widening as the detail screen; a search box filters the grid live on character `name`, and the query persists when backing out of a character file but clears when the database is opened fresh)
- `#/character/<char-id>` → full-page personnel file for one character (portrait + name + overview; deliberately nothing on the grid cards themselves beyond photo/name, so browsing can't spoil)

Series are the one exception to direct navigation: clicking a series card opens a picker modal (`openEpisodeModal`) with seasons as an accordion (first season auto-expanded); only clicking an episode inside it navigates to `#/watch/<episode-id>`. `findItem(id)` resolves any id to `{ item, phase, series, season }` by walking `phasesData` once — `series`/`season` are `null` for a plain movie/special.

The detail screen widens its container (`.dossier.wide`, toggled in `showScreen()`) — this is deliberate, from user feedback that the detail view felt like a cramped "little box." Don't reintroduce a chip row (year/narrative#/release#) at the top of the detail page — that was tried and explicitly removed as clutter; in-universe timeline chips now live inside the Deep Dive section's "Why This Order" subsection instead (`timelineChipsHtml`).

Two-tier spoiler system (`watchFor` + `bindSpoilerToggles`): each `watchFor` item renders under two independently-toggled buttons — "Show Spoilers (This Movie)" reveals `thisFilm` (safe once you've seen *this* title), "Show Spoilers (Future Movies)" reveals `future` (safe only once you've also seen whatever `spoils` names). Don't collapse these back into one spoiler blob — the point is that finishing one movie shouldn't spoil a different, unwatched one.

## Content conventions when adding new movies/shows

- Keep `summary` to one spoiler-light sentence; put anything more revealing in `deepDive.plot`.
- Only add `inUniverseSetting` month/season precision when it's actually confirmed (e.g. Iron Man 3 and Hawkeye are canonically Christmas-set) — otherwise just the year.
- `postCredit.skipNote` is rare and deliberate, not something to add to every entry with a credit scene.

### Character database (`data/characters.json`)

`{ characters: [ { id, name, description, image?, phases? } ] }`, rendered by `renderCharacters()` (grid) and `renderCharacter()` (detail page) in curated display order (data order = display order; roughly heroes → supporting cast → antagonists). Conventions:

- `description` is 1–2 sentences, spoiler-light by feel: describe who the character is at their introduction/premise level, never twists, deaths, or late-story turns (e.g. Mysterio "claims to have come from another Earth"; Taskmaster's identity stays unstated).
- `titles` is a single-line array of `movies.json` entry ids, in narrative order — every released title the character appears in. It powers the "Browse by film or series" cast filter on the database screen, which is deliberately collapsed behind a spoiler warning (a cast list gives away who turns up). Ids are validated at render; an unknown id just drops out of the filter. Unreleased titles are deliberately excluded.
- `phases` is a map of phase id → paragraph (`{ "phase-1": "...", ... }`) covering what the character did in that phase and how they affected it. **Spoiler scoping**: full spoilers for that phase are allowed inside its entry (deaths, twists, reveals) — the reader chooses to expand a phase only after finishing it — but never leak a *later* phase's events into an earlier phase's entry. Omit phases the character isn't in (the UI shows a "no significant activity" line) and phases that only contain unreleased titles. Bucket by this tracker's narrative phases, not release phases (e.g. Captain Marvel content goes under phase-1, Black Widow under phase-3).
- The detail page renders **all six phases** for **every** character as a collapsed accordion, so the phase list itself reveals nothing about where a character appears.
- Roster threshold: somewhat-important through really-important characters. Recurring side characters (Luis, Darcy, Korg) are in; one-scene cameos are not.
- `image` is omitted until a real image exists — the UI renders a "NO PHOTO ON FILE" portrait placeholder when absent, and the card layout already reserves the square slot for it. To add a photo: drop the file in `public/img/characters/` (convention: `<character-id>.<ext>`) and set `"image": "/img/characters/<file>"` on the character (an external `https://` URL also works). Images are shown square via `object-fit: cover`, centered by default; optional `imagePosition` (CSS `object-position`, e.g. `"top"` or `"50% 20%"`) shifts which part of the photo the crop keeps — prefer that over re-cropping image files.

### "Currently watching" flags

Up to 2 units (movie/special/episode) can be flagged as currently watching; ids live in `progress.json` under `_watching` (a reserved key — never treat it as an entry id) via `POST /api/now-watching`. Behaviors, all in `app.js`:

- A fixed corner dock (`#now-watching-dock`, bottom-right, all screens) shows a clickable chip per flag linking to `#/watch/<id>`; hidden when no flags.
- Flagging is a toggle button on the detail page, plus a pin icon on each phase-list card (click doesn't navigate; on a series card it flags the series' first unwatched episode, and unpinning clears any flagged episode it contains). Flagging a third unit silently drops the oldest (`toggleFlag`).
- Marking a **flagged** unit watched auto-advances its flag to the next unwatched unit in global narrative order (`flatUnitIds`/`nextUnwatchedAfter` — phases in data order, entries by `narrativeOrder`, episodes in season order, skipping unreleased/watched/already-flagged). Marking anything watched when **no** flags exist bootstraps a flag on the next unit. Unwatching never touches flags.
- Phase-list cards (including a series containing a flagged episode) and episode rows get a brass `▶ CURRENTLY WATCHING` badge; flagged case-cards also get a brass left border (`.watching-now`).

### watchFor → character linking

`watchFor` name tags on the movie/episode detail page (and series modal) render as links to `#/character/<id>` when they resolve to a character (`watchForTagHtml` / `resolveWatchForCharacter` in `app.js`). Resolution rules, in order:

1. An explicit `"characterId": "<id>"` on the watchFor item in `movies.json` always wins — use this for phrasey names ("Mysterio's frame job", "General Ross"). Invalid ids fail safe to a plain tag.
2. Otherwise auto-match: any `/`-segment of the watchFor name (parentheticals stripped, case-insensitive, quotes/periods ignored) exactly equals any `/`-segment of a character's `name` in `characters.json` — "Kingpin / Wilson Fisk", "Hawkeye (cameo)", "Peter Parker (Spider-Man)" all link with no extra data.

So when adding a new watchFor item: just use the character's name (or `Name / Alias`) and the link happens automatically; only add `characterId` if the wording doesn't contain the exact name. Unmatched names (plot points like "The Tesseract") stay plain tags on purpose — don't force-link concepts/objects, and leave items naming two characters ("Wanda & Pietro Maximoff") unlinked unless one is clearly the subject.

## Workflow

- **Always ask before committing.** The user wants control over commit granularity — finish and verify the work, then ask. Pushing to a remote needs its own separate ask.

## Not yet built (per project roadmap)

- Character images (the portrait slot and `public/img/characters/` are ready, `image` field supported but unused)
- Overall stats (hours watched, average rating, etc.)
- Possibly: Fox-era movies, an anime section
