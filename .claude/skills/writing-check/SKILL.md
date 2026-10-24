---
name: writing-check
description: Self-edit pass for any prose written or changed in public/data/movies.json or characters.json. Run it before handing any data-file text back to the user.
---

# Writing check

Run this on every field you wrote or changed before you show it to the user. The rules live in the "Writing style" section of CLAUDE.md. This is the procedure for checking against them.

## 1. Mechanical scan

Run these over the text you changed (or the whole entry) and fix every hit.

- Em dashes: `—`. `npm run check` also counts these per phase.
- Colons inside prose fields (not JSON syntax). Any `": "` sitting inside a sentence is a hit.
- Curly quotes and apostrophes: `’ ‘ “ ”`.
- Missing space after a full stop: a regex like `[a-z]\.[A-Z]` catches "JARVIS.This".
- Banned words. Search case-insensitively for: testament, pivotal, crucial, iconic, legendary, legacy, profound, underscore, highlight, cement, solidif, delve, tapestry, intricate, nuanced, multifaceted, interplay, compelling, resonat, showcase, foster, bolster, embark, unravel, grappl, notably, interestingly, importantly, remarkably, moreover, furthermore, additionally, "it's worth", "worth noting", "from the shadows", "comes to a head", "sets the stage", "paving the way", "go in cold", "dive into", unleash, "game-changing", "load-bearing", "best scene", "widely", "the film refuses", "the film argues", "the film insists", absolutely, totally, completely, incredibly, extremely, utterly, truly, deeply, "rather than", "runs with", "reach back", "reaches back", "arrives with", "leans on", "lands on", "the run", thread, deliberate, fresh, "takes nothing", "leaves it there", "cost him", "cost her", "worth knowing", "picks up", "picked up", "built on".
- Sentences ending in an "-ing" tail after a comma (", highlighting", ", reflecting", ", cementing", ", setting").

A hit is not always wrong ("completely" can be literal, "realm" is fine for the nine realms). Decide each one, don't blind-replace.

## 2. Read-through

Read each field start to finish and check for:

1. **Re-framing clauses.** Delete any clause that could go without losing a fact. Keep plain statements of significance.
2. **Opinions.** Anything that reviews the film or claims what fans or critics think.
3. **Negation setups.** "Not X, but Y", "not just X", or a "Not X." fragment followed by "Y."
4. **Threes.** A list of three where three isn't the real number, especially three clipped fragments.
5. **Fragments and punchlines.** Short sentences used for a dry or dramatic beat. Bare one-line facts with nothing connecting them.
6. **Repeated openings.** Three sentences in a row starting the same way.
7. **Too austere.** If you trimmed, make sure the descriptive detail and connectors survived.
8. **Field fit.** `summary` is one sentence with no ordering notes. `context` is orientation, not a preview. `future` stands alone without `thisFilm`. Full titles on first mention.
9. **Spoilers.** `context` never mentions this title's own events or anything later. Chip names in "Before you watch" give nothing away (use `nameIsSpoiler` if they do).
10. **Abstract things that move.** Any sentence where an idea, film, scene or story is the subject of a movement verb (arrives, runs, lands, leans, stands, reaches back, picks up). Rewrite with a person or event as the subject.
11. **Empty closing tags.** The last few words of each sentence. If they are vague and point back at "it", "there" or "him" without naming anything, cut them or say the actual fact.
12. **"Rather than".** Keep it only when a character really chooses between two options in the story.
13. **Announcing sentences.** Any sentence that only sets up the next one ("Two things do reach back"). Cut it and lead with the fact. Check for emphatic "do" or "does".
14. **Facts.** Anything you are not sure of goes on a list for the user instead of into the text. Episode titles and dates come from TMDB, never from memory.

## 3. Report

Tell the user in a line or two what you changed in this pass, and list anything you were unsure about instead of guessing.
