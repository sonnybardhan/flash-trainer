# Phrase Drill — Design

A new drill type alongside Chords / Intervals / Degrees that plays a short
melodic phrase generated from the user's selected key / chord / scale. The
user can then echo it back on MIDI, sing it, or identify the degrees.

The phrase generator is ported from the adjacent **Creative Ear Trainer**
(CET) Swift project, but with one key adaptation: where CET ships hand-
curated `PitchContext` lessons, this app **derives** the context from the
user's existing degree-drill selections (key, chord quality, scale). The
derivation rules below preserve the musical intent of CET's hand-curated
lessons without requiring per-lesson curation.

## Inputs (what the user picks)

Reused from the existing degree drill UI:

| Input              | Source                  | Values                                  |
| ------------------ | ----------------------- | --------------------------------------- |
| Key                | `degreeKey`             | One of the 15 root spellings            |
| Chord quality      | `degreeChordQuality`    | `major` / `minor`                       |
| Scale              | `degreeScaleMode`       | Ionian / Dorian / … / Chromatic / Custom |
| Selected degrees   | `degreeScaleDegrees`    | Subset of 12 chromatic degrees          |

New inputs added for phrase drill:

| Input              | Default       | Notes                                              |
| ------------------ | ------------- | -------------------------------------------------- |
| Bars per phrase    | 1             | 1, 2, or 4                                         |
| Interaction mode   | "Aural recall (free)" | "Aural recall (free)" / "Aural recall (in time)" / "Sing back" / "ID degrees" |
| Allowed durations  | quarter + half + eighth-pair + eighth-triplet + quarter-triplet | See §Rhythm. |
| Rests              | On (12% target) | Use CET's default `RestPolicy.standard`.           |
| In-time tolerance  | ±200 ms       | Slot window for in-time recall, matches CET default. |

## Derived `PitchContext`

The phrase generator (ported from CET) needs four things per session:

1. **available** — the pitch alphabet, low-to-high, used as the sampling
   pool.
2. **chordTones** — pitches the generator strongly prefers on strong
   metric positions, and the only pitches allowed at phrase end.
3. **avoidNotes** — pitches that must resolve down by step and may not
   be sustained beyond an eighth.
4. **resolvesTo** — for each non-chord-tone pitch, the set of chord
   tones it wants to resolve to (validator enforces this on strong
   beats).

We derive all four from the user's selections:

### 1. `available` (pitch alphabet)

Take the user's `degreeScaleDegrees` (a subset of the 12 chromatic
degrees, e.g. `['1','2','3','4','5','6','7']` for Ionian). Convert each
degree to its semitone offset from the root (using the existing
`DEGREE_DEFS` map), and sort low-to-high.

If `includesUpperTonic` is enabled (default true), append degree 1 a
second time at octave + 1 so the generator can resolve `1 → 8`.

### 2. `chordTones`

Always: root + third + fifth of the chord (1, 3, 5 for major; 1, b3, 5
for minor). Computed from `degreeKey` + `degreeChordQuality` via the
existing `chordTones()` helper in `notation.js`.

**Optional extension** (future): if the user selects a "7" / "b7" in
the degree set, add it to chord tones (major-7th for major, b7 for
minor) so the phrase generator treats 7ths as landing notes. Out of
scope for v1.

### 3. `avoidNotes` — derived rule

CET hand-curates these. We derive them with one rule:

> A scale degree is an "avoid note" if it sits **exactly one semitone
> above a chord tone**.

Why: that's the canonical avoid-note rule from jazz pedagogy — the half
step above a chord tone clashes audibly when sustained (the classic
"4 over the major chord" case: F is a m2 above E).

Examples this rule produces vs. CET's hand-curated lessons:

| Context                  | Hand-curated avoid | Derived avoid | Match? |
| ------------------------ | ------------------ | ------------- | ------ |
| C major + Ionian         | `[F]`              | `[F]` (m2 above E) | ✓  |
| C major + first 4 (C–F)  | `[F]`              | `[F]`         | ✓      |
| C major pentatonic       | `[]`               | `[]` (no scale degree is a m2 above a chord tone) | ✓ |
| C minor pentatonic       | `[]`               | `[]`          | ✓      |
| C major triad pool       | `[]`               | `[]`          | ✓      |
| C dominant 7 pool        | `[]`               | `[]` (Bb→C is M2, not m2) | ✓ |
| C major 7 pool           | `[]`               | `[]` (B→C is m2 but B IS a chord tone) | ✓ |

