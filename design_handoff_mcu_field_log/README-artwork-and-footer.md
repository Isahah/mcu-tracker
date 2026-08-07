# Addendum: title artwork (TMDB) + footer

Merge with `README.md`. Where this file and `mcu-field-log-v4.css` disagree, the CSS wins.

## Accepted deviations from the last brief

All three are correct — keep them.

1. **Post-credit skip warnings stay.** I removed counts as trivia; a warning that a scene
   spoils a later title is spoiler protection and belongs. `.note--red` was unused after the
   last pass, so this gives it its purpose back. Put it directly under the summary, above
   `.before-watch`.
2. **`watchFor` split across the two panels** is right. The in-title half is a fourth
   sub-block inside Plot & context; the future half sits in Spoilers for future films.
3. **Character portraits in full colour at rest** — agreed, and the greyscale rules are now
   deleted from the stylesheet (`.character-card img` and `.portrait-frame img`). The
   character-card hover keeps the 420ms brass fill and the 1.07 zoom; only the filter is gone.

## Decision needed: hero treatment — try 10c first, fall back to 10b

Both are built and both are in this stylesheet. **Implement `.card-wash` (10c) first** so the
designer can see it against real TMDB stills. If it does not hold up — the risk is a bright
daylight backdrop going washy over the long fade — switch to `.title-hero--bleed` (10b),
which is a one-class change on the same markup. Full specs for both are further down.

- **10c `has-wash` + `.card-wash`** — backdrop is a card-level layer, strongest at the top,
  masked out by ~70% down the card. Most cinematic, most sensitive to the source image.
- **10b `.title-hero--bleed`** — backdrop confined to the header, 8% oversized, dissolving at
  every edge into navy. Safer across a mixed set of stills.

Do not ship both. Once one is chosen, delete the other's rules.

**Not in this handoff:** the masthead / wordmark. Five options are still being explored in
Claude Design — leave `.app-bar__mark` and `.masthead` exactly as they are.

## Where artwork goes

| Place | Artwork | Why |
|---|---|---|
| Phase list rows | **Poster, 46px wide** | Recognition matters most here. Ships with an on/off toggle. |
| Movie detail | **Hero — 10c card wash, or 10b vignette bleed** | The natural home for large artwork. |
| Series pop-up | **Same hero as the detail page** | Consistency with movie detail. |
| Resume card | **Poster, 64px, beside the type** | One card, high value, sets the tone. |
| Phase cards | **None** | Six competing backdrops destroy the roman-numeral system, and picking one title to represent a phase is arbitrary. |
| Character grid / file | **None** | Those are people, not titles. Different ratio family. |

**Title text is never placed over artwork.** The backdrop is a band with a hairline under it
and the title beneath — no scrim, no gradient, nothing that counts as compositing. This also
sidesteps every legibility problem a busy still would cause.

## The ratio law

Three ratios, each with exactly one meaning. Do not introduce a fourth.

```
2 : 3    title artwork, poster        .art--poster
16 : 9   title artwork, backdrop      .art--backdrop
1 : 1    a person, in a grid          .character-card .portrait-wrap
3 : 4    a person, on their own page  #character-content .portrait-frame
```

## How a poster reads as "watched"

**It doesn't — the image is never touched.** TMDB artwork must read as the studio's, and
permanent desaturation was already rejected on character portraits. Status keeps its three
existing signals (left edge, `.case-num`, status pill) and the art box gains a **ring**:

```css
.case-card.is-watched  .art { box-shadow: 0 0 0 2px var(--brass); }
.case-card.is-watching .art { box-shadow: 0 0 0 2px var(--crimson); }
```

A ring is a border on the wrapper, not a filter on the pixels. Unwatched gets no ring — the
absence reads correctly next to rings on either side.

**The numeral stays.** Poster and numeral coexist; the numeral shrinks from 34px to 26px.
Dropping it would cost a status signal and the narrative-position information, which is the
whole premise of the app.

