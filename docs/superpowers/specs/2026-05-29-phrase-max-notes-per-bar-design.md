# Phrase drill — max notes per bar (note-density slider)

**Date:** 2026-05-29
**Status:** Approved, pending implementation plan

## Goal

Add a "Max notes/bar" slider to the Phrase section that caps the number of
**sounding notes per bar** the generator may place. Mirrors CET's "note
density (max events per bar)" control. The slider's range is **dynamic** —
its bounds adapt to the selected rhythms and the Rests-included toggle so
every slider position is achievable.

## Definitions

- **Sounding note** — a note event that actually plays (a rhythm slot whose
  `kind === 'note'`). Rests do **not** count toward the cap.
- **Per bar** — the cap applies to each bar independently. For a 2- or 4-bar
  phrase, *every* bar must satisfy it. The slider value is per-bar regardless
  of `phraseBars`.

## Beat-group density constants

Derived from `BEAT_GROUPS` in `phrase-gen.js`. For each allowed group:

| group            | beats | note events | events/beat | beats/note |
|------------------|-------|-------------|-------------|------------|
| half             | 2     | 1           | 0.5         | 2          |
| quarter          | 1     | 1           | 1           | 1          |
| eighthPair       | 1     | 2           | 2           | 0.5        |
| tripletEighths   | 1     | 3           | 3           | 1/3        |
| tripletQuarters  | 2     | 3           | 1.5         | 2/3        |

## Dynamic range

For a 4/4 bar (4 beats):

- **Max** = `4 × max(events-per-beat over selected rhythms)`.
  Depends on **rhythms only** — rests can only thin a bar, never add notes,
  so the ceiling is always the densest all-sounding fill.
  - triplet-eighths → 12, eighths → 8, quarters → 4, half → 2,
    triplet-quarters → 6.
- **Min** — depends on the **Rests included** toggle:
  - **Rests ON →** `1` (rest away everything but one note).
  - **Rests OFF →** sparsest all-sounding fill = `2` if `half` is selected,
    else `4` (you cannot make a bar with fewer sounding notes when nothing
    can be a rest). Formula: `4 / max(beats-per-note over selected rhythms)`,
    which resolves to 2 (half present) or 4 (quarter-only), since a cadential
    group — half or quarter — is always required.

### Recompute triggers

The range is recomputed (and the current value re-clamped) when:

1. A **rhythm chip** is toggled (changes max; changes min if half is
   added/removed).
2. **Rests included** is toggled (moves min between 1 and 2/4; max unchanged).

### Clamp + track behavior on recompute

- Clamp the current value into the new `[min, max]`.
- **Track-up:** if the value was sitting at the *previous* max, bump it to the
  *new* max — so adding a denser rhythm doesn't silently introduce a cap.
- Otherwise the user's chosen value is preserved (clamped only if now out of
  range).

### Worked examples

- quarters only, rests ON → range **1–4**.
- quarters only, rests OFF → range **4–4** (locked; the only rests-off quarter
  bar is four quarters).
- triplet-eighths + half, rests ON → range **1–12**.

## Enforcement (Approach A — validate + retry)

`generatePhrase` already retries up to `maxAttempts` and throws when it can't
satisfy validation; `buildPhraseCard` catches the throw and returns `null`,
which `nextCard` already handles by showing the "couldn't build a phrase"
toast and ending the session.

Add the cap as a **validation step**, reusing that machinery:

1. Thread `maxNotesPerBar` into `generatePhrase({ ... })`.
2. In `validatePhrase` (after `insertRests`), count sounding notes per bar;
   if any bar exceeds `maxNotesPerBar`, return a new validation error
   `{ code: 'tooManyNotesInBar' }` → the loop retries with a fresh rhythm.
3. If no candidate satisfies the cap within `maxAttempts`, the existing throw
   → `null` → toast path fires. **No silent over-dense fallback** (this is the
   bug CET hit and fixed: a cap that "lies" by returning an over-dense phrase).

Because the dynamic min guarantees the cap is never set below the achievable
floor, exhaustion should be rare in practice; when it happens (an unlucky run
of dense random rhythms), the honest-fail message is correct and actionable.

Composer biasing (CET's Approach B — building sparse rhythms directly) is
explicitly **out of scope** for v1. If tight caps prove slow (many retries),
add biasing later; A's validation remains the hard guarantee.

## State & persistence

- New field: `state.notation.phraseMaxNotesPerBar` (integer).
- **Default:** the max for the default rhythm set
  (`['quarter','half','eighthPair']` → densest is eighthPair → **8**), i.e. no
  effective cap, so existing behavior is unchanged until the user touches it.
- Saved/loaded with the other notation settings (`saveNotationSettings` /
  `loadNotationSettings` / `applyNotationSettingsToUI`), clamped into the
  current dynamic range on load.

## UI

- An `.ios-slider` row in the Phrase section of `index.html`, placed
  **immediately after the Rhythm row** (it depends on rhythm).
- Label shows the live value, e.g. `Max notes/bar — 8`.
- Reuses the existing slider styling; a small fill/label update mirroring the
  EQ sliders' `_updateSliderFill` pattern (or simpler — value text only) is
  sufficient. `min`/`max`/`value` attributes are set programmatically from the
  computed range, not hardcoded in markup.
- Slider is inside the phrase config section, which is already drill-gated
  (only visible for the phrases drill).

## Call-chain threading

- `phrases.js` anchor builder (reads `ns.phraseBars`, `ns.phraseAllowedDurations`)
  → also read `ns.phraseMaxNotesPerBar` and attach to the anchor.
- `buildPhraseCard` → pass `maxNotesPerBar: anchor.maxNotesPerBar` into
  `generatePhrase`.
- `generatePhrase` → forward to `validatePhrase`.
- `validatePhrase` → per-bar sounding-note count check.

## Helper to share

The min/max computation is needed in two places (the config-change handlers in
`src/phrase-config.js`, and clamp-on-load in `src/notation-settings.js`).
Extract a single pure helper, e.g.
`phraseDensityRange(allowedDurations, restsIncluded) -> { min, max }`, to avoid
duplicating the formula.

## Edge cases

- **Rests OFF lower bound:** value locks at 2 or 4; slider min === max is
  possible (quarters-only, rests off → 4–4). In that degenerate case render the
  slider **disabled**, locked at the single valid value (still showing the
  number in the label).
- **No half/quarter selected:** impossible — `composeRhythm` already requires a
  cadential group; `validatePhraseConfig` enforces this upstream.
- **Loading an out-of-range saved value:** clamp on load.

## Out of scope

- Composer-side biasing (Approach B).
- Per-beat or per-phrase (vs per-bar) density controls.
- Applying the cap to non-phrase drills.