The rule matches every hand-curated lesson in CET's library.

### 4. `resolvesTo` — derived rule

CET hand-curates these per non-chord-tone. We derive them with the
following tiered rule, applied in order until one tier yields targets:

1. **Half-step to an in-octave chord tone** (strongest resolution).
   Example: F → E in C major.
2. **Half-step up to the upper tonic** (leading-tone case). Only
   triggers when `includesUpperTonic` is true and the note is exactly
   one semitone below the tonic. Example: B → C in C major.
3. **Whole-step to an in-octave chord tone.** Example: D → {C, E}.
4. **Single nearest in-octave chord tone**, regardless of distance.
   Example: b7 → 5 in C minor pentatonic (Bb is 3 semitones above G).

The upper tonic is **only** considered for tier 2 (leading tone) — it
isn't a general-purpose "+12 chord tone" candidate. This matters for
b7 in minor pentatonic: without the restriction, Bb → C (M2 up to
upper tonic) would beat Bb → G (m3 down to in-octave 5), which is
the actual jazz pedagogy resolution.

Examples:

| Pitch | Available pool          | Chord tones | Derived resolvesTo |
| ----- | ----------------------- | ----------- | ------------------ |
| D     | C-D-E-F-G-A-B           | C, E, G     | `{C, E}` (both ±1 step) |
| F     | C-D-E-F-G-A-B           | C, E, G     | `{E}` (F→G is M2 but F→E is m2 — prefer the m2) |
| A     | C-D-E-F-G-A-B           | C, E, G     | `{G}` (G is closer) — but CET says `{G, B}`. **See note.** |
| B     | C-D-E-F-G-A-B           | C, E, G     | `{C}` (m2 up, the leading-tone resolution) |

**Note on A → {G, B} in CET vs derived {G}:** CET's hand-curated entry
treats B as a "neighbour" target even though B isn't a chord tone of
the C-major lesson — it's the upper neighbour with a "tendency" toward
C. Our derived rule only resolves to **chord tones**, which is stricter
and a slight quality loss. Acceptable for v1; can be revisited if
phrases feel boxed in.

Refinement (optional, post-v1): if the nearest chord tone is more than
a M2 away, also include any non-chord-tone within m2 that itself
resolves to a chord tone (transitive resolution).

## Rhythm

Port CET's `RhythmComposer` with this `BeatGroup` set:

- `quarter` (1 beat) — cadential
- `half` (2 beats) — cadential
- `eighthPair` (2 × ½-beat, 1 beat) — non-cadential
- `tripletEighths` (3 × ⅓-beat, 1 beat) — non-cadential, tuplet-bracketed
- `tripletQuarters` (3 × ⅔-beat, **2 beats**) — non-cadential, spans two beats

Skip sixteenth-runs in v1.

`tripletQuarters` is the one extension over CET — three quarter-note
heads beamed under a single "3" bracket, spanning two beats. The
composer's bar-cadence invariant becomes: any group ending the bar
must be cadential (quarter or half). Quarter-triplets aren't
cadential, so they can never sit at the end of the bar.

The composer's invariant ("the bar ends with a cadential group") is
preserved unchanged. Final-note validation still requires ≥ quarter
duration.

VexFlow tuplet rendering — both eighth-triplets and quarter-triplets
use `new VF.Tuplet([notes], { num_notes: 3, notes_occupied: 2 })` for
quarters and `notes_occupied: 2` for eighths within one beat. Existing
chord/interval drills don't use tuplets, so this is new rendering
territory; will validate with a focused test page during build.

## Phrase length

User picks 1, 2, or 4 bars. CET only ships 1 and 2; we extend to 4
since the user asked for it. The generator's logic is bar-count
agnostic — `bars: 4` just means a longer rhythm sequence. The "bar 2
beat 1 must sound" rule generalizes to "the first beat of every bar
after bar 1 must sound" to keep multi-bar phrases anchored.