## Fallback when there is no artwork

Reuse the character-monogram system exactly. `.art` already reads `--mono-bg` / `--mono-fg`,
so the existing `.no-photo--t1` … `--t6` tint classes work on it unchanged:

```html
<span class="art art--poster no-photo--t3">
  <span class="art-none">SM</span>
</span>
```

Hash the **title** to a stable 1–6 so the same film always gets the same tile. For backdrops
use the title's short name instead of initials — there is room.

## Loading behaviour

61 posters is fine if you do four things:

1. **Fixed aspect-ratio box.** `.art--poster` sets `aspect-ratio: 2 / 3`, so the row reserves
   its space before the image arrives. No layout shift, ever.
2. **`loading="lazy" decoding="async"`** on every `<img>`.
3. **Fade in.** The image starts at `opacity: 0`; add `.is-loaded` in an `onload` handler.
   Behind it sits the hatch skeleton, so an empty box never looks broken.
4. **Right size from TMDB.** `w92` for the 46px list thumb (covers 2× DPR), `w154` for the
   64px resume poster, `w500` for a detail poster if you ever add one, `w780` for the
   backdrop band (`w1280` only above 1024px).

```js
`<img src="https://image.tmdb.org/t/p/w92${poster_path}" alt="" width="46" height="69"
      loading="lazy" decoding="async" onload="this.classList.add('is-loaded')">`
```

`alt=""` is correct — the title is already in text beside it, so the poster is decorative to a
screen reader and an alt would just duplicate.

## Density toggle

A 46px poster adds ~31px per row; across 61 rows that is ~1,900px of extra scroll. Give the
user the choice rather than deciding for them. A chip in the existing filter strip toggles
`.is-compact` on `#case-files`:

```css
#case-files.is-compact .art { display: none; }
#case-files.is-compact .case-card { grid-template-columns: 34px 1fr auto 32px; }
```

Persist the preference alongside the other UI state.

---

## Markup: `.case-card` in all four states

Grid is `26px 46px 1fr auto 32px` (`22px 40px 1fr 32px` under 480px).

### Watched

```html
<a class="case-card is-watched" href="#/title/wandavision">
  <span class="case-num">1</span>
  <span class="art art--poster">
    <img src="https://image.tmdb.org/t/p/w92/glKDfE6btIRcVB5zrjspRIs4r52.jpg" alt=""
         width="46" height="69" loading="lazy" decoding="async"
         onload="this.classList.add('is-loaded')">
  </span>
  <span class="case-main">
    <span class="case-titleline">
      <span class="case-title">WandaVision</span>
      <span class="badge">Series</span>
    </span>
    <span class="case-meta">2021 · series · 9 of 9 eps</span>
  </span>
  <span class="case-status">
    <span class="stamp">Watched</span>
    <span class="case-rating">9.0</span>
  </span>
  <button class="pin-btn" type="button" aria-label="Flag as currently watching">⚑</button>
</a>
```

### In progress

```html
<a class="case-card is-watching" href="#/title/eternals">
  <span class="case-num">4</span>
  <span class="art art--poster">
    <img src="https://image.tmdb.org/t/p/w92/bcCBq9N1EMo3daNIjWJ8kYvrQm6.jpg" alt=""
         width="46" height="69" loading="lazy" decoding="async"
         onload="this.classList.add('is-loaded')">
  </span>
  <span class="case-main">
    <span class="case-titleline"><span class="case-title">Eternals</span></span>
    <span class="case-meta">2021 · film</span>
  </span>
  <span class="case-status"><span class="badge badge--crimson">▶ Watching</span></span>
  <button class="pin-btn is-active" type="button" aria-label="Unflag">⚑</button>
</a>
```

### Unwatched

