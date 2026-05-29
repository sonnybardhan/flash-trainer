# Phrase exercise UX polish

**Date:** 2026-05-29
**Status:** Approved, pending implementation plan

## Goal

Make the phrase drill's flashcard focus attention on the notation: stop a stray
tap from revealing the answer, drop the irrelevant large chord-name placeholder,
center the staff, add a deliberate Reveal/Hide control, hold the revealed staff
long enough to read it before auto-advancing, and give the intro reference chord
a consistent ~2s sustain.

Scope: **phrase drill only.** No change to chords/intervals/degrees.

## Changes

### 1. Hide the stale chord-name placeholder (CSS)
The phrase card never sets `#card-root` / `#card-quality` / `#card-inversion`, so
the static HTML default ("C major root position") shows through large. Unlike the
interval/degree drills, there is no CSS hiding these for `.drill-phrases`. Add
phrase to the existing hide rule:
```css
.flash-card.drill-phrases .card-root,
.flash-card.drill-phrases .card-quality,
.flash-card.drill-phrases .card-inversion,
.flash-card.drill-phrases .card-focus-badge,
.flash-card.drill-phrases .card-name-overlay { display: none; }
```

### 2. Center the notation (CSS)
Center `#card-notation` horizontally for phrase cards (e.g. `text-align: center`
on the container; the VexFlow `<svg>` is already `display:block` — center it with
`margin: 0 auto`).

### 3. Reveal/Hide button + no layout shift
- Add a button `#phrase-reveal-btn` **below** `#card-notation` inside the flash
  card. Visible **only in aural-free** (the other modes reveal on their own).
- It toggles the staff: `Reveal` → render the phrase into `#card-notation`, label
  becomes `Hide`; `Hide` → clear the notation, label back to `Reveal`. Tracks
  `card.revealed` so back-navigation restores the correct label/state.
- **Remove tap-to-reveal:** `handlePhraseCardTap` no longer reveals or advances on
  a card-body tap. The card body becomes inert for phrases.
- **No layout shift:** reserve a `min-height` on `#card-notation` for phrase cards
  so toggling the staff in/out does not move the button or jump the layout.

### 4. Advance behavior
- **Aural-free** (no correctness): the `›` forward arrow is **always enabled** —
  advance any time. Implement by treating aural-free (and sing-back) phrase cards
  as "solved on view" in `cardIsSolved`, so `updateNavButtons` enables forward.
  No "ready" highlight in this mode.
- **Proceed-on-correct modes (aural-intime, id-degrees):** when the answer is
  given **correctly**, add a `ready` highlight class to `#forward-btn` (a distinct
  accent color), reveal the staff, then **auto-advance after the ~2s hold** (see
  §5). The new card clears the `ready` class on render.
- **Timing advance (seconds/beats/bars):** unchanged — auto-advances on the clock.

### 5. Hold ~2s before auto-advancing
For the auto-advancing modes, change the post-completion `setTimeout` delay so the
revealed staff stays up ~2 seconds before `nextCard()`:
- `startInTimeForCard` `onComplete`: success path `620` ms → `2000` ms; the
  non-success/skip path `1200` ms → `2000` ms (so both hold the revealed staff
  the same ~2s).
- `startIdDegreesForCard` completion: `700` ms → `2000` ms.

### 6. Intro reference chord = fixed ~2s
The intro chord uses `preludeBars: 1` (one bar, tempo-scaled). Make it a fixed ~2s:
- `_phraseChordOpts` returns `{ tones, octaveOffset: -1, volume: 0.6, preludeSec: 2.0 }`
  instead of `preludeBars: 1`.
- `playPhrase` accepts `opts.chord.preludeSec` (fixed seconds) as an alternative to
  `preludeBars`: when present, the chord's `chordDur` and the melody's `preludeSec`
  both use it. `preludeBars` support stays for any other caller.

## Files touched

- `styles.css` — §1 hide rule; §2 centering; §3 `#card-notation` phrase min-height +
  `#phrase-reveal-btn` styling; §4 `#forward-btn.ready` accent style.
- `index.html` — §3 `#phrase-reveal-btn` markup below `#card-notation`.
- `phrases.js` — §3 reveal toggle (show/hide) + render-time button visibility;
  §4 forward-ready highlight on correct; §5 hold delays; §6 `_phraseChordOpts`.
- `phrase-play.js` — §6 `preludeSec` support in `playPhrase`.
- `src/card.js` — phrase branch: show/init the reveal button per interaction; the
  tap handler no longer reveals.
- `src/deck.js` — `cardIsSolved` treats aural-free/sing as solved-on-view; the
  forward `ready` class is cleared on `renderCard`/`updateNavButtons`.

## Edge cases
- **Back-navigation to a revealed aural-free card:** show the staff + `Hide` label
  (state from `card.revealed`).
- **Switching interaction mid-session:** the reveal button shows only for aural-free;
  `renderPhraseCard` sets its visibility each render.
- **`ready` highlight cleanup:** cleared when the next card renders so it never
  sticks across cards.

## Verification
No DOM test runner. Verify via `node --check` on changed `.js`, a headless boot
(no console errors; `#phrase-reveal-btn` present; placeholder hidden under
`drill-phrases`), and a manual smoke test for the audio (2s chord), the reveal
toggle with no layout shift, the always-enabled aural-free arrow, and the 2s hold
on a correct in-time / id-degrees answer.

## Out of scope
- Smaller-font (rather than hidden) chord name — superseded by hiding it.
- Any change to non-phrase drills.
