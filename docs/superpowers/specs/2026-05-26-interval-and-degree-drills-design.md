# Interval & Degree Drills — Design

**Date:** 2026-05-26
**Status:** Approved (pending user spec review)

## Summary

Add two new drill types to Rep Trainer alongside the existing chord drill:

1. **Interval drill** — notation-reading focused. Two notes on the grand staff; identify the interval. Audio and interval-label are independent toggles, both off by default.
2. **Degree drill** — ear-training focused. A chord plays once, a tone plays once; identify the tone's scale degree relative to the chord. Mode picker controls which scale degrees are in play.

Both drills are reached via a new top-level drill-type selector on the start screen. They share the existing sound stack (FluidR3/EQ/reverb), BPM, articulation, and range picker.

## Top-level structure

### Drill-type selector

New pill toggle on the start screen alongside Range/BPM/etc.:

```
Drill: [ Chords ] [ Intervals ] [ Degrees ]
```

- Persisted to `rep-trainer-notation` localStorage blob as `drillType: 'chords' | 'intervals' | 'degrees'`.
- Default: `'chords'` (preserves existing behavior for returning users).
- Selecting a drill type swaps the visible settings cluster on the start screen (e.g., chord-quality checkboxes are hidden when Intervals is active; the mode picker appears only for Degrees).

### Shared infrastructure (unchanged)

- Range picker
- BPM display + articulation (block/arp/up/down)
- Sound modal (font, EQ, reverb)
- Session shell: X-to-quit, BPM display, stats line, replay button, settings persistence

### Per-drill UI in session

The in-session shell is identical across drills. Only the card body and answer chips change.

## Drill 1 — Interval drill (notation reading)

### Card generation

1. Pick a random direction (up or down).
2. Pick a random interval from the 11-interval pool:
   - `m2, M2, m3, M3, P4, TT, P5, m6, M6, m7, M7`
3. Pick a random root pitch from the current range, constrained so the second note also fits in range.
4. Compute the second note: root + interval (or root − interval if direction is down).
5. Render both notes on the grand staff (reuses notation.js helpers).

### Toggles (per the spec)

Two independent toggles in the start-screen settings panel for Intervals:

- **Show interval name** (default: off). When on, the interval label (e.g., `m3 ↑`) renders alongside the notation while the card is being answered.
- **Play audio** (default: off). When on, the two notes auto-play sequentially as the card loads (root → target, ~half-bar apart at current BPM).

Toggle combinations:

| Show name | Audio | Result |
|---|---|---|
| Off | Off | Pure notation-reading drill |
| Off | On | Notation + audio, no label (combined reading/ear training) |
| On | Off | Notation + label visible — practice/warm-up mode |
| On | On | Notation + audio + label (sight-singing practice) |

Even with audio off, the existing on-card replay button is repurposed for intervals and plays the two-note sequence on demand. With audio on, the replay button replays the same sequence.

### Answer UI

11 chips in 2 rows:

```
[m2] [M2] [m3] [M3] [P4] [TT]
[P5] [m6] [M6] [m7] [M7]
```

Single-tap submits the answer; correct/wrong chip flash; reveal renders the interval label between the notes; "Next" advances.

### Reveal

- Chip flashes green/red.
- Interval label (e.g., `m3 ↑`) appears between the notes on the staff.
- Stats line updates (`correct/total`).

## Drill 2 — Degree drill (ear training)

### Mode picker

Start-screen multi-select for the 6 supported modes (Locrian excluded — its diatonic triad is diminished, outside the major/minor chord scope):

| Mode | Chord on root | Degrees in pool |
|---|---|---|
| Ionian | major | 1, 2, 3, 4, 5, 6, 7 |
| Lydian | major | 1, 2, 3, #4, 5, 6, 7 |
| Mixolydian | major | 1, 2, 3, 4, 5, 6, b7 |
| Dorian | minor | 1, 2, b3, 4, 5, 6, b7 |
| Phrygian | minor | 1, b2, b3, 4, 5, b6, b7 |
| Aeolian | minor | 1, 2, b3, 4, 5, b6, b7 |