```html
<a class="case-card" href="#/title/hawkeye">
  <span class="case-num">5</span>
  <span class="art art--poster">
    <img src="https://image.tmdb.org/t/p/w92/pqzjBxwbJyvTZ4WNBrWtRFNQNwR.jpg" alt=""
         width="46" height="69" loading="lazy" decoding="async"
         onload="this.classList.add('is-loaded')">
  </span>
  <span class="case-main">
    <span class="case-titleline">
      <span class="case-title">Hawkeye</span>
      <span class="badge">Series</span>
    </span>
    <span class="case-meta">2021 · series · 0 of 6 eps</span>
  </span>
  <span class="case-status"><span class="case-dash">—</span></span>
  <button class="pin-btn" type="button" aria-label="Flag as currently watching">⚑</button>
</a>
```

### Unreleased (no artwork — fallback tile)

```html
<a class="case-card is-unreleased" href="#/title/untitled-special">
  <span class="case-num">7</span>
  <span class="art art--poster no-photo--t3">
    <span class="art-none">TBA</span>
  </span>
  <span class="case-main">
    <span class="case-titleline">
      <span class="case-title">Untitled Special Presentation</span>
      <span class="badge badge--muted">Not yet released</span>
    </span>
    <span class="case-meta">2026 · special</span>
  </span>
  <span class="case-status"></span>
  <span class="pin-btn" aria-hidden="true"></span>
</a>
```

## Markup: title hero (detail page + series pop-up)

Replaces the plain backdrop band. The backdrop is a background layer, the poster sits on top
of it, and a two-axis scrim carries the type — dark down the left where the words are, melting
into `--surface` at the bottom so the hero dissolves into the card rather than ending on a
line. The scrim is an overlay in the page, not an edit to the file: TMDB still serves the
artwork intact and unmodified.

First child of `#detail-content` (movie) or `#modal-content` (series).

```html
<header class="title-hero">
  <span class="title-hero__bg">
    <img src="https://image.tmdb.org/t/p/w1280{backdrop_path}" alt=""
         loading="lazy" decoding="async" onload="this.classList.add('is-loaded')">
  </span>
  <div class="title-hero__body">
    <span class="art art--poster title-hero__poster">
      <img src="https://image.tmdb.org/t/p/w342{poster_path}" alt=""
           width="150" height="225" loading="lazy" decoding="async"
           onload="this.classList.add('is-loaded')">
    </span>
    <div class="title-hero__text">
      <h2 class="page-title">Spider-Man: No Way Home</h2>
      <p class="kicker">Movie · Released December 17, 2021</p>
      <div class="chip-row">
        <span class="chip chip--fact">Set: 2024</span>
        <span class="chip chip--fact">Months after Far From Home</span>
      </div>
    </div>
  </div>
</header>
```

- Hero is `min-height: 340px` (260px in the modal, auto below 760px where the poster stacks
  above the type).
- Poster is 150px wide (112px in the modal, 108px on phones) with a drop shadow and a 1px
  keyline, so it reads as sitting *on* the backdrop.
- When TMDB has no backdrop, put a `.no-photo--t1`…`--t6` tint class on `.title-hero__bg` and
  omit the `<img>` — the scrim then reads as a plain tinted header and nothing looks broken.
- Sizes: `w1280` for the backdrop above 1024px (`w780` below), `w342` for the poster.
- `.art--backdrop` is still in the stylesheet for any plain, non-hero band; nothing uses it now.

### Hero variant: `.title-hero--bleed`

An alternative treatment, still being chosen between. Add the class to `.title-hero`: the
backdrop then runs 8% oversized and dissolves at every edge into the card's navy via a radial
mask, rather than filling the frame and melting only at the bottom. Because the image has
already faded where the type sits, the scrim is much lighter, so more of the picture survives.
Height goes 340px → 400px on desktop and collapses to auto below 760px like the base hero.

### Hero variant: `.card-wash`

The third option. Instead of a header band, the backdrop becomes a **card-level layer**: it
starts at the top, runs down behind the summary and panels, and is masked out entirely by
about 70% of the card's height. The most cinematic of the three and the most sensitive to
the source image — a bright daylight still needs a heavier scrim than a moody one.

