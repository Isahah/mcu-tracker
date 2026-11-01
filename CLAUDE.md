# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal MCU watch tracker: a vanilla-JS frontend (no framework, no build step, no bundler) reading flat JSON files, with watch history in the browser. **No database and no backend**, so it runs locally via a small dev server and deploys as a static site. Free, and never monetised (see Licensing below).

Its whole point is **narrative order without spoilers**: every title is placed by when the story happens, and anything that could spoil sits behind a toggle the reader opens deliberately.

## Commands

- `npm install`. One-time dependency install (Express is the only dependency)
- `npm start`. Runs `node server.js`, serves at http://localhost:3939
- `node scripts/fetch-artwork.js`. Pull TMDB poster/backdrop paths (`--refresh` re-fetches everything, `--dry-run` writes nothing)
- `npm run prose <entry-id>`. Read-only writing check over one entry (`scripts/prose-check.js`), the mechanical half of the `writing-check` skill. Flags em dashes, prose colons, curly quotes, banned words and phrases, sentences over 32 words, three same sentence openers in a row, "not X, but Y", "-ing" opinion tails, and clauses ending on a vague "it", "them", "that" or "ever since". Prints the entry's word count beside the approved reference entries. With no id it ranks every entry; `--phase phase-5` narrows it, `--words` gives lengths only. **A low score is not a pass**: run it over the whole file and the approved hand-written entries sit at the top of the worst list while the untouched AI text scores best, because that pass wrote short flat sentences. Use it on text you just wrote, then read the text.
- `npm run splice <entry.json>...`. Replaces one or more entries in `movies.json` in place without reformatting the rest of the file (`scripts/splice-entry.js`). See the note under Content conventions for why hand-editing or a whole-file rewrite goes wrong.
- `npm run check`. Read-only validator over the three data files. Run it after hand-editing. Catches JSON syntax errors with a line number, missing required fields, duplicate ids, `narrativeOrder` collisions and gaps, references that point at nothing (`watchFirst`, `characterId`, character `titles`), misspelled field names, missing portrait files, and save keys orphaned by a renamed id. Exits non-zero on errors. `MCU_DATA=<dir>` points it at a copy.
- No test suite, linter, or build step.

## Architecture

### It is a static site

**There is no backend.** Everything the site needs is inside `public/`, and watch history lives in each visitor's browser, so the whole thing deploys as static files to Netlify, Cloudflare Pages or anything similar. Verified by serving `public/` with a plain file server and no `/api` routes at all.

- `public/data/movies.json`. Canonical content (phases, movies, series, episodes)
- `public/data/characters.json`. The character database
- `data/progress.json`. **Legacy** personal save, gitignored, deliberately **outside `public/`** so it is never served. Migration source only; nothing writes to it.

Paths in the frontend are **relative** (`data/movies.json`, `img/characters/x.png` with the stored leading slash stripped at render time), so the site works from a domain root or a subfolder.

### Dev server (`server.js`)

~40 lines, and only for working locally without a build step: it serves `public/` and exposes one read-only `GET /api/progress` so `migrateFromServerOnce()` can lift an existing `data/progress.json` into the browser the first time. That probe is skipped unless the hostname is localhost, which keeps a failed request out of every public visitor's console. Port is `process.env.PORT || 3939`. Once every browser you use has migrated, `server.js` could be replaced by any static server.

### Data model (`public/data/movies.json`)

`{ phases: [ { id, name, label, movies: [...] } ] }`. Each phase holds movies, TV specials and full series, distinguished by `type: "movie" | "series" | "special"`.

Required on every entry: `id`, `title`, `year`, `narrativeOrder`, `releaseOrder`, `type`, `summary`. Optional (all gracefully omitted from the UI when absent, so never add empty placeholders):

