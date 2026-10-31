---
name: writing-check
description: Self-edit pass for any prose written or changed in public/data/movies.json or characters.json. Run it before handing any data-file text back to the user.
---

# Writing check

Run this on every field you wrote or changed before you show it to the user. The rules live in the "Writing style" section of CLAUDE.md. This is the procedure for checking against them.

## 1. Mechanical scan

```bash
npm run prose <entry-id>
```

That is `scripts/prose-check.js`, read-only. It reports per field: em dashes, colons in prose (real entry titles are blanked first, so only prose colons flag), curly quotes, missing space after a full stop, rhetorical questions, "X and also Y", "not X, but Y", "-ing" opinion tails, emphatic "do", every banned word and phrase, sentences over 32 words, three sentences in a row opening the same way, and clauses ending on a vague "it", "them", "that" or "ever since". It prints the entry's word count beside the approved reference entries, so length is checkable too.

**A hit is not always wrong.** "completely" can be literal, "realm" is fine for the nine realms, and TRAILING flags every pronoun at a clause end, most of which are fine because the subject is named in the same sentence. Decide each one; never blind-replace.

**A low score is not a pass.** Run `npm run prose` with no arguments and the approved hand-written entries sit at the top of the worst list, while the untouched original AI text scores best, because that pass wrote short flat sentences. The counts run backwards across the file. The script catches mechanical slips in text you just wrote. It cannot tell you whether the writing is good, which is what step 2 is for.

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
11. **Empty closing tags.** The last few words of each sentence. If they are vague and point back at "it", "there" or "him" without naming anything, cut them or say the actual fact. "ever since" belongs here too: say how long, or say what happened in the meantime.
12. **"Rather than".** Banned outright, not only where the contrast is fake.
13. **Vagueness.** Any "here", "this", "that", "those" or filler noun standing in for something you have not named. Name it. Then check the end of every sentence and clause: ending on "it", "them" or "that" is the most common shape of this, and it is almost always avoidable.
14. **Announcing sentences.** Any sentence that only sets up the next one ("Two things do reach back"). Cut it and lead with the fact. Check for emphatic "do" or "does".
15. **Facts.** Anything you are not sure of goes on a list for the user instead of into the text. Episode titles and dates come from TMDB, never from memory.

## 3. Report

Tell the user in a line or two what you changed in this pass, and list anything you were unsure about instead of guessing.
