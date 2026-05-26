# Notation Mode — Scoping Document v3 (Final)

**Status:** Approved and build-ready
**Phase:** Add-on to Triad Trainer v6

---

## 1. Confirmed decisions

- **Library:** VexFlow.
- **Accidental modes:** Key signature (Mode A) for major/minor triads; Accidentals on notation (combined Mode B/C) for everything else and as the default.
- **Voicing:** session-wide setting — Closed / Open / Mixed.
- **Open voicings:** convention-following, deterministic per inversion. See §3.
- **Block chords vs arpeggios:** session-wide setting — Block / Arpeggio / Mixed.
- **Arpeggio direction:** session-wide setting — Up / Down / Mixed (each card monotonic).
- **Beaming:** beam ascending and descending arpeggios (see §4).
- **Hand bias:** Right hand (treble) / Left hand (bass) / Both hands (grand staff).
- **Both Hands behavior:** see §5.
- **Range:** user-configurable lowest and highest pitch.
- **Name disclosure:** three options (Off / After delay / Tap to reveal). See §7.
- **Unconventional spellings toggle:** off by default.
- **Chord label style:** Plain English / Slash / Figured bass. Plain default.
- **Existing text format:** retained as Format = Text option.

---

## 2. Triad voicings — closed position

### 2.1 Pitch construction (theoretically correct)

For a card `{ spelling, quality, inversion }`:

1. Compute root note from the spelling.
2. Compute the third using interval logic (major third or minor third based on quality).
3. Compute the fifth using interval logic (perfect, diminished, or augmented).
4. Apply inversion: rotate which note is bottommost.
5. Stack the remaining notes in ascending pitch order above the bottom note, **within one octave** (closed voicing).

This yields theoretically correct spellings, including C♭, F♭, B♯, E♯, double-sharps, double-flats. These may be substituted with enharmonic naturals depending on the unconventional-spellings toggle (§8).

### 2.2 Octave placement and range

Closed voicings always span ≤ an octave (root pos = 5th, 1st inv = 6th, 2nd inv = 4th). The chord is placed in the lowest octave that fits within the user's range. If no octave fits, the card is skipped silently.

**Default ranges** (user-overridable):

- Right hand: C4 to A5 (one ledger below to one ledger above treble)
- Left hand: E2 to C4 (one ledger below to one ledger above bass)
- Both hands: E2 to A5

---

## 3. Open voicings

Open voicings spread the chord across more than an octave. This is a separate session-wide voicing mode.

### 3.1 Default open voicing: 1-5 / 3 ("Spread 3")

- **Left hand (bass clef):** root and fifth, played as a perfect-fifth interval (or fourth in 2nd inversion).
- **Right hand (treble clef):** third only, single note.

This is the classic "open chord voicing" used in beginner-to-intermediate piano instruction. Three notes total, distributed across both staves.

**Inversion behavior:**
| Inversion | Bass clef | Treble clef |
|---|---|---|
| Root | Root + 5th (perfect 5th) | 3rd |
| 1st | 3rd + Root (sixth) | 5th |
| 2nd | 5th + 3rd (sixth) | Root |

