# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal MCU watch tracker: a vanilla-JS frontend (no framework, no build step, no bundler) reading flat JSON files, with watch history in the browser. **No database and no backend** — it runs locally via a small dev server and deploys as a static site. Free, and never monetised (see Licensing below).

Its whole point is **narrative order without spoilers**: every title is placed by when the story happens, and anything that could spoil sits behind a toggle the reader opens deliberately.

## Commands

- `npm install` — one-time dependency install (Express is the only dependency)
- `npm start` — runs `node server.js`, serves at http://localhost:3939
- `node scripts/fetch-artwork.js` — pull TMDB poster/backdrop paths (`--refresh` re-fetches everything, `--dry-run` writes nothing)
- `npm run check` — read-only validator over the three data files. Run it after hand-editing. Catches JSON syntax errors with a line number, missing required fields, duplicate ids, `narrativeOrder` collisions and gaps, references that point at nothing (`watchFirst`, `characterId`, character `titles`), misspelled field names, missing portrait files, and save keys orphaned by a renamed id. Exits non-zero on errors. `MCU_DATA=<dir>` points it at a copy.
- No test suite, linter, or build step.

## Architecture

### It is a static site

**There is no backend.** Everything the site needs is inside `public/`, and watch history lives in each visitor's browser, so the whole thing deploys as static files to Netlify, Cloudflare Pages or anything similar. Verified by serving `public/` with a plain file server and no `/api` routes at all.

- `public/data/movies.json` — canonical content (phases, movies, series, episodes)
- `public/data/characters.json` — the character database
- `data/progress.json` — **legacy** personal save, gitignored, deliberately **outside `public/`** so it is never served. Migration source only; nothing writes to it.

Paths in the frontend are **relative** (`data/movies.json`, `img/characters/x.png` with the stored leading slash stripped at render time), so the site works from a domain root or a subfolder.

### Dev server (`server.js`)

~40 lines, and only for working locally without a build step: it serves `public/` and exposes one read-only `GET /api/progress` so `migrateFromServerOnce()` can lift an existing `data/progress.json` into the browser the first time. That probe is skipped unless the hostname is localhost, which keeps a failed request out of every public visitor's console. Port is `process.env.PORT || 3939`. Once every browser you use has migrated, `server.js` could be replaced by any static server.

### Data model (`public/data/movies.json`)

`{ phases: [ { id, name, label, movies: [...] } ] }`. Each phase holds movies, TV specials and full series, distinguished by `type: "movie" | "series" | "special"`.

Required on every entry: `id`, `title`, `year`, `narrativeOrder`, `releaseOrder`, `type`, `summary`. Optional (all gracefully omitted from the UI when absent — never add empty placeholders):

