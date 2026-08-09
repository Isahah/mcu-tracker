# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal MCU watch tracker: Express serves a JSON API over flat files (no database), and a vanilla-JS frontend (no framework, no build step, no bundler) consumes it. Runs locally; the user eventually wants it public and free (never monetised — see Licensing below).

Its whole point is **narrative order without spoilers**: every title is placed by when the story happens, and anything that could spoil sits behind a toggle the reader opens deliberately.

## Commands

- `npm install` — one-time dependency install (Express is the only dependency)
- `npm start` — runs `node server.js`, serves at http://localhost:3939
- `node scripts/fetch-artwork.js` — pull TMDB poster/backdrop paths (`--refresh` re-fetches everything, `--dry-run` writes nothing)
- No test suite, linter, or build step.

## Architecture

### Server (`server.js`)

A thin Express layer (~80 lines). Three JSON files read/written directly from disk:
- `data/movies.json` — canonical content (phases, movies, series, episodes)
- `data/characters.json` — the character database
- `data/progress.json` — personal save data, gitignored, auto-created empty

Six endpoints: `GET /api/phases`, `GET /api/characters`, `GET /api/progress`, `POST /api/progress/import` (replaces the whole save file — see below), `POST /api/progress/:id` (merges `{watched, rating}`; `watchedAt` stamped on first true, cleared on false), `POST /api/now-watching` (replaces the flag list — up to 2 unit ids under the reserved `_watching` key).

`/api/progress/import` **must stay registered before `/api/progress/:id`**, or Express matches `import` as a movie id. The port is `process.env.PORT || 3939`, so a second instance can run alongside the usual one for testing.

### Data model (`data/movies.json`)

`{ phases: [ { id, name, label, movies: [...] } ] }`. Each phase holds movies, TV specials and full series, distinguished by `type: "movie" | "series" | "special"`.

Required on every entry: `id`, `title`, `year`, `narrativeOrder`, `releaseOrder`, `type`, `summary`. Optional (all gracefully omitted from the UI when absent — never add empty placeholders):

- `art: { tmdbId, poster, backdrop }` — TMDB **path fragments** only, written by `scripts/fetch-artwork.js`. Never hand-edit; re-run the script instead.
- `beforeWatch: { context, watchFirst }` — `context` is spoiler-free prose ("what you need to know going in"); `watchFirst` is an array of entry ids rendered as linked chips. **Spoiler rule for `context`**: it may reference outcomes of titles *earlier* in narrative order (the viewer has seen them), never this title's own events or anything later.
- `optionalViewing` — an **array** of strings rendered as chips under "Helps, but optional" (a plain string still renders as prose). An item matching an entry id becomes a link to that title; anything else (films outside the tracker) renders as a plain chip.
- `inUniverseSetting` / `timeSkip` — only when genuinely established, never guessed. Both render as hero chips; `timeSkip` is skipped as a chip if over 60 chars (still appears in "When this happens").
- `deepDive: { plot, significance, orderNote }` — full plot, why it matters, why it sits here.
- `watchFor: [{ name, thisFilm, future, spoils?, characterId? }]` — the two-tier spoiler system.
- `postCredit: { count, type, timing?, skipNote? }` — **only `skipNote` still renders.** Counts and timing were removed as noise by the design. `skipNote` survives because it's spoiler protection, not trivia (currently Black Widow and Ant-Man and the Wasp only).
- `released: false` + `expectedRelease` — excluded from watched-count denominators.
- series only: `seasons: [{ seasonNumber, episodes: [...] }]` — always nested under `seasons`, even for one season.

**narrativeOrder vs releaseOrder**: `narrativeOrder` is per-phase and drives all display. `releaseOrder` is a global sequence kept as trivia. Phases group by *when the story happens*, not Marvel's release branding — Captain Marvel sits in Phase One (1995), Black Widow in Phase Three (2016). Follow that precedent.

**Multi-season shows split into separate entries** when their seasons belong at different points in the watch order. Loki is the precedent: `loki` ("Loki: Season 1") and `loki-s2` ("Loki: Season 2") with Quantumania between them, because Kang is introduced in that film. Episode ids stay `loki-s1e1` … `loki-s2e6` so watch history survives. Keep the `seasons` wrapper on both.