- `art: { tmdbId, poster, backdrop }`. TMDB **path fragments** only, written by `scripts/fetch-artwork.js`. Never hand-edit; re-run the script instead.
- `beforeWatch: { context, watchFirst }`. `context` is spoiler-free prose ("what you need to know going in"); `watchFirst` is an array rendered as chips. An **entry id** becomes a link; **any other string** renders as a plain chip, which is how hard prerequisites outside the tracker are listed (Deadpool & Wolverine requires Logan and both Deadpool films). The validator only errors on strings that *look* like an entry id and match none, so typos are still caught. **Spoiler rule for `context`**: it may reference outcomes of titles *earlier* in narrative order (the viewer has seen them), never this title's own events or anything later.
- `optionalViewing`. Three accepted shapes. An **array** of strings renders as chips under "Helps, but optional"; a plain **string** renders as prose; **`{ note, items }`** puts a line of prose above the chips. An item matching an entry id becomes a link to that title; anything else (films outside the tracker) renders as a plain chip. The `note` form exists because the heading reads as *before you watch* by default, so an entry whose optional viewing is meant to be watched **after** the film has to say so (Captain America: The First Avenger, pointing at the Agent Carter one-shot and series).
- `inUniverseSetting` / `timeSkip`. Only when genuinely established, never guessed. Both render as hero chips; `timeSkip` is skipped as a chip if over 60 chars (still appears in "When this happens").
- `deepDive: { plot, significance, orderNote }`. Full plot, why it matters, why it sits here.
- `watchFor: [{ name, thisFilm, future, spoils?, characterId?, nameIsSpoiler? }]`. The two-tier spoiler system. Each payload is optional and independently placed: `thisFilm` puts the item in the brass panel, `future` in the crimson one, and the name alone appears as a chip under "People & things to watch for". Omit a field (don't write `""`) to keep the item out of that panel. `nameIsSpoiler: true` withholds the name from the chip row, for when naming someone up front is itself the spoiler, while its payloads still render; if every item is hidden, the whole row and its heading disappear.
- `postCredit: { count, type, timing?, skipNote? }`. **Only `skipNote` still renders.** Counts and timing were removed as noise by the design. `skipNote` survives because it's spoiler protection, not trivia (currently Black Widow and Ant-Man and the Wasp only).
- `released: false` + `expectedRelease`. Excluded from watched-count denominators.
- series only: `seasons: [{ seasonNumber, episodes: [...] }]`. Always nested under `seasons`, even for one season.

**narrativeOrder vs releaseOrder**: `narrativeOrder` is per-phase and drives all display. `releaseOrder` is a global sequence kept as trivia. Phases group by *when the story happens*, not Marvel's release branding. Black Widow sits in Phase Three (2016) rather than Four. Follow that precedent, but narrative usefulness wins over strict chronology when the two fight: Captain Marvel is filed in Phase Three immediately before Endgame, not back in 1995, because that is where it pays off.

**A character's `phases` key must match the phase its film is filed under, not when the story happens.** Row state on a personnel file is gated by the reader's own progress, so a paragraph filed too early shows content from a film they haven't watched. Fury's 1995 material sat under Phase One for exactly this reason and leaked Captain Marvel to anyone who had only finished Phase One.

**Multi-season shows split into separate entries** when their seasons belong at different points in the watch order. Loki is the precedent: `loki` ("Loki: Season 1") and `loki-s2` ("Loki: Season 2") with Quantumania between them, because Kang is introduced in that film. Episode ids stay `loki-s1e1` … `loki-s2e6` so watch history survives. Keep the `seasons` wrapper on both.

**Series carry a Deep Dive at the series level, and each episode carries its own `deepDive.plot`**. The episode one is a recap of that episode behind the spoiler toggle, so the episode page has something more than its one-line `summary`. Episodes don't get `significance` or `orderNote`. Only some episodes carry their own `watchFor`.

### Save data (browser `localStorage`)

**Watch history lives in the browser, not on the server** (`localStorage` key `mcu-field-log-progress`). That is what allows a static public deploy, because every visitor gets their own save and nobody can overwrite anyone else's. The trade-off is that it is per browser and per device with no sync, and clearing site data wipes it, so Export is the only backup.

The save is a flat object keyed by entry id (movie, episode, or series id for a series-level rating), plus one special key `_watching`. An entry is `{ watched?, watchedAt?, rating? }`, rating 0 to 10 in 0.5 steps. A few entries still carry `postCreditSeen` from a feature that was removed. Nothing reads it, and nothing may drop it either. Purely local UI preferences, like the artwork density toggle, get their own `localStorage` keys rather than a slot in the save.

`updateProgress()` in `app.js` owns the `watchedAt` rules that used to live in `server.js`. `validateSave()` owns the import validation. `readSave()` returns an empty object if the stored JSON is corrupt, so a bad save cannot take the app down.

**Export and import** sit in the `.save-utility` row at the foot of the menu, deliberately not a card, since housekeeping should not outrank the phases. Both halves run entirely in the browser and neither touches the network.

- Export reads `localStorage` and downloads `mcu-field-log-<date>.json`, a wrapper of `{ app, version, exportedAt, progress }`.
- Import reads the chosen file in the browser. `progressFromFile()` accepts either that wrapper or a bare save object. `validateSave()` checks the payload **whole**, so one bad entry rejects the lot and a corrupt file can never half-overwrite a good save. Unknown keys on an entry are copied through deliberately. A `confirm()` then shows the watched and rated counts of both saves before anything is replaced.
- The save being replaced is copied to the `mcu-field-log-progress-previous` key as a **single undo step**, kept only until the next import. There is no server-side backup file any more.
- The page reloads afterwards rather than re-syncing each screen.

**`data/progress.json` is legacy.** It is gitignored, personal, and sits outside `public/` so it is never served. Nothing writes to it. Its only remaining job is migration. On first load `migrateFromServerOnce()` pulls it in through the read-only `GET /api/progress` and marks itself done in `localStorage`. That only succeeds against the local Express server, and it is skipped unless the hostname is localhost, which keeps a failed request out of every public visitor's console. On the hosted site a new visitor starts empty, which is correct. Never hand-edit it.

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

`public/styles.css` is the **Ink Navy** stylesheet, copied verbatim from `design_handoff_mcu_field_log/mcu-field-log-v4.css`. **Don't edit it**. Local changes go in `public/app-tweaks.css`, which loads after, so a newer handoff can be dropped straight in.

One override lives there that the character files depend on: `.phase-record-body` drops the handoff's `max-width: 70ch` and sets `white-space: pre-line`. The width cap left most of the panel empty on a wide screen, and `pre-line` is what turns the newlines in `characters.json` into one line per film. Removing either will visibly break every personnel file.

The system rests on a status colour law: **brass = watched, crimson = in progress / spoilers, grey = unwatched**. Every status is signalled three ways at once (left edge, numeral, pill). Don't introduce other colours.

Three image ratios, each with one meaning: **2:3** title poster, **16:9** title backdrop, **1:1** person in a grid, **3:4** person on their own page.

Disclosure panels use `aria-expanded` on the button plus a hidden body (`bindReveals`). A button must never sit at `aria-expanded="true"` with no body.

### Title artwork (TMDB)

`scripts/fetch-artwork.js` looks up every title and writes `art` blocks. The key lives in **`tmdb.key`** (gitignored; `tmdb.key.example` is the committed template).

- Only path fragments are stored; images always load from TMDB's CDN. **TMDB's terms cap caching at six months**, so re-run with `--refresh` periodically.
- Sizes: `w92` phase-list thumb, `w154` resume poster, `w342` hero poster, `w1280`/`w780` backdrop.
- Images are **never** filtered, tinted or overlaid. Status is signalled by a ring on the `.art` box instead.
- No artwork → a hashed monogram tile (`.art--poster.no-photo--tN` + `.art-none` initials). Everything works without TMDB.
- Detail pages and the series pop-up use the **10c card wash**: `.card-wash` as first child of `.dossier`/`#modal-content`, which carries `has-wash`. The alternative `.title-hero--bleed` (10b) is a one-class swap if bright backdrops wash out. Never add `overflow: hidden` to the modal.
- Artwork can be toggled off per-user via the density chip (`is-compact` on `#case-files`, persisted in localStorage).

### Two-tier spoiler system

Each `watchFor` item has two payloads. **Plot & context** (brass panel) holds the deep dive plus each item's `thisFilm`; **Spoilers for future films** (crimson panel) holds each `future` with its `spoils` tag. Don't merge them. Finishing one title must not spoil a different one.

The chip row under "People & things to watch for" is inside **Before you watch**, so it carries the same no-spoilers contract as the rest of that panel: a name printed there is a promise that the name alone gives nothing away. When it does, set `nameIsSpoiler: true` rather than dropping the item. The payoff still gets written down, just behind a toggle.

### Character database (`public/data/characters.json`)

`{ characters: [ { id, name, type?, description, titles, image?, imagePosition?, phases } ] }`, in curated display order (roughly heroes → supporting → antagonists), with the places and organisations appended after the people.

- `type`. **Absent means a person**, which is how the original 144 files stay untouched. The only other values are `"org"` (a group of people: S.H.I.E.L.D., the Skrulls, the Kree Empire, Mutants, the Celestials) and `"place"` (Wakanda, Vormir, the Quantum Realm). The validator rejects anything else. 29 such files were added in August 2026, listed on the `Show: All / People / Places & groups` filter on the database screen.
- **Org and place files get no portrait, deliberately.** The design system reserves the 1:1 crop for a person, so they fall through to the monogram tile, and `.no-photo--org` / `.no-photo--place` in `app-tweaks.css` relabel its caption strip from "no photo on file" to the type. `initialsFor()` in `app.js` handles dotted acronyms (S.H.I.E.L.D. → SH) and skips leading "the"/"of"/"a"/"an" (The Void → VO), so don't reintroduce a naive first-two-words split. Collisions exist and are tolerated (Vormir and The Void both give VO; Sakaar and S.A.B.E.R. both give SA).
- Adding these resolved exactly **one** `watchFor` chip ("Hydra" on The First Avenger). The matcher needs an exact match against a `/`-segment of the name, so descriptive chips like "What S.H.I.E.L.D. actually is" still need an explicit `characterId`. The user has decided **not** to do that pass.
- The screen is called **Database**, not "Character Database", a label that no longer suits half of it. "Reference Database" was tried and rejected.


- `description`. 1 to 2 sentences at introduction/premise level. Never twists, deaths or late turns.
- `titles`. Single-line array of entry ids in narrative order; powers the "Browse by film or series" cast filter, which is collapsed behind a spoiler warning. Unreleased titles excluded.
- `phases`. Map of phase id → paragraph. Full spoilers for *that* phase are fine; never leak a later phase into an earlier entry.
- **Format: one film per line, each opening with the full title and a colon.** `"Iron Man: kidnapped in Afghanistan…\nThe Incredible Hulk: one scene at the end…"`. The lines are real `\n` characters in the JSON string, and `.phase-record-body { white-space: pre-line }` in `app-tweaks.css` is what renders them as separate lines. Films go in narrative order within the phase. All 288 paragraphs were converted to this in August 2026; a paragraph with no newline is either a single-film phase or something that got missed.
- **Use the film prefix even when the character does not appear in it.** "Hawkeye: she does not appear, but the series runs on her death." is right; a bare paragraph explaining the absence is not. Natasha's Phase Four, T'Challa's Phase Five and Pietro's Phase Four are the worked examples.
- **Every film in `titles` should be named in that phase's paragraph.** 58 were missing before the August 2026 pass, most of them cameos and post-credits scenes that the prose had skipped: every Guardian is credited in Love and Thunder, Riri's own series was absent from her file, both Maximoff twins were missing the Winter Soldier post-credits cell. Not every gap is real, though. Fury's early films are covered collectively rather than one line each, which is fine.
- **Moving a film between phases silently breaks character files.** A character's `phases` key is the phase the paragraph is *filed under*, not the phase the film is in, so re-bucketing a title leaves every mention of it showing on the wrong row, one phase too early or late. That happened to 45 paragraphs when Captain Marvel, the Ant-Man films, Wakanda Forever, Love and Thunder, Quantumania, the Holiday Special and Deadpool & Wolverine were moved. **After any re-bucketing, re-check** that each `phases` key matches where its film now lives, and that `titles` is still in narrative order. Fixing it is not a blind key rename: if a paragraph already exists at the destination the two must be merged, oldest film first, or one silently overwrites the other.
- The file page shows **all six phases** for every character, so the list itself reveals nothing. Row state is driven by the **user's own progress**: brass `has-record` for a phase they've finished, crimson `is-unseen` with a "NOT SEEN" chip otherwise.
- Roster threshold: somewhat-important through really-important. Recurring side characters in, one-scene cameos out.
- `image` → `public/img/characters/<id>.<ext>`. Portraits are full colour (greyscale was removed). `imagePosition` (CSS `object-position`) shifts the square crop. Use `"top"` for tall portraits rather than re-cropping files. Most images came from the MCU Fandom wiki; note their served files are often WebP regardless of extension.

### "Currently watching" flags

Up to 2 units can be flagged, and the ids live in the browser save under the `_watching` key. `validateSave()` enforces the cap of 2 on import. A fixed corner dock shows a chip per flag on every screen, and the label is dropped when two are flagged so both fit. Flagging is a detail-page button plus a pin on each phase-list row. Flagging a third drops the oldest.

Marking a flagged unit watched **auto-advances** the flag to the next unwatched unit in global narrative order. That is `nextUnwatchedAfter()`, which walks `flatUnitIds()` and skips anything carrying `released: false`. Marking anything watched with no flags set bootstraps one. Unwatching never touches flags.

### Series pop-up

Episodes have checkboxes (`.ep-check`) so you can tick them without leaving; `.season-mark` bulk-toggles a season and **needs `stopPropagation`** since it sits inside the header button. Ticking anything redraws the phase list behind the modal. **Single-season shows render their episodes directly with no accordion**, and the bulk toggle moves to the `.episodes-head` heading.

### watchFor → character linking

Tags render as links to `#/character/<id>` when they resolve. Order: an explicit `characterId` always wins; otherwise any `/`-segment of the name (parentheticals stripped, case-insensitive) matching a character's name. Unmatched names (concepts like "The Tesseract") stay plain chips on purpose.

## Writing style

This applies to every bit of text that ships in `public/data/*.json`. It does not apply to chat messages.

The user is rewriting the whole tracker by hand because the original text was obviously AI-written. Text that reads like AI gets thrown out. The voice to match is Captain America: The First Avenger, Iron Man, Iron Man 2, Thor: The Dark World, Guardians of the Galaxy, and Loki: Season 2. Read them before writing anything new.

### The voice

- Write plain and informative, the way a fan would explain the film to a friend who has not seen it. Some fun is fine when the chance comes up naturally, like the opening of the "Why it matters" section on Captain America: The First Avenger, and especially when the user asks for it in their prompt. Don't force it.
- Say what happens and why it matters. Say it once, in plain words, and don't leave it for the reader to work out.
- Descriptive detail is good. "A red liquid power source" and "a white three piece suit" are facts. Evaluative words are not wanted (stunning, incredible, iconic, masterful).
- Link sentences with plain connectors like "after that", "by the end", "because of this", "for once". Vary how sentences open, and never start three in a row the same way.
- Mix sentence lengths. Mostly normal sentences. No strings of tiny fragments, and no sentence that runs on for five clauses.
- Starting a sentence with "and" or "but" is fine. Casual grammar is fine.
- Write plots in present tense, like the Phase One plots.

### Hard rules

- No em dashes. Use a comma, a full stop or brackets. `npm run check` counts what's left.
- No colons in prose. Setup, colon, payoff is one of the clearest AI tells. Write two sentences instead. `npm run check` does not catch these.
- No "not X, but Y" or "not just X, it's Y" constructions. This includes the two-sentence version ("Not a weapon. A recording of..."). Say what the thing is.
- No "rather than". Banned outright, not only when the contrast is fake. A survey in October 2026 found it in 4 of 6 Phase One entries, 5 of 6 in Phase Two and 10 of 11 in Phase Three, which is what made it obvious. There is always a plainer way to say the thing.
- No groups of three out of habit ("Not enhanced, not powerful, and he wins"). Use the real number of things.
- No "X and also Y" constructions.
- No rhetorical questions. No fake engagement ("Let's take a look", "Buckle up", "Join me").
- No intensifiers: absolutely, totally, completely, incredibly, extremely, utterly, truly, deeply.
- No bold, italics or emoji inside data text.
- Straight quotes and apostrophes only. No curly ones.
- Spell out full titles on first mention in a field. "Spider-Man: Homecoming", not "Homecoming".

### What the user deletes on sight

1. **A clause tacked onto a fact that re-frames it instead of adding to it.** This is the note the user gives most. It comes in three shapes.
   - Commentary about the film as a film: "which people still argue about", "and the film refuses to simplify either".
   - Telling the reader what to conclude: "which is the whole argument of the film in one line", "is a good measure of him".
   - Big claims nobody can check: "half of Phase Four is people arguing over what he left behind".

   The test is to delete the clause and see if a fact went with it. If not, it stays deleted. Don't over-apply this, though. Stating significance plainly is fine. "This cameo brings Charlie Cox's Daredevil into the main timeline" is a fact and belongs in the text.
2. **Opinions and reviews.** "The car journey is the best scene in the film." "Widely rated one of the best villains in the run." "The villain most people name first." The tracker describes films, it does not review them. No "fans say", "many consider" or "critics noted" either.
3. **Literary tics.** A compressed setup that lands on a dry ironic beat ("he gives EDITH away to the first one who asks, and the last act is him taking it back"). Clipped fragments used for effect ("Beck is lying." / "Not just his identity. Him."). Punchline one-liners ("He is not exaggerating."). Metaphors standing in for facts ("He is Tony's fear given a body", "this scene is load-bearing").
4. **A bare one-line fact dropped on its own.** "Frigga dies here" was cut. Give the fact a full sentence that connects to what is around it.
5. **Fancy wording where plain wording works.**
   - "the equipment Project Rebirth runs on" became "the equipment for Project Rebirth"
   - "Bucky Barnes and Peggy Carter arrive alongside him" became "are also introduced alongside him"
6. **Going bare when told to trim.** The user edited colour back into Thor: The Dark World.
   - "The Aether is introduced" became "The story centers on the Aether, a red liquid power source"
   - "Loki's real feelings surface for once" became "For once, Loki's genuine grief and feelings break through his usual deceptive performance"

   Descriptive adjectives and connectors are wanted. Re-framing clauses are not. Those are different things.
7. **Rhetorical scaffolding.** "Notice how erratic he is, and then notice what he actually delivers: he builds..." lost the whole middle and became two plain sentences. Give an instruction once, then state the facts.

### Patterns the user found in finished entries

The user went back through entries, including ones already marked done, and found these. They are patterns, not phrase bans. Swapping in a synonym ("takes it and runs" for "runs with it") is the same mistake.

1. **Abstract things that move.** Ideas, films, scenes, facts and stories do not arrive, run, land, lean, stand, reach back or pick things up. Only people and physical things do.
   - "Natasha Romanoff arrives as Black Widow, and a much clearer picture of how S.H.I.E.L.D. operates arrives with her."
   - "This film picks that up and runs with it."
   - "Two things do reach back."
   - "the whole series lands on..."
   - "It leans on the collapse of the organisation..."

   Make a person or an event the subject instead. "Natasha Romanoff is introduced as Black Widow. Through her, we see much more of how S.H.I.E.L.D. works." Literal movement is fine. "Thor lands in New Mexico" is a fact.
2. **Empty closing tags.** A short, vague add-on at the end of a sentence that sounds like it means something but names nothing. It usually points back at "it", "there" or "him".
   - "Runs alongside Iron Man rather than after it, and takes nothing from it."
   - "and leaves it there"
   - "which is what the five years later cost him"
   - "ever since", as in "the Celestials have been making stars, planets and life ever since". Grammatically fine, which is why it slips through, but it is a stock AI closer and it does the vague-trailing-phrase job. Say how long, or say what happened in the meantime. The Eternals line became "over millions of years the Celestials made the stars, the planets and every living thing". **There are 14 of these left in `movies.json` and 2 in `characters.json`**, most of them in entries already approved, so they belong to the final sweep and not to the entry in hand.

   Either cut it or say the actual fact. "Which is what the five years later cost him" should just say what happened. "In Avengers: Endgame, his whole family disappears in the Snap." The information is fine. Hinting at it instead of saying it is the problem.
3. **"Rather than" contrasts.** Describing something by what it is not. "Runs alongside Iron Man rather than after it." "As a consultant rather than as a member of anything." This is a cousin of the banned "not X, but Y", and it is now a hard rule above. Say what the thing is.
4. **Announcing instead of saying.** A sentence whose only job is to set up the next one. "Two things do reach back." "One thing worth knowing." "One piece of housekeeping." Cut it and start with the first real fact. Watch for the emphatic "do" or "does" ("two things do reach back", "he does survive"), which fakes a contrast with something nobody said.
5. **Vagueness that makes the reader fill in the blank.** AI leaves gaps and trusts the reader to close them. Name the thing instead. The Shang-Chi context read "Nearly everything in this film is new. The characters, the setting and the mythology all start here", where "here" was doing work that "in this film" should do, and the fix was to merge the two sentences so the vague word was never needed. Watch for "here", "this", "that" and "those" standing in for something that has not been named, and for filler nouns like things, elements, aspects and stuff. Also watch for a whole sentence that gestures at something without saying it, as in "Two scenes at the end point somewhere" or "it goes somewhere stranger than that".
6. **Sentences and clauses that end on "it", "them" or "that".** The same vagueness, in its most common shape. Ending on the pronoun is what makes the reader do the work, and it is almost always avoidable, so name the thing instead. The Eternals pass had eleven of these in one entry. "sends a team of Eternals to guard the life growing on it" became "to guard the life on the surface", "Arishem made these too" became "Arishem built the Deviants as well", "a voice off screen asks whether he is ready for it" became "asks whether he is really ready", and "Ego tells Peter Quill that he is one" became "Ego introduces himself to Peter Quill as a Celestial". A pronoun whose subject is named in the same sentence is fine, so "the Mesopotamians make a god of him" stays. There are millions of ways to structure a sentence, and the structure does not have to be that one.
7. **Critic vocabulary.** Words about how the franchise is built, instead of what happens in it. The reader wants the story, not the engineering.
   - Avoid: the run (as in "the best villain in the run"), thread, lands (as in "the series lands on"), leans on, stands as, deliberate or deliberately, fresh (as in "worth having fresh"), runs with.
   - Watch for overuse: picks up (as in "picks up right after Civil War"), built on. These are normal phrases a person would say once. They read as AI when every entry uses them.

### Words and phrases to avoid

From Wikipedia's "Signs of AI writing" guide plus what the user has already cut. Using one of these once is not a crime, but each one is a flag.

- **Puffing up importance:** testament to, stands as, serves as, plays a vital/key/pivotal role, crucial, key turning point, watershed, landmark, iconic, legendary, lasting/enduring legacy, profound, indelible, leaves a mark, cements, solidifies, underscores, highlights the importance of.
- **AI vocabulary:** delve, tapestry, intricate, nuanced, multifaceted, interplay, compelling, resonate, showcase, foster, bolster, embark, unravel, grapple with. "Journey" and "navigate" only when literal. "Realm" only for the nine realms and the Quantum Realm.
- **Editorializing:** it's worth noting, it's important to remember, notably, interestingly, importantly, remarkably, unusually for a superhero film.
- **Essay transitions:** moreover, furthermore, additionally, in addition, that said, in summary, overall.
- **"-ing" tails that add an opinion to the end of a sentence:** ", highlighting...", ", underscoring...", ", cementing...", ", reflecting...", ", setting the stage for...", ", paving the way for...".
- **Trailer and cliché plot talk:** from the shadows, comes to a head, quietly (as in "quietly building"), looming threat, shocking, sets the stage, lays the groundwork, the stakes have never been higher.
- **"The film" doing human things:** the film argues, the film refuses, the film insists, the film is careful that. Describe what happens on screen instead.
- **Stock phrases the user has banned:** go in cold, dive into, unleash, game-changing.

### Field rules

- `summary` is one spoiler-light sentence. No ordering or release notes in it. Those go in `orderNote`.
- `beforeWatch.context` is orientation, not a second summary. When it is set, what state the characters are in, what format surprises to expect.
- `deepDive.plot` is a real recap in order, roughly the length of the Phase One plots, with no paragraph breaks. Introduce people normally ("Stephen Strange, a surgeon, ..."), not newspaper style ("Brilliant but arrogant surgeon Stephen Strange").
- `significance` says what the title adds to the bigger story, plainly. It should not open on a bare one-liner.
- `orderNote` says why the title sits where it sits. After any reorder, re-read every `orderNote` in that phase.
- `watchFor` payloads each stand alone. `future` never continues a sentence from `thisFilm`. They render in separate panels and most readers open one or neither, so each has to make sense on its own. Write "Passing through Wanda's barrier is what gives Monica her powers", never "Those crossings are what give her powers".
- **When the user gives you draft prose, it is a brief, not raw material.** Keep their structure, their lists, their direct address to the reader ("If you have any Marvel knowledge at all you may recognise the surname") and their "we meet / we get introduced" framing. Fix spelling, names, em dashes and repetition. But don't transcribe it either. If three sentences in a row start with "We also", vary the openings and keep the content plain, the way the Phase Four entries do (`Introduces...` / `It also brings back...` / `Most of the series is...` / `By the end...`).

### Example

Bad (from the old Black Panther entry):
> T'Challa's cousin, abandoned in Oakland after his father was killed by T'Challa's. His grievance is legitimate and his method is not, and the film refuses to simplify either.

Good:
> Erik is T'Challa's cousin. His father N'Jobu was killed by T'Challa's father, T'Chaka, and Erik was left behind in Oakland as a child. He comes to Wakanda to take the throne and use its weapons to arm oppressed people around the world.

The bad version uses a re-framing clause, "the film" doing human things, and a verdict instead of facts. The good one just says what happened.

### Before you hand text back

Run the `writing-check` skill on every field you wrote or changed. Its mechanical half is `npm run prose <entry-id>`. Wikipedia's guide makes the point that these words and patterns are signs of a deeper problem, not the problem itself. Swapping out "pivotal" does not fix a plot that is three sentences long and vague. Thin content and wrong facts matter more than any single word.

## Content conventions

- `summary`. One spoiler-light sentence; anything more revealing goes in `deepDive.plot`.
- Only add month/season precision to `inUniverseSetting` when confirmed.
- `postCredit.skipNote` is rare and deliberate.
- `spoils`. Slash-separated, and each segment should be an **exact entry title** ("She-Hulk: Attorney at Law/Echo"), since the tag is what tells the reader which title they're about to have spoiled. `Loki` is the one established shorthand. A film that isn't in the tracker (Daredevil: Born Again, Wonder Man, the Sony Spider-Man films) can be named in the prose but must not go in the tag. Nothing validates this, so it drifts.
- When editing `public/data/movies.json` programmatically, use `npm run splice <entry.json>...` (`scripts/splice-entry.js`). Each argument is a file holding one complete entry object including its `id`, and the script swaps that entry out in place. It exists because of two hazards that have both bitten this project. Entries are **not** uniformly formatted (hand-edits have left some as `},{` on one line), so bounds must come from brace-matching out from the nearest `{` before `"id"`, never from assuming a newline. And writing the file back with `JSON.stringify` reformats every line, which once turned a 29-line change into a 979-line diff; the script re-collapses the `art` blocks and the one-line `watchFirst`, `titles` and `optionalViewing` arrays afterwards. If you do hand-edit, insert new keys **before** the `summary` line, because on unreleased entries `summary` is last and has no trailing comma.

## Licensing / legal posture

- TMDB free tier is **non-commercial**. Ads, affiliate links or donations would require a separate commercial agreement with TiVo. The user has decided to keep it free.
- Attribution is mandatory and lives in the footer. The **official TMDB logo** must be used as a file, never redrawn. TMDB's `blue_short` SVG sits at `public/assets/tmdb.svg`, sized by `.tmdb-logo` in the handoff stylesheet and never recoloured or filtered.
- Character portraits are studio stills sourced from fan wikis, the same posture as comparable fan trackers. Fine for a free project; would need revisiting if monetised.

## Workflow

- **Always ask before committing.** Pushing needs its own separate ask.
- The user's own small content tweaks (image swaps, data edits) don't need their own commit, so let them ride along.
- **Anything that marks titles watched writes to the real browser save.** `data/progress.json` is no longer touched, so backing it up protects nothing. Export a copy from the menu before any test that writes progress, and import it back afterwards.
- The user welcomes unprompted suggestions, so offer them.
- **The MCU Fandom wiki is the other source, and it works.** `marvelcinematicuniverse.fandom.com` has an **Appearances** list on every location, organisation and character page, broken down by film and series, plus per-scene history sections. It caught three scenes missed from the location files (Bruce and the Ancient One at the 2012 Sanctum in Endgame, the Thor: The Dark World mid-credits being on Knowhere, Doctor Strange passing through the Quantum Realm), corrected where the Shang-Chi mid-credits scene happens, and cut S.W.O.R.D. and the Kree Empire down to their real size. **WebFetch 402s on that host**, use the browser tools (`preview_start {url}` then `javascript_tool` to pull `<h2>/<h3>` sections). Roughly a third of page loads fail and succeed on a straight retry. It is fan-edited, so it beats recall but is not authoritative, and its prose is never copied.
  - **Its biography sections mix film canon with tie-in comics and one-shots, and the prose does not flag which is which.** Only the citation number does. The Arnim Zola page states that Peggy Carter drugged the guards at Castle Kaufmann to free Erskine before the war, which is not in The First Avenger at all; it traces to *Captain America: First Vengeance*, a prelude comic. Check the reference before using a detail that you cannot place in the film yourself.
  - The **Appearances** list is the reliable part, but read the qualifiers: `(mentioned)`, `(logo)`, `(flashback)`, `(corpse)` and `(photo)` are all listed as appearances and rarely justify a line. Entries under an *Alternate Universes* heading are variants, not the main-timeline thing.
- **Verify against TMDB rather than recall for anything checkable.** The project has a key in `tmdb.key` and every entry has an `art.tmdbId`, so episode titles, air dates and overviews are one fetch away: `https://api.themoviedb.org/3/tv/<id>/season/<n>?api_key=<key>`. This is not theoretical. Echo had four of five episode titles invented, Agatha All Along had eight of nine wrong *and shifted by one*, so nine episode plots written from those titles were all mis-assigned. Thor: Love and Thunder carried the Guardians Holiday Special's `tmdbId` and rendered its poster. Audit the whole file, not just the entry in hand, all three were found by sweeping every series and every id at once.
- **Only correct what you are certain of; collect the rest into a list for the user.** Their instruction, after the Echo and Agatha errors. A confidently wrong "fix" is worse than leaving the original. This has already paid off twice: Pepper was credited in Civil War and does not appear (removed), Happy was credited and does appear (kept, line added).
- **No paragraph breaks in `deepDive.plot`.** Decided August 2026 and settled. The Deep Dive body has no `white-space: pre-line`, so `\n\n` collapses silently; enabling it would be a CSS change affecting every body on every entry, and no existing entry has breaks, so a partial pass would look worse than none. Plots are read start to finish, unlike the character phase records that `pre-line` exists for.
- **Do not put `\n` inside a `node -e` string in the shell.** Git Bash mangles the escape into a raw newline, which is invalid inside a JSON string literal and breaks the whole data file. It happened twice. Write the script to a file and run it with `node <path>` instead.

## Where the content rewrite has got to

### State

- **Phase One** is finished.
- **Phase Two** is finished apart from **Captain America: The Winter Soldier** and **Avengers: Age of Ultron**.
- **Phase Three** has had a real pass on **Infinity War, Captain Marvel and Endgame** only, and those were early enough that the user wants to re-read them.
- **Phase Four** is finished, including Shang-Chi, which moved in from Phase Five.
- **Phase Five** has had **Moon Knight** only.
- **Phase Six** has had nothing.

Every entry in Phases Three, Five and Six already carries a `plot`, `significance`, `context` and a `watchFor` list, so a completeness check will not find the gap. The older text is from the original AI pass and has been through neither the user nor the house style. Judge an entry by whether it reads like the reference entries named in the Writing style section, not by whether its fields are populated. Phases Five and Six hold the last 22 em dashes, and `npm run check` reports the count per phase.

### How the remaining work is ordered

The rewrite is being done **newest first**. The user is publishing around VisionQuest and expects arrivals to check the recent titles rather than the 2008 ones, so Phase Five leads and Winter Soldier and Age of Ultron come last. Work forward through a phase rather than cherry-picking.

**Nothing goes public until the whole rewrite is finished.** A reader who hits one hand-written entry and one obviously AI-written entry will write the whole thing off, which defeats the point. Treat "is every phase done" as the release gate.

The user writes or corrects the content. The assistant does the structural pass, meaning expanding `watchFor`, splitting payloads, `characterId`, `nameIsSpoiler` and de-dashing, unless asked otherwise. The user then edits on top, so don't be precious about the wording.

### Ordering rules that are settled

- **Re-bucketing inside a phase is cheap. Across phases is expensive.** A move inside one phase is just renumbering `narrativeOrder` and fixing the `orderNote` fields. A move between phases also breaks every character file that mentions the title, because a character's `phases` key is the phase the paragraph is filed under. Moving Shang-Chi from Phase Five to Phase Four needed nine character files changed, and those split three ways. Some paragraphs moved whole. Some had to be **split**, because the paragraph also held a line for a film staying behind. Some had to be **merged** into a paragraph that already existed at the destination. A blind key rename destroys the last group. Two `titles` arrays also needed re-sorting, because the move changed which film came first.
- **`orderNote` fields rot when anything moves, and they rot silently.** `npm run check` does not catch it. After any reorder, read every `orderNote` in the affected phase, not just the entry you moved.
- **Phase One in-universe years** are Iron Man 2009, The Incredible Hulk 2010, Iron Man 2 2010, Thor 2010, The Avengers May 2012. This is the user's scheme, it is internally consistent, and it runs a year ahead of Marvel's own timeline book. Do not "fix" it back.
- **Secret Invasion sits before The Marvels.** Secret Invasion ends with Fury going back to space, and The Marvels has him already stationed there. Talos does not appear alive in The Marvels because Gravik kills him in Secret Invasion, so Secret Invasion has to come first.
- **Quantumania's `orderNote` is deliberately provisional.** The user may re-order some of Phase Four once the rest of it is written, so it states the Loki-either-side reasoning and nothing more.
- **What If...? is threaded through `optionalViewing` one season at a time**, so a reader is never pointed at a season that spoils films they have not reached. S1 on Quantumania, S2 on Multiverse of Madness, S3 on Ironheart.

### Content rules that are settled

- **`nameIsSpoiler` is the standard tool for cameo and death cards**, not a rarity. If a name in the no-spoilers chip row would reveal that someone turns up, or that they die, hide the chip and keep the payloads. An entry can legitimately end up with more hidden cards than visible ones.
- **`public/data/characters.json` is done.** The files use the one-film-per-line format, carry no em dashes, and name every credited film. The user reviewed them in batches and approved the voice, so treat them as a reference sample rather than prose still waiting on a pass.
- Two defects found in that file are worth knowing as a class of problem. One file opened with a scene the character is not in (Okoye, where her own `titles` already disagreed), and several paragraphs had words dropped mid-sentence or began mid-sentence with no opening clause. There is also **a second AI voice** in about a dozen files, flat past-tense narration unlike the rest (Maria Rambeau, Yon-Rogg, Goose, Ebony Maw, Cull Obsidian, the Collector). That pocket carried the broken sentences, so if more of it surfaces, read it closely.

### Known stale data

- **`spiderman-4` (Spider-Man: Brand New Day)** is still `released: false` with no `watchFor` or `deepDive` and a placeholder summary. TMDB gives its release date as 2026-07-29, so the stored "July 31, 2026" is wrong as well. While the flag is false the entry is excluded from watched-count denominators, so completion percentages are understated for anyone who has seen it. The user knows and has chosen to leave it until the Phase Five and Six pass reaches it in order. Do not fix it out of turn.
- **VisionQuest has started airing and the entry has not caught up.** As of 24 October 2026 TMDB has it as a returning series, one season, 8 episodes, first aired 2026-10-13, with episodes dropping in pairs. Episodes 1 to 4 have real titles and overviews (No Strings, Theseus, Reboot, Malware). Episodes 5 to 8 have air dates of 27 October, 3 November and 10 November but no overviews yet. The stored entry is still `released: false` with `expectedRelease: "Fall 2026"` and no `seasons` wrapper, so it needs the wrapper, the flag flipped, and real content. Pull every title and date from TMDB rather than memory, and invent nothing for the episodes that have not aired. That is exactly how the Echo and Agatha All Along errors happened.

## Not yet built

- Overall stats (hours watched, average rating, etc.), the last item from the original roadmap
- Portraits for the five characters added in August 2026: `christine-palmer`, `hunter-b15`, `ravonna-renslayer`, `alioth`, `darren-cross`. No files exist for them yet, so they fall back to monogram tiles. The user supplies the images; wiring one up is a single `image` field.
- Possibly: Fox-era movies, an anime section