Required DOM position: `.card-wash` must be the **first child** of the `.dossier` (or
`#modal-content`), before the hero, and the container needs `has-wash`:

```html
<div class="dossier wide has-wash">
  <span class="card-wash">
    <img src="https://image.tmdb.org/t/p/w1280{backdrop_path}" alt=""
         loading="lazy" decoding="async" onload="this.classList.add('is-loaded')">
  </span>
  <header class="title-hero"> … </header>
  … summary, before-watch, deep panels, controls …
</div>
```

- `has-wash` makes the card `position: relative; isolation: isolate` and lifts every non-wash
  child to `z-index: 1`. On a `.dossier` it also sets `overflow: hidden`; on `#modal-content`
  it deliberately does **not** — the modal's own `overflow: auto` is what makes a long series
  pop-up scrollable, and it already clips the wash to the padding box and radius. Never add
  `overflow: hidden` to the modal.
- `.has-wash .title-hero` drops its own background and `.title-hero__bg` is hidden — the wash
  is doing that job. The poster stays.
- `.before-watch`, `.deep-panel`, `.note` and `.reveal-panel` are forced fully opaque inside a
  washed card. **Do not make them translucent** — artwork behind body text is the one thing
  that ruins this treatment.
- Wash height is 760px (520px below 760px viewport width). Tune the second gradient in
  `.card-wash::after` if bright stills sit too light.
- No backdrop for a title: put a `.no-photo--t1`…`--t6` tint on `.card-wash` and omit the
  `<img>`.

Note: the design preview uses a `.demo-still` class — five stacked radial gradients that fake
a film still so the fade is judgeable without real artwork. It is **stripped from this
handoff stylesheet** and must not be recreated; drop real TMDB URLs in instead.

## Markup: resume card with poster

`.resume-card` becomes `auto 1fr auto`.

```html
<a class="resume-card" href="#/title/eternals">
  <span class="art art--poster">
    <img src="https://image.tmdb.org/t/p/w154/bcCBq9N1EMo3daNIjWJ8kYvrQm6.jpg" alt=""
         width="64" height="96" loading="lazy" decoding="async"
         onload="this.classList.add('is-loaded')">
  </span>
  <span>
    <span class="resume-kicker">Currently watching</span>
    <span class="resume-title">Eternals</span>
    <span class="resume-meta">Phase four · film · 2021</span>
  </span>
  <span class="resume-cta">Open →</span>
</a>
```

## Markup: footer

Last child of `.screen-inner` on **every** screen. In flow, not fixed — `padding-right: 200px`
keeps it clear of the dock on desktop, and screens already reserve 110px of bottom padding so
the dock never covers it at the end of a scroll. Under 760px the padding drops to 0 because
the dock spans the full width above the bottom edge.

```html
<footer class="site-footer">
  <p class="tmdb-credit">
    <img class="tmdb-logo" src="assets/tmdb.svg" alt="TMDB">
    This product uses the TMDB API but is not endorsed or certified by TMDB.
  </p>
  <p>Unofficial fan project. Not affiliated with, endorsed by or sponsored by Marvel or
     Disney. All titles, characters and logos are the property of their respective owners.</p>
</footer>
```

Download the **official** TMDB logo from their branding page and reference it as a file —
never redraw or restyle it. `.tmdb-logo` sets only `height: 13px`. The preview uses a dashed
`.tmdb-logo--slot` stand-in; delete that rule once the real asset is in.

## New class names

`art` `art--poster` `art--backdrop` `art-none` `is-loaded` `is-compact`
`title-hero` `title-hero__bg` `title-hero__body` `title-hero__poster` `title-hero__text`
`title-hero--bleed` `has-wash` `card-wash`
`chip-swatch` `site-footer` `tmdb-credit` `tmdb-logo`

Reused unchanged: `no-photo--t1` … `no-photo--t6` now also tint `.art` fallbacks.

No renames. No removals.