- Persisted as `degreeModes: string[]` in localStorage.
- Default: all 6 enabled.
- At least one must be selected (UI prevents deselecting the last one).

### Card generation

1. Pick a random mode from the enabled set.
2. Pick a random root pitch from the current range.
3. Build the diatonic triad on the root (major for Ionian/Lydian/Mixolydian; minor for Dorian/Phrygian/Aeolian).
4. Pick a random degree from the mode's 7-degree pool (1, 2, 3, etc., with the mode-specific accidentals).
5. Compute the test tone's absolute pitch — placed within one octave above the chord root (so degree 1 = chord root, degree 7 ≈ a 7th above). Test tone is not constrained to the range picker; the range picker only governs the chord root.

### Playback rules (per the spec)

- The chord plays once at card start.
- The test tone plays once, immediately after the chord (short gap).
- The user can replay the chord at any time via the existing on-card replay button (degree-drill replay = chord only, not the chord+tone sequence).
- The test tone **does not** replay — that's the test.

### Answer UI

7 chips in 2 rows. Labels are mode-aware so the spelling matches what the user hears:

```
Ionian:     [1] [2] [3] [4]
            [5] [6] [7]

Lydian:     [1] [2] [3] [#4]
            [5] [6] [7]

Mixolydian: [1] [2] [3] [4]
            [5] [6] [b7]

Dorian:     [1] [2] [b3] [4]
            [5] [6] [b7]

Phrygian:   [1] [b2] [b3] [4]
            [5] [b6] [b7]

Aeolian:    [1] [2] [b3] [4]
            [5] [b6] [b7]
```

### Reveal

- Chip flashes green/red.
- Notation panel reveals the triad + the test tone (separated horizontally), with the degree label above the tone.
- Stats line updates.

## File layout

Two new files, both loaded via classic `<script>` tags in `index.html`:

- `intervals.js` — interval generation, answer chip HTML, reveal logic.
- `degrees.js` — mode-aware degree generation, answer chips, reveal logic.

Modifications to existing files:

- `app.js` — adds `state.drillType`, routes session lifecycle (`startSession`, `nextCard`, `acceptAnswer`, `revealAnswer`) through the appropriate drill module. Settings panel gains drill-type pill + per-drill setting clusters.
- `notation.js` — adds shared rendering helpers:
  - `renderTwoNoteStave(noteA, noteB, label?)` for interval reveals
  - `renderTriadPlusTone(triadPitches, tonePitch, degreeLabel?)` for degree reveals
- `sound.js` — adds `playSequence(pitches, gapMs)` for sequential note playback (used by interval drill audio toggle and degree drill chord+tone sequence).
- `styles.css` — answer-chip styles (reuse existing chip styles where possible), mode-picker styles.
- `index.html` — adds drill-type pill markup, mode picker markup, interval-toggles markup, new script tags.

## Stats & persistence

- In-session stats (`correct/total`, session timer) are identical across drills — same UI line.
- No new persisted high scores. Stats reset at start of each session.

## Out of scope

- Per-drill BPM (uses shared BPM).
- Filtering individual intervals (all 11 are always in play).
- Filtering individual degrees within a mode.
- Practice streaks, spaced repetition.
- Locrian mode for degree drill.
- Audio replay for the test tone in degree drill (intentionally omitted per spec).
- Direction (up/down) as part of the interval-drill answer — it's visually obvious from notation and not a tested skill.
- Chromatic outside-notes in degree drill beyond what each mode contains.

## Implementation order

1. Drill-type selector + state plumbing in `app.js` and start-screen UI.
2. Interval drill (smaller surface area, no mode picker):
   a. `intervals.js` card generation + answer chips
   b. `notation.js` `renderTwoNoteStave` helper
   c. Toggles for show-name and audio
   d. `sound.js` `playSequence` helper
3. Degree drill:
   a. Mode picker UI + persistence
   b. `degrees.js` card generation + mode-aware answer chips
   c. `notation.js` `renderTriadPlusTone` helper
   d. Chord+tone playback wiring
4. Polish: chip flash feedback, reveal labels, mobile layout pass.