The bass clef always shows two notes (the inversion's bottom chord tone + the next chord tone above). The treble clef shows the remaining single chord tone.

### 3.2 Open voicing only meaningful in Both Hands mode

If hand bias is set to **Right hand** or **Left hand only**, the **Voicing setting is forced to Closed** (Open is greyed out). Open voicings require both staves to make sense.

### 3.3 Future open voicing options (out of scope for v1)

- **Spread 4:** root + fifth in bass, third + root-octave-up in treble (full two-handed voicing, 4 notes).
- **Drop-2:** classical jazz piano voicing where the second-from-top closed-voiced note drops an octave.
- **Truly randomized open voicings per card** (different spread variant each card).

These are real techniques but add complexity and variation that hurts predictability. Add after v1 ships and the basic version is validated.

### 3.4 Open + Block chord vs Open + Arpeggio

- **Open + Block:** all notes sound simultaneously, stacked on their respective staves. Both clefs show whole notes.
- **Open + Arpeggio:** the chord is arpeggiated in pitch order across the two staves. See §4.4 for cross-staff beaming behavior.

---

## 4. Block chords vs arpeggios + beaming

### 4.1 Block chords

- Whole notes, no stems, no flags.
- Closed voicing: single staff, three stacked notes.
- Open voicing: bass staff shows the bass interval (two stacked notes), treble staff shows the treble note(s).

### 4.2 Arpeggio direction (closed voicing)

Three eighth notes in pitch order:

- **Up:** lowest pitch → highest pitch.
- **Down:** highest pitch → lowest pitch.
- **Mixed:** each card randomly picks Up or Down (still monotonic within the card).

### 4.3 Beaming rule for v1

**Beam monotonic arpeggios.** Three eighth notes ascending or descending are beamed together with a single beam.

Rationale: ascending and descending three-eighth-note runs are conventionally beamed in modern engraving. The beam reinforces the direction visually. Since all our arpeggios are monotonic in v1, **all arpeggios get beamed**.

VexFlow implementation: `VF.Beam.generateBeams(notes)` after creating the eighth notes.

### 4.4 Open voicing + arpeggio: cross-staff complication

In Open voicing mode, an arpeggio spans both staves. Real notation handles this with **cross-staff beaming**, where the beam visually crosses between the bass and treble staves. This is technically supported in VexFlow but adds rendering complexity.

**v1 decision:** when voicing is Open AND format is Arpeggio, **do not beam** (use flags). The visual flow across staves is still clear without the beam.

This is the one exception to the "always beam" rule.

### 4.5 Stem direction

VexFlow's `auto_stem` handles this: stems-up for notes below the middle line, stems-down for notes above. Within an arpeggio, individual stems may go different directions. This is conventional.

---

## 5. Hand bias and grand staff

### 5.1 The hand-bias setting

| Setting                      | Behavior                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| **Right hand (treble)**      | Single treble staff. Closed voicing only.                                    |
| **Left hand (bass)**         | Single bass staff. Closed voicing only.                                      |
| **Both hands (grand staff)** | Grand staff (two staves with brace). Behavior depends on voicing — see §5.2. |

### 5.2 Both hands mode behavior

In Both Hands mode with **Closed voicing**:

- Each card randomly picks which clef the chord appears on.
- The other clef shows a **whole rest** (centered on the staff).
- Optional setting: "Double root in bass" — when on, if the chord is in treble, the bass shows the root note (one octave below the chord's root) as a whole note. When the chord is in bass, the treble shows a whole rest.

In Both Hands mode with **Open voicing**:

- Chord is distributed: bass interval in bass clef, treble note in treble clef.
- No random clef selection — the voicing dictates the layout.
- The "double root in bass" setting is meaningless here (the bass already has two notes) and is hidden.

In Both Hands mode with **Mixed voicing**:

- Each card randomly picks Closed or Open. Behavior follows the chosen voicing for that card.

### 5.3 What's in the empty staff (closed voicing only)

A whole rest, centered on the staff. This is the convention for piano music where only one hand plays.

---

## 6. Mode A (key signatures)

When **Mode A** is selected and the triad is major or minor:

- The parent key signature is drawn at the start of the staff.
- Noteheads have no accidentals (they're implied).
- Examples:
  - C major → no key sig
  - G major → 1 sharp (F♯)
  - B major → 5 sharps
  - A♭ major → 4 flats
  - A minor → no key sig (natural minor of relative)
  - C minor → 3 flats (natural minor)
  - F♯ minor → 3 sharps

For minor triads, we use the **natural minor** key signature (not melodic or harmonic minor).

When the triad is **diminished or augmented**, Mode A falls back to Mode B behavior:

- No key signature drawn (or, alternatively: the most-likely parent key sig is shown, with explicit accidentals on the altered tones — this is also conventional).

**v1 simplification:** for diminished and augmented, **always use no key signature and put accidentals on notes**, regardless of Mode A vs Mode B. Avoids the rabbit hole of "which parent key signature is closest."

In **Both Hands grand staff mode**, both staves share the same key signature.

---

## 7. Name disclosure — three modes

A setting: **"Show chord name"** with four values:

- **Off:** Never show the name. Notation only.
- **After delay:** Notation shown first; name appears at the halfway point of the card.
- **Tap to reveal:** Notation shown first; tapping the card reveals the name.
- **Always:** Name visible alongside the notation from the start.

### 7.1 After-delay behavior (dynamic halfway point)

The reveal happens at **half the card's duration**:

- Seconds advance: card duration 6s → name appears at 3s.
- Beats advance: card duration 8 beats → name appears at beat 4.
- Bars advance: card duration 2 bars → name appears at bar 1.

For odd-numbered durations, round down (5 beats → reveal at beat 2).

**Manual advance + After delay:** the "After delay" option is **greyed out** when advance mode is manual. There's no card duration to halve. Users in manual mode pick from Off / Tap to reveal / Always.

If the user switches from a time-mode to manual while "After delay" is selected, the setting auto-falls-back to **Tap to reveal** with a small notice: _"After delay isn't available in manual mode. Switched to Tap to reveal."_

### 7.2 Tap-to-reveal behavior

In **manual advance mode**: this is the natural two-tap interaction.

- First tap: reveal the name.
- Second tap: advance to the next card.

In **time-mode advance**: tap-to-reveal still works — the user can tap anytime to see the name, and the card still auto-advances on its own clock. If the user doesn't tap, the name never appears for that card. (Pedagogically interesting: the user gets to choose whether to "test" themselves or not.)

### 7.3 Chord label styles

When the name is revealed, it appears in one of three styles (separate setting):

| Style                       | Example: A♭ major, 1st inv | Example: C dim, 2nd inv     |
| --------------------------- | -------------------------- | --------------------------- |
| **Plain English** (default) | A♭ major, 1st inversion    | C diminished, 2nd inversion |
| **Slash chord**             | A♭/C                       | C°/G♭                       |
| **Figured bass**            | A♭⁶                        | C°⁶⁄₄                       |

---

## 8. Unconventional spellings toggle

**Default: off.**

### 8.1 When off

The following enharmonic substitutions are applied on the staff (chord name remains correct):

- C♭ → B
- F♭ → E
- B♯ → C
- E♯ → F
- Double-sharps → enharmonic natural
- Double-flats → enharmonic natural

### 8.2 When on

All theoretically correct spellings are rendered, including the uncommon ones.

### 8.3 Pedagogical note

Off-by-default is "training wheels mode" — easier to read but technically wrong in places. Recommended for users learning to read accidentals. Turn on when comfortable.

---

## 9. Range setting

Two dropdowns:

```
Lowest pitch    [  G2  ▾ ]
Highest pitch   [  A5  ▾ ]
```

Each lists pitches from C2 to C6 with descriptive labels (e.g., "G2 / bottom of bass staff", "C4 / middle C").

**Defaults** vary by hand-bias setting (see §2.2).

**Validation:** if the user sets a range with no compatible chords in the current deck, show: _"No chords fit your selected range. Widen the range or change your chord selection."_

---

## 10. Card duration / advance behavior

**Unchanged.** Notation does not affect how cards advance — manual / seconds / beats / bars all work identically.

Notation is in free time. Note durations on the staff (whole, eighth) are visual conventions only and are not synced to the metronome.

---

## 11. Difficulty slider (preset selector)

A single 5-position slider that simultaneously configures multiple settings to a coherent difficulty preset. Acts as a shortcut for users who want to ramp up gradually without touching individual toggles.

### 11.1 Behavior

- **Slider sets values; user can override.** Moving the slider applies all preset values for that level. After applying, every individual setting remains editable.
- **Editing any controlled setting** moves the slider indicator to a "Custom" state. The slider positions remain tappable to return to a level.
- **First slider movement per session** prompts a confirmation: _"This will replace your current chord selection. Continue?"_ No prompt on subsequent moves in the same session.
- **Slider state persists** to localStorage along with everything else.

### 11.2 What the slider controls

Settings touched by the slider:

1. Roots (chord selection)
2. Qualities (chord selection)
3. Inversions (chord selection)
4. Voicing (Closed / Open / Mixed)
5. Block/Arpeggio (Block / Arpeggio / Mixed)
6. Hand (Right / Left / Both)
7. Accidentals (Key signature / On notation)
8. Range (lowest + highest pitch)
9. Show chord name (Off / After delay / Tap to reveal / Always)
10. Unconventional spellings (off / on)

Settings **not** touched (preserved across slider changes):

- Focus items
- Metronome (BPM, time signature, accent)
- Advance mode (manual / seconds / beats / bars)
- Label style (Plain / Slash / Figured bass)
- Format (Text / Notation / Both)

Rationale: the slider controls _difficulty_, not _practice preferences_. How you advance, how you label, and what you focus on are personal — the slider shouldn't override them.

### 11.3 Preset definitions

| Setting        | L1 Beginner   | L2 Easy               | L3 Intermediate            | L4 Advanced   | L5 Expert   |
| -------------- | ------------- | --------------------- | -------------------------- | ------------- | ----------- |
| Roots          | 7 naturals    | 9 (naturals + C♯, F♯) | 10 (naturals + all sharps) | All 15        | All 15      |
| Qualities      | maj           | maj, min              | maj, min, dim              | All 4         | All 4       |
| Inversions     | root          | root, 1st             | All 3                      | All 3         | All 3       |
| Voicing        | Closed        | Closed                | Closed                     | Closed        | Mixed       |
| Block/Arpeggio | Block         | Block                 | Block                      | Arpeggio      | Mixed       |
| Hand           | Right         | Right                 | Right                      | Both          | Both        |
| Accidentals    | Key sig       | Key sig               | On notation                | On notation   | On notation |
| Range          | C4–G5 (tight) | C4–A5 (standard)      | C4–A5                      | E2–C6 (wide)  | E2–C6 (max) |
| Show name      | Always        | Always                | Tap to reveal              | Tap to reveal | Off         |
| Unconventional | Off           | Off                   | Off                        | Off           | On          |

### 11.4 UI

The slider lives at the top of the Display settings section, above the individual controls:

```
DISPLAY
┌──────────────────────────────────────────────────┐
│ DIFFICULTY                                       │
│                                                  │
│  ●──────○──────○──────○──────○                   │
│  1      2      3      4      5                   │
│  Beginner               Expert                   │
│                                                  │
│  ▸ Applied rules                                 │
│  • 7 natural roots                               │
│  • Major triads, root position only              │
│  • Treble clef, closed block chords              │
│  • Key signature mode                            │
│  • Name always shown                             │
└──────────────────────────────────────────────────┘
```

The "Applied rules" section is collapsible (default open) and updates dynamically as the slider moves. Each rule is a one-line plain-English summary of the corresponding setting.

When the user edits any controlled setting individually, the slider position indicator changes to a "Custom" marker (no level highlighted) and the applied-rules section is replaced with: _"Custom configuration. Tap a level to reset."_

### 11.5 Why 5 levels, not 3 or 10

- 3 is too coarse — the jump from "Easy" to "Hard" skips too many meaningful intermediate states.
- 10 is too fine — discrete underlying settings can't support 10 distinct gradients without arbitrary distinctions ("level 6 has 11 roots, level 7 has 12 roots" — meaningless).
- 5 gives clear pedagogical milestones: complete beginner, comfortable with naturals, comfortable with accidentals, ready for both hands, ready for full mixed mode.

### 11.6 Why this is a _display_ setting and not its own section

The slider only controls settings that already exist (in Chord selection and Display). It's not introducing new behavior — it's a shortcut. Placing it at the top of Display keeps it discoverable without giving it disproportionate weight. (Reasonable alternative: put it in its own small section above everything. I lean against this because it would imply the slider is a separate mode, when it's actually just a preset selector.)

---

## 12. Final UI shape

A new collapsible section in the Settings panel:

```
DISPLAY
┌──────────────────────────────────────────────────────┐
│ Format               [ Notation ▾ ]                  │  Text / Notation / Both
│ Hand                 [ Right (treble) ▾ ]            │  R / L / Both
│ Voicing              [ Closed ▾ ]                    │  Closed / Open / Mixed
│   (Open and Mixed greyed out unless Hand = Both)    │
│ Double root in bass  [ Off ]                         │  switch (Both + Closed only)
│ Format               [ Block chords ▾ ]              │  Block / Arpeggio / Mixed
│ Arpeggio direction   [ Up ▾ ]                        │  Up / Down / Mixed
│ Accidentals          [ On notation ▾ ]               │  Key sig / On notation
│ Range — lowest       [ C4 ▾ ]                        │
│ Range — highest      [ A5 ▾ ]                        │
│ Show chord name      [ Tap to reveal ▾ ]             │  Off / After delay / Tap / Always
│   (After delay greyed out when advance = manual)    │
│ Label style          [ Plain English ▾ ]             │  Plain / Slash / Figured bass
│ Unconventional spellings [ Off ]                     │  switch
└──────────────────────────────────────────────────────┘
```

**Defaults:**

- Format: **Notation**
- Hand: **Right (treble)**
- Voicing: **Closed**
- Block/Arpeggio: **Block chords**
- Arpeggio direction: **Up**
- Accidentals: **On notation**
- Range: **C4 to A5**
- Show name: **Tap to reveal**
- Label style: **Plain English**
- Unconventional: **Off**

---

## 12. Implementation plan

### Phase 1 — Core notation infrastructure

1. Load VexFlow from CDN.
2. Build `computeChordPitches(spelling, quality, inversion)` — theoretically correct scientific-pitch notation.
3. Build `placeChordInRange(pitches, range, clef)` — find right octave or null.
4. Build `renderNotation(card, settings)` — main dispatcher.
5. Implement block chord rendering (closed voicing, single clef).
6. Implement Mode B (accidentals on notes) — VexFlow handles natively.

### Phase 2 — Arpeggios and beaming

7. Eighth-note rendering for arpeggios.
8. Beaming for monotonic arpeggios (closed voicing).
9. Arpeggio direction logic (Up / Down / Mixed).

### Phase 3 — Key signatures

10. Mode A: key signature lookup per root + quality (major/minor).
11. Fallback to Mode B for dim/aug.

### Phase 4 — Grand staff and clef bias

12. Grand staff rendering with brace and shared key sig.
13. Hand-bias: random clef per card in Both Hands + Closed mode.
14. Whole rest in empty staff.
15. Double root in bass option.

### Phase 5 — Open voicings

16. Open voicing pitch distribution (1-5 in bass, 3 in treble).
17. Inversion handling for open voicings.
18. Open + Block rendering.
19. Open + Arpeggio rendering (no beams when crossing staves).

### Phase 6 — Spelling substitution and labels

20. Unconventional spelling substitution.
21. Chord label rendering in three styles.

### Phase 7 — Disclosure and integration

22. Tap-to-reveal interaction in manual + time modes.
23. After-delay timer in both manual and time modes.
24. Display settings UI section.
25. Persistence to localStorage.
26. Format = Text / Notation / Both dispatcher in flashcard renderer.

### Phase 8 — Difficulty slider

27. Define the 5-level preset table as a data structure.
28. Build the slider UI component (5 discrete positions + Custom indicator).
29. Apply-preset logic with first-time confirmation.
30. Snap-to-Custom logic when individual settings are edited.
31. Applied-rules summary rendering.
32. Persist slider state alongside other settings.

**Estimated effort:** 4-5 days of focused build time, plus ~half a day for the slider.

---

## 13. Out of scope for v1

- Drop-2, drop-3, and other jazz voicings beyond the 1-5/3 open voicing
- Up-and-down arpeggios (R-3-5-3) — would introduce beam grouping
- Random open voicing variants per card
- Cross-staff beaming
- Audio playback of notation
- Time signatures, tempo markings
- MIDI input verification
- Alto/Tenor clefs
- Notation export (PNG/PDF)
- 7th chords and extensions (this app is for triads only)

---

## 14. Decisions log

All open questions resolved. Recording the final answers for reference during build:

1. **Open voicing default:** Spread 3 (bass 1-5, treble 3). Three notes total.
2. **Mode A fallback for diminished/augmented:** no key signature, accidentals on notes. Don't try to guess parent key.
3. **Reveal delay:** dynamic — half the card duration. "After delay" is greyed out in manual advance mode (no clock to halve). If user switches advance to manual while "After delay" is selected, auto-fall-back to Tap to reveal with a small notice.
4. **Slider model:** preset selector — sets values, user can override. Editing kicks slider into Custom state.
5. **Slider exclusions:** focus items, metronome, advance mode, label style, format (text/notation/both). Slider does not touch these.
6. **5 levels with presets in §11.3** approved as-is. May rebalance after user testing if L3→L4 or L4→L5 jumps feel too steep.

---

## 15. Build-ready

This spec is approved and ready for implementation. Proceed in phase order from §13.