- `art: { tmdbId, poster, backdrop }` — TMDB **path fragments** only, written by `scripts/fetch-artwork.js`. Never hand-edit; re-run the script instead.
- `beforeWatch: { context, watchFirst }` — `context` is spoiler-free prose ("what you need to know going in"); `watchFirst` is an array rendered as chips. An **entry id** becomes a link; **any other string** renders as a plain chip, which is how hard prerequisites outside the tracker are listed (Deadpool & Wolverine requires Logan and both Deadpool films). The validator only errors on strings that *look* like an entry id and match none, so typos are still caught. **Spoiler rule for `context`**: it may reference outcomes of titles *earlier* in narrative order (the viewer has seen them), never this title's own events or anything later.
- `optionalViewing` — an **array** of strings rendered as chips under "Helps, but optional" (a plain string still renders as prose). An item matching an entry id becomes a link to that title; anything else (films outside the tracker) renders as a plain chip.
- `inUniverseSetting` / `timeSkip` — only when genuinely established, never guessed. Both render as hero chips; `timeSkip` is skipped as a chip if over 60 chars (still appears in "When this happens").
- `deepDive: { plot, significance, orderNote }` — full plot, why it matters, why it sits here.
- `watchFor: [{ name, thisFilm, future, spoils?, characterId?, nameIsSpoiler? }]` — the two-tier spoiler system. Each payload is optional and independently placed: `thisFilm` puts the item in the brass panel, `future` in the crimson one, and the name alone appears as a chip under "People & things to watch for". Omit a field (don't write `""`) to keep the item out of that panel. `nameIsSpoiler: true` withholds the name from the chip row — for when naming someone up front is itself the spoiler — while its payloads still render; if every item is hidden, the whole row and its heading disappear.
- `postCredit: { count, type, timing?, skipNote? }` — **only `skipNote` still renders.** Counts and timing were removed as noise by the design. `skipNote` survives because it's spoiler protection, not trivia (currently Black Widow and Ant-Man and the Wasp only).
- `released: false` + `expectedRelease` — excluded from watched-count denominators.
- series only: `seasons: [{ seasonNumber, episodes: [...] }]` — always nested under `seasons`, even for one season.

**narrativeOrder vs releaseOrder**: `narrativeOrder` is per-phase and drives all display. `releaseOrder` is a global sequence kept as trivia. Phases group by *when the story happens*, not Marvel's release branding — Black Widow sits in Phase Three (2016) rather than Four. Follow that precedent, but narrative usefulness wins over strict chronology when the two fight: Captain Marvel is filed in Phase Three immediately before Endgame, not back in 1995, because that is where it pays off.

**A character's `phases` key must match the phase its film is filed under, not when the story happens.** Row state on a personnel file is gated by the reader's own progress, so a paragraph filed too early shows content from a film they haven't watched. Fury's 1995 material sat under Phase One for exactly this reason and leaked Captain Marvel to anyone who had only finished Phase One.

**Multi-season shows split into separate entries** when their seasons belong at different points in the watch order. Loki is the precedent: `loki` ("Loki: Season 1") and `loki-s2` ("Loki: Season 2") with Quantumania between them, because Kang is introduced in that film. Episode ids stay `loki-s1e1` … `loki-s2e6` so watch history survives. Keep the `seasons` wrapper on both.

**Series carry a Deep Dive at the series level, and each episode carries its own `deepDive.plot`** — a recap of that episode behind the spoiler toggle, so the episode page has something more than its one-line `summary`. Episodes don't get `significance` or `orderNote`. Only some episodes carry their own `watchFor`.

### Save data (browser `localStorage`)

**Watch history lives in the browser, not on the server** (`localStorage` key `mcu-field-log-progress`). That's what allows a static public deploy: every visitor gets their own save and nobody can overwrite anyone else's. Consequences: it's per browser and per device with no sync, and clearing site data wipes it, so Export is the only backup. `updateProgress()` in `app.js` owns the `watchedAt` rules that used to be in `server.js`, and `validateSave()` owns the import validation.

On first load, `migrateFromServerOnce()` pulls an existing `data/progress.json` in through `/api/progress` and marks itself done in `localStorage`. That only succeeds against the local Express server; on the hosted site the fetch fails and a new visitor starts empty, which is correct. **`data/progress.json` is now legacy** — it's the migration source and nothing writes to it.

### Legacy save file (`data/progress.json`)

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

One override lives there that the character files depend on: `.phase-record-body` drops the handoff's `max-width: 70ch` and sets `white-space: pre-line`. The width cap left most of the panel empty on a wide screen, and `pre-line` is what turns the newlines in `characters.json` into one line per film. Removing either will visibly break every personnel file.

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

The chip row under "People & things to watch for" is inside **Before you watch**, so it carries the same no-spoilers contract as the rest of that panel: a name printed there is a promise that the name alone gives nothing away. When it does, set `nameIsSpoiler: true` rather than dropping the item — the payoff still gets written down, just behind a toggle.

### Character database (`public/data/characters.json`)

`{ characters: [ { id, name, type?, description, titles, image?, imagePosition?, phases } ] }`, in curated display order (roughly heroes → supporting → antagonists), with the places and organisations appended after the people.

- `type` — **absent means a person**, which is how the original 144 files stay untouched. The only other values are `"org"` (a group of people: S.H.I.E.L.D., the Skrulls, the Kree Empire, Mutants, the Celestials) and `"place"` (Wakanda, Vormir, the Quantum Realm). The validator rejects anything else. 29 such files were added in August 2026, listed on the `Show: All / People / Places & groups` filter on the database screen.
- **Org and place files get no portrait, deliberately.** The design system reserves the 1:1 crop for a person, so they fall through to the monogram tile, and `.no-photo--org` / `.no-photo--place` in `app-tweaks.css` relabel its caption strip from "no photo on file" to the type. `initialsFor()` in `app.js` handles dotted acronyms (S.H.I.E.L.D. → SH) and skips leading "the"/"of"/"a"/"an" (The Void → VO), so don't reintroduce a naive first-two-words split. Collisions exist and are tolerated (Vormir and The Void both give VO; Sakaar and S.A.B.E.R. both give SA).
- Adding these resolved exactly **one** `watchFor` chip ("Hydra" on The First Avenger). The matcher needs an exact match against a `/`-segment of the name, so descriptive chips like "What S.H.I.E.L.D. actually is" still need an explicit `characterId`. The user has decided **not** to do that pass.
- The screen is called **Database**, not "Character Database" — a label that no longer suits half of it. "Reference Database" was tried and rejected.


- `description` — 1–2 sentences at introduction/premise level. Never twists, deaths or late turns.
- `titles` — single-line array of entry ids in narrative order; powers the "Browse by film or series" cast filter, which is collapsed behind a spoiler warning. Unreleased titles excluded.
- `phases` — map of phase id → paragraph. Full spoilers for *that* phase are fine; never leak a later phase into an earlier entry.
- **Format: one film per line, each opening with the full title and a colon.** `"Iron Man: kidnapped in Afghanistan…\nThe Incredible Hulk: one scene at the end…"`. The lines are real `\n` characters in the JSON string, and `.phase-record-body { white-space: pre-line }` in `app-tweaks.css` is what renders them as separate lines. Films go in narrative order within the phase. All 288 paragraphs were converted to this in August 2026; a paragraph with no newline is either a single-film phase or something that got missed.
- **Use the film prefix even when the character does not appear in it.** "Hawkeye: she does not appear, but the series runs on her death." is right; a bare paragraph explaining the absence is not. Natasha's Phase Four, T'Challa's Phase Five and Pietro's Phase Four are the worked examples.
- **Every film in `titles` should be named in that phase's paragraph.** 58 were missing before the August 2026 pass, most of them cameos and post-credits scenes that the prose had skipped: every Guardian is credited in Love and Thunder, Riri's own series was absent from her file, both Maximoff twins were missing the Winter Soldier post-credits cell. Not every gap is real, though. Fury's early films are covered collectively rather than one line each, which is fine.
- **Moving a film between phases silently breaks character files.** A character's `phases` key is the phase the paragraph is *filed under*, not the phase the film is in, so re-bucketing a title leaves every mention of it showing on the wrong row, one phase too early or late. That happened to 45 paragraphs when Captain Marvel, the Ant-Man films, Wakanda Forever, Love and Thunder, Quantumania, the Holiday Special and Deadpool & Wolverine were moved. **After any re-bucketing, re-check** that each `phases` key matches where its film now lives, and that `titles` is still in narrative order. Fixing it is not a blind key rename: if a paragraph already exists at the destination the two must be merged, oldest film first, or one silently overwrites the other.
- The file page shows **all six phases** for every character, so the list itself reveals nothing. Row state is driven by the **user's own progress**: brass `has-record` for a phase they've finished, crimson `is-unseen` with a "NOT SEEN" chip otherwise.
- Roster threshold: somewhat-important through really-important. Recurring side characters in, one-scene cameos out.
- `image` → `public/img/characters/<id>.<ext>`. Portraits are full colour (greyscale was removed). `imagePosition` (CSS `object-position`) shifts the square crop — use `"top"` for tall portraits rather than re-cropping files. Most images came from the MCU Fandom wiki; note their served files are often WebP regardless of extension.

### "Currently watching" flags

Up to 2 units flagged; ids in `progress.json` under `_watching`. A fixed corner dock shows a chip per flag on every screen (the label is dropped when two are flagged so both fit). Flagging is a detail-page button plus a pin on each phase-list row. Marking a flagged unit watched **auto-advances** the flag to the next unwatched unit in global narrative order; marking anything watched with no flags bootstraps one. Unwatching never touches flags.

### Series pop-up

Episodes have checkboxes (`.ep-check`) so you can tick them without leaving; `.season-mark` bulk-toggles a season and **needs `stopPropagation`** since it sits inside the header button. Ticking anything redraws the phase list behind the modal. **Single-season shows render their episodes directly with no accordion** — the bulk toggle moves to the `.episodes-head` heading.

### watchFor → character linking

Tags render as links to `#/character/<id>` when they resolve. Order: an explicit `characterId` always wins; otherwise any `/`-segment of the name (parentheticals stripped, case-insensitive) matching a character's name. Unmatched names (concepts like "The Tesseract") stay plain chips on purpose.

## House writing style

The user is rewriting all of this by hand because the original was AI-written and obviously so. Match these or the work gets thrown away:

- **No em dashes.** Commas or full stops. `npm run check` counts what's left, per phase.
- **Cut the trailing clause that re-frames a fact instead of adding one.** This is the note the user has given most often, and it has three shapes, all of which they delete on sight:
  - meta-commentary about the film as a film — "the film skips past how he got there", "which people still argue about", "and the series never pretends otherwise"
  - telling the reader what to conclude — "which is the film's clearest measure of what the gap cost", "which is the whole argument of the film in one line"
  - sweeping thematic claims that can't be checked — "half of Phase Four is people arguing over what he left behind"

  The test: if the clause could be deleted without losing a fact, delete it. There is usually *some* truth in these, which is exactly why they read as filler rather than as wrong.
- **But do not over-apply the rule above.** Enforcing it on every single sentence is its own failure, and the user has called out the result as formulaic. It bans empty re-framing clauses, not stating significance. "This cameo brings Charlie Cox's Daredevil into the main timeline" is a fact and belongs in the text; "which is the whole argument of the film in one line" is filler. When something matters, say plainly why, once.
- **Write informative, not literary.** The user rewrote a whole Spider-Man pass in August 2026 because the prose "didn't feel natural", and what they cut was consistent:
  - compressed set-ups landing on a dry ironic beat: "he gives EDITH away to the first one who asks, and the last act is him taking it back"
  - clipped fragments used as a tic: "Beck is lying." / "Not just his identity. Him."
  - conclusions left implied for the reader to infer
  What they wrote instead is plain declarative exposition with explicit connective glue ("In a tragic twist", "To fight these charges", "Ultimately"), stating outright what happened and why it matters. Prefer that.
- **Spell out full titles** on first mention in a field: "Spider-Man: Homecoming", not "Homecoming".
- **`beforeWatch.context` is orientation, not a second summary.** What the reader needs to know *going in*: when it's set, what state the characters are in, what format surprises to expect. Not a preview of what happens.
- **Don't write a `future` payload that continues a sentence from `thisFilm`.** They render in separate panels and most readers open one or neither. Each must stand alone — "Passing through Wanda's barrier is what gives Monica her powers", never "Those crossings are what give her powers".

## Content conventions

- `summary` — one spoiler-light sentence; anything more revealing goes in `deepDive.plot`.
- Only add month/season precision to `inUniverseSetting` when confirmed.
- `postCredit.skipNote` is rare and deliberate.
- `spoils` — slash-separated, and each segment should be an **exact entry title** ("She-Hulk: Attorney at Law/Echo"), since the tag is what tells the reader which title they're about to have spoiled. `Loki` is the one established shorthand. A film that isn't in the tracker (Daredevil: Born Again, Wonder Man, the Sony Spider-Man films) can be named in the prose but must not go in the tag. Nothing validates this, so it drifts.
- When editing `public/data/movies.json` programmatically: entries are **not** uniformly formatted (hand-edits have left some as `},{` on one line). Find entry bounds by brace-matching from the nearest `{` before `"id"`, never by assuming a newline. Insert new keys **before** the `summary` line — on unreleased entries `summary` is last and has no trailing comma.

## Licensing / legal posture

- TMDB free tier is **non-commercial**. Ads, affiliate links or donations would require a separate commercial agreement with TiVo. The user has decided to keep it free.
- Attribution is mandatory and lives in the footer. The **official TMDB logo** must be used as a file, never redrawn — TMDB's `blue_short` SVG sits at `public/assets/tmdb.svg`, sized by `.tmdb-logo` in the handoff stylesheet and never recoloured or filtered.
- Character portraits are studio stills sourced from fan wikis — the same posture as comparable fan trackers. Fine for a free project; would need revisiting if monetised.

## Workflow

- **Always ask before committing.** Pushing needs its own separate ask.
- The user's own small content tweaks (image swaps, data edits) don't need their own commit — let them ride along.
- **Back up `data/progress.json` before any test that writes progress**, and restore it afterwards.
- The user welcomes unprompted suggestions — offer them.
- **The MCU Fandom wiki is the other source, and it works.** `marvelcinematicuniverse.fandom.com` has an **Appearances** list on every location, organisation and character page, broken down by film and series, plus per-scene history sections. It caught three scenes missed from the location files (Bruce and the Ancient One at the 2012 Sanctum in Endgame, the Thor: The Dark World mid-credits being on Knowhere, Doctor Strange passing through the Quantum Realm), corrected where the Shang-Chi mid-credits scene happens, and cut S.W.O.R.D. and the Kree Empire down to their real size. **WebFetch 402s on that host** — use the browser tools (`preview_start {url}` then `javascript_tool` to pull `<h2>/<h3>` sections). Roughly a third of page loads fail and succeed on a straight retry. It is fan-edited, so it beats recall but is not authoritative, and its prose is never copied.
- **Verify against TMDB rather than recall for anything checkable.** The project has a key in `tmdb.key` and every entry has an `art.tmdbId`, so episode titles, air dates and overviews are one fetch away: `https://api.themoviedb.org/3/tv/<id>/season/<n>?api_key=<key>`. This is not theoretical. Echo had four of five episode titles invented, Agatha All Along had eight of nine wrong *and shifted by one*, so nine episode plots written from those titles were all mis-assigned. Thor: Love and Thunder carried the Guardians Holiday Special's `tmdbId` and rendered its poster. Audit the whole file, not just the entry in hand — all three were found by sweeping every series and every id at once.
- **Only correct what you are certain of; collect the rest into a list for the user.** Their instruction, after the Echo and Agatha errors. A confidently wrong "fix" is worse than leaving the original. This has already paid off twice: Pepper was credited in Civil War and does not appear (removed), Happy was credited and does appear (kept, line added).
- **Do not put `\n` inside a `node -e` string in the shell.** Git Bash mangles the escape into a raw newline, which is invalid inside a JSON string literal and breaks the whole data file. It happened twice. Write the script to a file and run it with `node <path>` instead.

## Where the content rewrite has got to

Phases One to Four are rewritten to the house style above. WandaVision and The Falcon and the Winter Soldier are done to episode level: every episode has its own `deepDive.plot`, and several carry their own `watchFor`. Far From Home, No Way Home and Hawkeye had a second pass in August 2026. **Hawkeye is the best current example of the voice the user wants** — they called it "infinitely better" than the No Way Home pass done immediately before it, which they had largely rewritten. Its six episode plots are the model for episode-level `deepDive.plot`. Loki: Season 1 and Quantumania followed. **Loki: Season 2 is next** (narrativeOrder 8).

Quantumania's `orderNote` is deliberately provisional: the user wants to re-order some of Phase Four once the rest of it is written, so it states the Loki-either-side reasoning and nothing more. **What If...? is threaded through `optionalViewing` one season at a time**, so a reader never gets pointed at a season that spoils films they haven't reached: S1 on Quantumania, S2 on Multiverse of Madness, S3 on Ironheart. **Phase Four is now finished** — Loki Season 2, Deadpool & Wolverine, Multiverse of Madness, Agatha All Along and Echo all had full passes in August 2026, with episode-level `deepDive.plot` throughout. **Phases Five and Six are the remaining work** and hold the last 36 em dashes (`npm run check` reports the count per phase).

**Phases Four and Five were re-bucketed in August 2026.** Phase Four now runs WandaVision, Falcon, Far From Home, No Way Home, Hawkeye, Echo, Loki S1, Quantumania, Loki S2, Deadpool & Wolverine, Multiverse of Madness, Agatha. Phase Five opens Moon Knight, Shang-Chi, Eternals, She-Hulk. The reasoning the user gave: get Multiverse of Madness closer to WandaVision so Wanda's arc is not forgotten, and accept that Shang-Chi and Eternals drift further from their dates because nothing references them. They know it only closed the WandaVision gap from twelve entries to nine, and chose that over moving the film ahead of Loki, which would have broken the multiverse-rules-first ordering.

**Secret Invasion sits before The Marvels, and that is now settled.** Sources had genuinely disagreed, and the argument used was that Secret Invasion ends with Fury going back to space while The Marvels has him already stationed there. The test was whether Talos appears alive in The Marvels: he does not. Gravik kills him in Secret Invasion, so Secret Invasion must come first. Both the entry's `orderNote` and this note were updated in August 2026 to say so rather than hedge.

**`public/data/characters.json` is done.** All 144 files were rewritten in one pass in August 2026: 288 phase paragraphs plus 24 descriptions, converted to the one-film-per-line format, de-dashed from 268 em dashes to zero, and every credited film now named. The user reviewed it in batches and approved the voice, so **treat these files as the reference sample alongside Hawkeye, not as prose still awaiting a pass.**

That pass turned up three defects worth knowing about, because they suggest the class of thing still hiding elsewhere: Okoye's file opened with a Civil War scene she is not in (that was Ayo, and her own `titles` already disagreed), Yon-Rogg's paragraph had words dropped mid-sentence ("were sent to Earth.Mar-Vell and steal"), and the Collector's Phase Three began mid-sentence with no opening clause. There is also **a second AI voice** in about a dozen files, flat past-tense narration unlike the rest (Maria Rambeau, Yon-Rogg, Goose, Ebony Maw, Cull Obsidian, the Collector) — that pocket carried both broken sentences, so if more of it surfaces, read it closely.

The user writes or corrects the content; the assistant does the structural pass (expanding `watchFor`, splitting payloads, `characterId`, `nameIsSpoiler`, de-dashing) unless asked otherwise. They then edit on top, so don't be precious about the wording.

**Known stale data:** `spiderman-4` (Spider-Man: Brand New Day) released 31 July 2026 but is still `released: false` with no `watchFor` or `deepDive`. The user is aware and wants it handled during the Phase Five and Six pass.

## Not yet built

- Overall stats (hours watched, average rating, etc.) — the last item from the original roadmap
- Portraits for the five characters added in August 2026: `christine-palmer`, `hunter-b15`, `ravonna-renslayer`, `alioth`, `darren-cross`. No files exist for them yet, so they fall back to monogram tiles. The user supplies the images; wiring one up is a single `image` field.
- Possibly: Fox-era movies, an anime section