## Generation flow (per card)

1. Build derived `PitchContext` from current degree-drill settings.
2. Compose a `RhythmTemplate` from allowed durations spanning `bars × 4`
   beats.
3. Sample pitches per slot using CET's weighting (chord tones 8× on
   strong beats, 3× on weak, avoid notes 0.1× / 1.5×; near-veto on
   exact repeats; +50% bias for stepwise motion).
4. Insert rests up to the target silence fraction (12% default).
5. Validate. Retry up to 200 times on failure (CET's default).
6. Resolve to MIDI notes — anchor on the chosen root octave (use the
   degree drill's existing auto-range root selection so the phrase
   sits in a comfortable register).

## Interaction modes

Four modes, picked at session start (switching mid-session not
supported in v1).

### Aural recall — free time

1. Phrase plays through.
2. User plays the notes back in **the right order** via MIDI keyboard
   or the on-screen keyboard (see §On-screen keyboard).
3. Octave-equivalent matching: any octave of the correct pitch class
   counts, as long as the **sequence** is right.
4. Wrong pitch flashes red on the staff, doesn't reset. Correct
   sequence advances.
5. Rests in the source phrase are skipped — we only validate sounding
   notes.

### Aural recall — in time

1. Phrase plays through once (the "demo").
2. Brief count-in (1 bar at session BPM), then the phrase's "echo
   window" opens — the user has `bars × 4` beats to play it back.
3. Each sounding note in the phrase has an **expected onset** (seconds
   from echo-window start) and an expected pitch.
4. Every MIDI / on-screen press is mapped to the nearest slot whose
   onset is within ±200 ms of the press time (CET's default, ported
   from `QuantizingSlotTracker`).
5. Match logic per slot:
   - **Right pitch + in window** → slot captured (green).
   - **Wrong pitch + in window** → slot stays open (flashed red,
     does not block subsequent slots).
   - **Press outside any window** → ignored entirely.
6. Octave matching: octave-equivalent by default (toggleable via the
   existing "Ignore octaves (MIDI)" setting).
7. End of echo window: card auto-evaluates and **loops** — see below.
8. Tempo: session BPM. Metronome ticks during the echo window so the
   user has a reference.

#### Looping (in-time mode)

Ported from CET's `inTimeLoopTracker` flow:

- When the echo window closes, the loop auto-restarts: the demo plays
  again, then a new echo window opens.
- **Results persist across iterations.** Slots captured correctly in
  iteration 1 stay green in iteration 2; the user is effectively only
  filling in the remaining gaps. (Implementation: each card holds a
  `Map<slotId, result>` that merges new results in, with a correct
  press overwriting a prior incorrect one.)
- Wrong / missed slots from prior iterations are visible (red) so the
  user knows what's still pending.
- Auto-advance triggers when **every slot is correctly captured**.
- Manual advance: tap the flashcard to skip to the next phrase at any
  point during a loop iteration. Wrong/missed slots count as misses
  for the session.
- Cap: 6 iterations max. If still incomplete, auto-advance with a
  toast ("Skipped — couldn't capture all slots"). Mirrors CET's
  safety bound.

### Sing back

1. Phrase plays through.
2. Pause (silent) for `bars × 4` beats so user sings the response.
3. Phrase plays again as the "answer."
4. Self-evaluated — tap to advance. No validation.

### Identify degrees

1. Phrase plays through.
2. User taps degree chips in the order heard (same chips as the
   degree drill).
3. Wrong chip flashes red. Correct sequence advances.

## On-screen keyboard

A simple piano keyboard docked to the bottom of the flashcard view
during aural-recall sessions. v1 scope:

- 2-octave range, centered on the resolved phrase's root C
- White + black keys; tap to "play" a note (triggers same audio path
  as MIDI input + feeds the matcher)
- No velocity (uses a fixed mid-velocity)
- No sustain pedal
- Hidden when MIDI device is connected? **Open question** — leaning
  toward "always shown" so users can mix mouse/MIDI freely. Default:
  always shown.

## UI changes

### New tab in Drill segment

`Chords | Intervals | Degrees | Phrases`

### Phrase config section (degree drill's section, expanded)

Reuses Key / Chord / Scale / Degrees from the degree drill. Adds:

- **Bars per phrase** — segment control: 1 / 2 / 4
- **Interaction** — segment control: Echo / Sing / ID degrees
- **Rhythm** (collapsed, advanced): quarter / half / eighth toggles
  (all on by default).

### Flashcard view

- Triad plays once at session start (same as degree drill).
- Each card plays the phrase audio. After playback, the interaction
  mode determines the answer UI.
- Reveal (after correct or on tap): render the phrase as notation
  using VexFlow (existing infrastructure handles this with minor
  adaptations for eighth-pair beams).

## Files to add / change

New JS modules (mirroring CET's separation):

- `phrase-gen.js` — RhythmComposer + PhraseGenerator + Validator
- `phrase-context.js` — derives PitchContext from degree-drill settings
- `phrase-play.js` — audio playback of a resolved phrase
- `phrase-render.js` — VexFlow rendering of a phrase (incl. tuplets)
- `phrase-match.js` — pitch-sequence and slot-window matchers (mirrors
  CET's `PhraseTracker` for free time and `QuantizingSlotTracker` for
  in time)
- `keyboard.js` — on-screen keyboard widget
- `phrases.js` — card lifecycle (mirrors `degrees.js`)

Touched files:

- `index.html` — new drill segment, new phrase config section, keyboard dock
- `app.js` — drill type routing, session anchor for phrases
- `midi.js` — register phrase matcher as another matcher mode source
- `notation.js` — tuplet helpers
- `sound.js` — phrase playback helper if `playSequence` isn't enough

## Out of scope (v1)

- Sixteenth-runs
- Chord-tone extensions for 7ths (drilled but not used as resolution targets)
- Score / mastery tracking
- Phrase library / corpus building — generation is just-in-time. We
  have the logic; no need to pre-curate. (Seeding the RNG kept around
  internally for tests but not exposed in the UI.)
- Hide on-screen keyboard when MIDI is connected — v1 always shows
- Looping in free-time mode — free time has no time limit, so the user
  just plays at their own pace until done; they can tap a Replay
  button to re-hear the demo as many times as needed

---

## Resolved decisions

| Question | Decision |
| --- | --- |
| Echo timing strictness | Two modes: **free time** (sequence only) and **in time** (±200 ms slot window per CET). |
| In-time looping | Phrase loops automatically after each echo window; results persist across iterations (matches CET's `inTimeLoopTracker`); auto-advance on clean run; 6-iteration cap. |
| Phrase library | Not needed — generation logic suffices. RNG seedable internally for tests but not user-facing. |
| ID-degrees flow | Full phrase plays once, user enters the full sequence in order. |
| On-screen keyboard | Docked at the bottom during aural-recall sessions. Basic — 2 octaves centered on root, tap-to-play, no velocity / sustain. |

---

## Implementation plan

Each stage is independently runnable / verifiable, so we can sanity-check
output as we go.

1. **`phrase-gen.js`** — port RhythmComposer + PhraseGenerator + Validator
   with q/h/eighth-pair + eighth-triplet + quarter-triplet. Test page
   shows 20 generated phrases as compact text.
2. **`phrase-context.js`** — implement derivation rules + checks against
   CET's hand-curated lessons.
3. **`phrase-render.js`** — VexFlow render incl. tuplets. Test page
   renders phrases from step 1.
4. **`phrase-play.js` + `sound.js` tweaks** — schedule playback. Listen
   to phrases from steps 1–3.
5. **New "Phrases" drill tab + config UI** — wire into the app shell, no
   interaction yet (plays + reveals on tap).
6. **`phrase-match.js` + free-time aural recall** — sequence matcher,
   MIDI + on-screen keyboard input.
7. **In-time aural recall** — port slot tracker, scheduling, evaluation,
   and **looping** (results merge across iterations, advance on clean
   or 6-iter cap).
8. **Sing-back mode** — playback + pause + replay loop.
9. **ID-degrees mode** — chip entry sequence matcher.
10. **On-screen keyboard widget** — basic 2-octave dock.
