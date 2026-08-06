# Design brief — adding poster artwork to MCU Field Log

Follow-up to the Ink Navy redesign, which is now fully implemented. Copy everything below the line into Claude Design.

---

## What's changed since the last brief

The Ink Navy design you delivered is live across all eight sections. Everything in it shipped as specified, with three deliberate deviations I should flag:

1. **Post-credit "skip" warnings were kept.** You removed post-credit scene counts as noise, and I removed the counts. But two titles carry a warning that a credit scene should be skipped and revisited later, because it spoils a film further along the watch order. Those render as red `note note--red` blocks under the summary. They're spoiler protection, not trivia.
2. **The `watchFor` items have two spoiler payloads**, not one — what a person or thing means *in this title*, and what it means for *later* titles. Your design has two panels, so the in-title halves live inside "Plot & context" as a fourth sub-block, and the future halves fill "Spoilers for future films".
3. **Character portraits now render in full colour** rather than greyscale-at-rest. The greyscale looked good in the grid but the character file page had no hover state, so its portrait was permanently grey with no way to reveal it.

Two panels in "Before you watch" are now populated with real data: *What you need to know going in* (prose) and *Watch these first* (chips linking to other titles).

## What I want to add: poster artwork

I'm pulling official poster art from **TMDB** (The Movie Database) via their API — the same source the well-known fan trackers use. This gives me, for all 48 released titles:

- **Poster** — 2:3 portrait, the standard theatrical one-sheet. Available at fixed widths: 92, 154, 185, 342, 500, 780px, and original.
- **Backdrop** — 16:9 landscape still from the film. Same fixed-width options.

Both are served from TMDB's CDN, so I reference their URLs rather than hosting files. I cannot recolour, filter or composite them beyond cropping and scaling — they need to read as the studio's artwork.

**The question for you: where should posters appear, and how do they coexist with the system you built?**

The design's whole logic is the status colour law — brass for watched, crimson for in progress, grey for unwatched, signalled three ways at once (left edge, numeral, pill). Poster artwork is loud, full-colour, and completely outside that system. I don't want to bolt it on and wreck the thing that makes the design work.

Places it could plausibly go:

1. **Phase list rows** — a small poster thumbnail at the head of each `.case-card`. This is the biggest change: rows are currently 34px numeral + text, and a 2:3 poster at any useful size makes them much taller. A 61-item list becomes a very long scroll. Is this worth it? Is there a size where it works?
2. **Movie detail page** — a poster or backdrop at the top, beside or behind the title. The most natural home for large artwork.
3. **The resume card on the main menu** — currently a crimson wash card with type only. A backdrop behind it, or a poster beside it.
4. **Phase cards on the menu** — currently a roman numeral watermark. Could a representative backdrop sit behind each?
5. **Series pop-up header.**
6. **Nowhere** — if you think artwork undermines the system, say so. That's a legitimate answer and I'd rather hear it now.

## Specific things to decide

- **Does the poster replace or sit alongside the `.case-num` numeral?** The numeral is one of the three status signals, so removing it costs something.
- **How does a poster read as "watched"?** Options might include a brass border, a brass corner mark, or desaturating unwatched posters so watched ones bloom into colour. Note I already rejected permanent greyscale on character portraits, so treat that pattern with care.
- **Unreleased titles have no poster** in some cases, and future titles often have only a teaser. What's the fallback?
- **Loading behaviour** — 61 posters on one screen is a lot of requests. Should they lazy-load, fade in, sit on a placeholder?
- **The 2:3 ratio fights the existing grid.** Character cards are 1:1 in the grid and 3:4 on the file page. Adding a third ratio may need a rule.

## New requirement: a footer

The design currently has no footer anywhere. I need one on every screen, containing:

- An attribution line: "This product uses the TMDB API but is not endorsed or certified by TMDB", with their logo if you want it
- A disclaimer: unofficial fan project, not affiliated with or endorsed by Marvel or Disney, all characters and logos are their property

Please design this — it should be quiet and not compete with the dock, which is fixed to the bottom-right corner and must stay clickable.

## Constraints (unchanged from the last brief)

- Plain CSS in a single stylesheet. No frameworks, no build step, no packages.
- Vanilla JS with template strings. No framework migration.
- Only the three existing fonts: Special Elite, Inter, JetBrains Mono.
- Responsive to ~375px.
- Keep existing class and ID names; call out any renames explicitly.
- Local overrides live in a separate `app-tweaks.css`, so send changes as edits to the main stylesheet and I'll merge.

## What I need back

The same as last time: **copyable CSS**, exact values, plus the markup structure for any new elements. If posters change the shape of `.case-card`, give me the full new markup for a row in each of its states (watched / in progress / unwatched / unreleased).

And please say plainly if you think any of this is a bad idea. The tracker works well right now; I'd rather not make it worse for the sake of artwork.
