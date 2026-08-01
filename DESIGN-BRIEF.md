# Design brief — MCU Field Log

Copy everything below this line into Claude Design, along with screenshots of the five screens listed in section 3.

---

## 1. What this is

A personal Marvel Cinematic Universe watch tracker — a single-page web app I run on my own machine. It lists every MCU movie and TV series in **narrative order** (the order the story happens in, not release order), lets me mark things watched and rate them, and — this is the important part — it's built to **avoid spoiling me**. Plot details, character notes, and future-movie context are all hidden behind toggles I choose to open.

There's also a character database: 119 characters with portraits, and a per-character record of what they did in each phase, hidden behind collapsed dropdowns so just browsing can't spoil anything.

The current aesthetic is a **classified case file / field dossier**: dark navy background, cream "paper" cards, typewriter headers, rubber-stamp badges, red CLASSIFIED stamp, tape strips in the corners. I like this direction and want it sharpened rather than thrown out — but if you see a stronger version of the idea, show me.

**What I want:** it to look genuinely well-designed. Right now it's functional but the spacing, hierarchy, and density feel amateur. I want it to feel intentional.

## 2. Current visual values

Use these as a starting point — change them if you have something better, but tell me what you changed.

**Colors**
```
--ink:        #10131f   /* page background, darkest navy */
--ink-panel:  #1a1f33   /* raised dark panels, list rows */
--paper:      #e9e4d6   /* cream card background */
--paper-dim:  #d8d2c0   /* muted paper, progress bar track */
--stamp-red:  #c23b2e   /* CLASSIFIED stamp, spoiler warnings */
--brass:      #b98b3e   /* ratings, credit-scene notes, "currently watching" */
--teal:       #2e8b84   /* progress fill, watched state, links */
--text-light: #ede9dc   /* body text on dark */
--text-dim:   #a3a29a   /* secondary text on dark */
--border-ink: #2a3050   /* borders on dark panels */
--radius:     3px       /* corner rounding, deliberately sharp */
```

**Fonts** (already loaded from Google Fonts — free to use any of these three, please don't add new ones)
- `Special Elite` — typewriter face, used for headings and titles
- `Inter` — body copy
- `JetBrains Mono` — labels, counts, badges, anything data-like

## 3. The screens

1. **Main menu** — big title masthead, then six "phase" cards in a grid (each shows phase name, subtitle, a progress bar and an "X / Y" count), then a wide card linking to the Character Database. This is the emptiest screen and probably needs the most help.
2. **Phase list** — a header panel with the phase title and overall progress, then a vertical list of rows, one per movie/series. Each row has a number, title, year, and various status badges.
3. **Movie detail page** — the content-heavy one. Title, summary, then collapsible sections for deeper info, a list of character tags, two separate spoiler-reveal buttons, and a controls row at the bottom.
4. **Character database** — a search box and a dense grid of small cards, each just a square portrait and a name.
5. **Character detail page** — large portrait, name, an overview paragraph, then six collapsed dropdown rows (one per phase).

There's also a **modal popup** (for picking an episode of a TV series) and a **fixed "Now Watching" tab** pinned to the bottom-right corner of every screen.

## 4. Component inventory

Please give me styling for all of these — they repeat across screens, so they matter more than any single layout:

**Containers**
- Cream "paper" panel (the main card surface)
- Dark raised row/panel (list items)
- Modal dialog + close button

**List items**
- Phase card (title, subtitle, progress bar, count)
- Movie/series row (number, title, year, badges, status, a small pin icon on the right)
- Episode row (number, title, watched stamp)
- Character card (square image + name)
- Square image placeholder for characters with no photo yet ("NO PHOTO ON FILE")

**Badges and stamps** (there are a lot — they need to feel like one family, not seven unrelated things)
- "VIEWED" — rubber-stamp look, currently rotated slightly
- "SERIES" / "SPECIAL" — type label
- "NOT YET RELEASED" — dashed outline, muted
- "▶ CURRENTLY WATCHING" — brass
- Credit-scene count badge
- Episode count ("3 / 6 episodes")

**Notes / callouts** (three severity levels)
- Red warning — spoiler-related cautions
- Brass note — post-credit-scene info
- Muted dashed note — unreleased titles

**Interactive**
- Primary button ("Mark as Watched") + its active/done state
- Secondary outline button ("Flag as Currently Watching") + active state
- Two spoiler-reveal toggle buttons (red) and one "show full plot" toggle (teal), plus the panels they open
- Collapsible accordion row (used for TV seasons and for the six character phases)
- Rating stepper: a down arrow, a value like "7.5/10", an up arrow
- Small tag chips for character names — some are plain, some are clickable links to a character page
- Small "fact chips" for timeline info (e.g. "📅 Set: 1995")
- Text input (the character search box)
- Progress bar, in two sizes
- Fixed corner tab with one or two clickable chips inside it

## 5. What I need back

Please give me a **system**, not one beautiful screen. Specifically:

1. A **color palette** with hex codes and what each color is for.
2. A **type scale** — which font, size, weight, and letter-spacing for: page title, section heading, card title, body text, small label, tiny badge text.
3. A **spacing scale** (e.g. 4/8/12/16/24/32) and corner-radius rule, so everything lines up on a consistent rhythm.
4. **CSS for every component** in section 4.
5. **One or two full screens** built as complete HTML + CSS so I can see it all working together — the phase list is the best test because it has the most pieces.

Please also point out anything you think is a bad idea in the current design and say why. Blunt is fine.

## 6. Hard constraints

These aren't preferences — the app breaks without them.

- **Plain CSS only, in a single stylesheet.** No Tailwind, no Bootstrap, no CSS-in-JS, no SASS/LESS, no npm packages, no build step. The browser reads the CSS file directly, exactly as written.
- **No new fonts or external images.** Only the three Google Fonts above, already loaded. Icons should be text/emoji/CSS shapes, not an icon library.
- **Must stay responsive** down to phone width (~375px).
- **Keep `@media (prefers-reduced-motion: reduce)` support** — animations must be disableable.
- **Please keep the existing class and ID names** listed below, and reuse them in your CSS. If you rename something, call it out explicitly so I can update the code — silent renames will break the app's behavior.

**Names the app's JavaScript depends on:**

IDs: `screen-menu`, `screen-phase`, `screen-detail`, `screen-characters`, `screen-character`, `phase-grid`, `phase-title`, `case-files`, `progress-fill`, `progress-label`, `detail-content`, `character-grid`, `character-content`, `char-phase-list`, `char-search`, `season-list`, `modal-backdrop`, `modal-content`, `modal-close`, `now-watching-dock`, `watch-toggle-btn`, `flag-toggle-btn`, `back-btn`, `detail-back-btn`, `characters-back-btn`, `character-back-btn`, `menu-character-count`

Classes: `dossier`, `dossier.wide`, `phase-card`, `case-card`, `character-card`, `episode-row`, `episode-list`, `season-block`, `season-header`, `phase-record-body`, `pin-btn`, `spoiler-toggle`, `deepdive-toggle`, and `.open` (used to show the modal)

## 7. Output format

Give me the finished CSS as code I can copy, not as a description or a screenshot. Exact hex values and pixel/rem numbers matter — I'm going to paste this into a real stylesheet.