**Series get one Deep Dive**, at the series level, never per-episode. Only a few pivotal episodes carry their own `watchFor`.

### Save data (`data/progress.json`)

Flat object keyed by entry id (movie, episode, or series id for a series-level rating). Shape: `{ watched?, watchedAt?, rating? }`, rating 0–10 in 0.5 steps. A few entries also carry `postCreditSeen` from an earlier feature — nothing reads it, but nothing may drop it either. Gitignored and personal — **never hand-edit, and back it up before any test that writes progress.** Purely local UI preferences (e.g. the artwork density toggle) go in `localStorage`, not here.

**Export / import** (the `.save-utility` row at the foot of the menu — deliberately not a card, since housekeeping shouldn't outrank the phases). Export is client-side: it re-fetches `/api/progress` and downloads `mcu-field-log-<date>.json`, a wrapper of `{ app, version, exportedAt, progress }`. Import posts to `/api/progress/import`, which accepts either that wrapper or a bare copy of `progress.json`, validates the payload **whole** (any bad entry rejects the lot — never a half-written save), copies the current file to `data/progress.backup.json`, then writes. Unknown keys on an entry are copied through deliberately. The page reloads afterwards rather than re-syncing each screen.

### Frontend (`public/app.js`, single file, no framework)

Hash router (`route()`) toggles five screens via `showScreen()`:
- `#/` → menu: masthead, resume card(s) for currently-watching, roman-numeral phase cards, Character Database card, Save data utility row
- `#/<phase-id>` → phase list with phase-to-phase nav, filter strip, poster rows
- `#/watch/<item-id>` → detail page for a movie, special or episode
- `#/characters` → character database (search, sort, browse-by-title)
- `#/character/<char-id>` → personnel file

Series have no detail page: `#/watch/<series-id>` redirects to the phase list and opens the episode picker (`openEpisodeModal`). `findItem(id)` resolves any id to `{ item, phase, series, season }`.

A **sticky app bar** sits above every screen with the overall watched count; the wordmark links home. A **footer** (`mountFooters()`) is appended to every `.screen-inner` with the TMDB attribution and the not-affiliated-with-Marvel disclaimer.

### Design system

`public/styles.css` is the **Ink Navy** stylesheet, copied verbatim from `design_handoff_mcu_field_log/mcu-field-log-v4.css`. **Don't edit it** — local changes go in `public/app-tweaks.css`, which loads after, so a newer handoff can be dropped straight in.

The system rests on a status colour law: **brass = watched, crimson = in progress / spoilers, grey = unwatched**. Every status is signalled three ways at once (left edge, numeral, pill). Don't introduce other colours.

Three image ratios, each with one meaning: **2:3** title poster, **16:9** title backdrop, **1:1** person in a grid, **3:4** person on their own page.

Disclosure panels use `aria-expanded` on the button plus a hidden body (`bindReveals`). A button must never sit at `aria-expanded="true"` with no body.

### Title artwork (TMDB)

`scripts/fetch-artwork.js` looks up every title and writes `art` blocks. The key lives in **`tmdb.key`** (gitignored; `tmdb.key.example` is the committed template).

- Only path fragments are stored; images always load from TMDB's CDN. **TMDB's terms cap caching at six months** — re-run with `--refresh` periodically.
- Sizes: `w92` phase-list thumb, `w154` resume poster, `w342` hero poster, `w1280`/`w780` backdrop.
- Images are **never** filtered, tinted or overlaid — status is signalled by a ring on the `.art` box instead.
- No artwork → a hashed monogram tile (`.art--poster.no-photo--tN` + `.art-none` initials). Everything works without TMDB.
- Detail pages and the series pop-up use the **10c card wash**: `.card-wash` as first child of `.dossier`/`#modal-content`, which carries `has-wash`. The alternative `.title-hero--bleed` (10b) is a one-class swap if bright backdrops wash out. Never add `overflow: hidden` to the modal.
- Artwork can be toggled off per-user via the density chip (`is-compact` on `#case-files`, persisted in localStorage).

### Two-tier spoiler system

Each `watchFor` item has two payloads. **Plot & context** (brass panel) holds the deep dive plus each item's `thisFilm`; **Spoilers for future films** (crimson panel) holds each `future` with its `spoils` tag. Don't merge them — finishing one title must not spoil a different one.

### Character database (`data/characters.json`)

`{ characters: [ { id, name, description, titles, image?, imagePosition?, phases } ] }`, in curated display order (roughly heroes → supporting → antagonists).

- `description` — 1–2 sentences at introduction/premise level. Never twists, deaths or late turns.
- `titles` — single-line array of entry ids in narrative order; powers the "Browse by film or series" cast filter, which is collapsed behind a spoiler warning. Unreleased titles excluded.
- `phases` — map of phase id → paragraph. Full spoilers for *that* phase are fine; never leak a later phase into an earlier entry.
- The file page shows **all six phases** for every character, so the list itself reveals nothing. Row state is driven by the **user's own progress**: brass `has-record` for a phase they've finished, crimson `is-unseen` with a "NOT SEEN" chip otherwise.
- Roster threshold: somewhat-important through really-important. Recurring side characters in, one-scene cameos out.
- `image` → `public/img/characters/<id>.<ext>`. Portraits are full colour (greyscale was removed). `imagePosition` (CSS `object-position`) shifts the square crop — use `"top"` for tall portraits rather than re-cropping files. Most images came from the MCU Fandom wiki; note their served files are often WebP regardless of extension.

### "Currently watching" flags

Up to 2 units flagged; ids in `progress.json` under `_watching`. A fixed corner dock shows a chip per flag on every screen (the label is dropped when two are flagged so both fit). Flagging is a detail-page button plus a pin on each phase-list row. Marking a flagged unit watched **auto-advances** the flag to the next unwatched unit in global narrative order; marking anything watched with no flags bootstraps one. Unwatching never touches flags.

### Series pop-up

Episodes have checkboxes (`.ep-check`) so you can tick them without leaving; `.season-mark` bulk-toggles a season and **needs `stopPropagation`** since it sits inside the header button. Ticking anything redraws the phase list behind the modal. **Single-season shows render their episodes directly with no accordion** — the bulk toggle moves to the `.episodes-head` heading.

### watchFor → character linking

Tags render as links to `#/character/<id>` when they resolve. Order: an explicit `characterId` always wins; otherwise any `/`-segment of the name (parentheticals stripped, case-insensitive) matching a character's name. Unmatched names (concepts like "The Tesseract") stay plain chips on purpose.

## Content conventions

- `summary` — one spoiler-light sentence; anything more revealing goes in `deepDive.plot`.
- Only add month/season precision to `inUniverseSetting` when confirmed.
- `postCredit.skipNote` is rare and deliberate.
- When editing `movies.json` programmatically: entries are **not** uniformly formatted (hand-edits have left some as `},{` on one line). Find entry bounds by brace-matching from the nearest `{` before `"id"`, never by assuming a newline. Insert new keys **before** the `summary` line — on unreleased entries `summary` is last and has no trailing comma.

## Licensing / legal posture

- TMDB free tier is **non-commercial**. Ads, affiliate links or donations would require a separate commercial agreement with TiVo. The user has decided to keep it free.
- Attribution is mandatory and lives in the footer. The **official TMDB logo** must be used as a file, never redrawn — TMDB's `blue_short` SVG sits at `public/assets/tmdb.svg`, sized by `.tmdb-logo` in the handoff stylesheet and never recoloured or filtered.
- Character portraits are studio stills sourced from fan wikis — the same posture as comparable fan trackers. Fine for a free project; would need revisiting if monetised.

## Workflow

- **Always ask before committing.** Pushing needs its own separate ask.
- The user's own small content tweaks (image swaps, data edits) don't need their own commit — let them ride along.
- **Back up `data/progress.json` before any test that writes progress**, and restore it afterwards.
- The user welcomes unprompted suggestions — offer them.

## Not yet built

- Overall stats (hours watched, average rating, etc.) — the last item from the original roadmap
- Public deploy (would mean moving save data to localStorage; see the session notes)
- 14 character portraits still to be hand-picked
- Possibly: Fox-era movies, an anime section
