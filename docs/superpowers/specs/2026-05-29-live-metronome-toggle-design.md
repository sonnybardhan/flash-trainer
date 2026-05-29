# Live metronome toggle in the session header

**Date:** 2026-05-29
**Status:** Approved, pending implementation plan

## Goal

Let the user turn the metronome on/off **mid-session** from the in-session
header (`flash-header`), for **all drill types**. Today the `metro-indicator`
only appears when the metronome is already running, and the metronome can only
be enabled before a session starts — so there's no way to toggle it once a
session is underway.

## Approach (A: always-visible indicator + switch in its panel)

Reuse the existing "tap indicator → panel" header pattern (same as the
Session and Advance indicators). No new generator or phrase logic.

### Visibility
- The `#metro-indicator` is shown for the **entire session** (made visible on
  session start, hidden on session end via the `flashcard-view` toggle),
  instead of being shown/hidden by `startMetronome`/`stopMetronome`.
- `startMetronome` / `stopMetronome` toggle an `off` CSS class on the indicator
  (dimmed glyph, no pulse) instead of setting `display`. When off, the
  indicator shows the current BPM in a dimmed state; when on, it pulses.

### Toggle control
- Add a switch `#live-metro-switch` as the **first row** of `#metro-panel`,
  above the existing BPM and Accent rows, labeled "Metronome".
- Flipping it:
  - sets `state.metronome.enabled`,
  - calls `startMetronome()` (on) or `stopMetronome()` (off) live,
  - mirrors to the config-screen `#metro-switch` (and its BPM/meter/accent row
    visibility) so the preference persists past the session — the same
    mirroring the live mode/advance selects already do,
  - calls `updateCollapseMeta()`.

### Beats/bars lock
- When `state.session.advance` is `beats` or `bars`, the metronome drives card
  advancement, so the switch is **forced on and locked** (a `locked` class;
  the click handler no-ops while locked), with a one-line hint in the panel:
  "Needed for beat/bar advance."
- This lock state is set in `updateLiveAdvanceUI` (which runs on session start
  and whenever the live advance select changes), so switching advance *away*
  from beats/bars unlocks the switch (metronome stays on; the user may then
  turn it off).

## Files touched

- `index.html` — add the "Metronome" switch row (+ hint span) at the top of
  `#metro-panel`.
- `styles.css` — `.metro-indicator.off` (dimmed, no pulse) and a `.switch.locked`
  (dimmed/non-interactive) style; hint style.
- `src/metronome.js` — `startMetronome`/`stopMetronome` toggle the `off` class
  instead of `display`; add the `#live-metro-switch` click handler (with locked
  guard).
- `src/session-run.js` — on session start, show the indicator (with correct
  on/off + lock state) regardless of `enabled`; set the switch state in
  `updateLiveAdvanceUI`.
- (`#metro-switch` config mirroring reuses existing elements in `ui-shell.js`;
  no change needed there beyond what the live handler calls.)

## Edge cases

- **Session where metronome was never enabled:** indicator visible but dimmed;
  tapping opens the panel; switch is off; flipping it starts the metronome.
- **Pause/resume:** unchanged — pause calls `stopMetronome` (adds `off` class,
  hidden behind the pause overlay anyway), resume calls `startMetronome` if
  enabled. The switch position follows `state.metronome.enabled`, which pause
  does not change.
- **Advance = beats/bars at session start:** switch shows on + locked with the
  hint.

## Out of scope

- One-tap toggle directly on the indicator (Approach B) and a separate header
  button (Approach C) were considered and rejected for consistency/clutter.
- Changing how beats/bars advancement works.
