// ============================================================
// phrase-match.js — in-time aural-recall scheduling + slot tracker.
//
// Ports CET's QuantizingSlotTracker + inTimeLoopTracker pattern to
// JS. The flow per card:
//
//   1. Demo: phrase plays through
//   2. Count-in: 1 bar at session BPM
//   3. Echo window: user has bars*4 beats to play it back
//   4. Evaluate: if every slot is captured, success → advance
//      Otherwise loop (replay demo, open new echo window).
//      Captured slots from prior iterations persist.
//   5. Six-iteration cap. If still incomplete, advance with a toast.
//
// Each MIDI press during the echo window is mapped to the nearest
// slot whose expected onset is within ±200 ms of the press time.
// Right pitch in the window → captured. Wrong pitch in the window →
// flagged but the slot stays open. Out-of-window presses are ignored.
//
// Pitch matching is octave-equivalent by default; the existing
// state.notation.midiIgnoreOctaves toggle still controls strictness.
// ============================================================

const PHRASE_IN_TIME_TOLERANCE_MS = 200;
const PHRASE_IN_TIME_MAX_ITERATIONS = 6;

let _inTimeRun = null;  // active run state, or null

function _phraseInTimePitchToMidi(p) {
  const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (p.octave + 1) * 12 + LETTER_SEMI[p.letter] + p.accidental;
}

function _phraseBeatsForDuration(d) {
  switch (d) {
    case 'half':           return 2;
    case 'quarter':        return 1;
    case 'eighth':         return 0.5;
    case 'tripletEighth':  return 1/3;
    case 'tripletQuarter': return 2/3;
    case 'sixteenth':      return 0.25;
    default: return 1;
  }
}

// Build the slot array for a phrase. Each sounding event becomes one
// slot with an absolute expected onset (in seconds from the echo
// window start) and the MIDI it should resolve to.
function buildPhraseSlots(phrase, rootPitch, bpm) {
  const beatSec = 60 / Math.max(30, bpm || 80);
  const rootMidi = _phraseInTimePitchToMidi(rootPitch);
  const slots = [];
  let id = 0;
  for (const ev of phrase.events) {
    if (ev.kind !== 'note') continue;
    slots.push({
      id: id++,
      midi: rootMidi + ev.semitone + 12 * (ev.octaveOffset || 0),
      onsetSec: ev.onset * beatSec
    });
  }
  return slots;
}

// Start the in-time recall loop for the given card.
// callbacks: { onIteration(iter, results), onComplete(success, results) }
function runInTimeRecall(card, callbacks = {}) {
  stopInTimeRecall();
  const bpm = (state.metronome && state.metronome.bpm) || 80;
  const beatSec = 60 / Math.max(30, bpm);
  const phraseDurationSec = card.bars * 4 * beatSec;
  const countInSec = 4 * beatSec;
  const echoWindowSec = phraseDurationSec + 0.4;  // small grace at the end
  const ignoreOct = !!(state.notation && state.notation.midiIgnoreOctaves);
  const slots = buildPhraseSlots(card.phrase, card.rootPitch, bpm);
  const captured = new Map();   // slotId → { midi, deltaSec, correct }
  const wrong    = new Set();   // slotIds flagged with wrong-pitch attempts

  _inTimeRun = {
    card, slots, captured, wrong, iteration: 0, bpm,
    phraseDurationSec, countInSec, echoWindowSec, ignoreOct,
    cancelled: false,
    timers: [],
    callbacks
  };
  _scheduleIteration();
}

function stopInTimeRecall() {
  if (!_inTimeRun) return;
  _inTimeRun.cancelled = true;
  for (const t of _inTimeRun.timers) clearTimeout(t);
  if (typeof clearMidiMatcher === 'function') clearMidiMatcher();
  if (typeof stopPhrase === 'function') stopPhrase();
  _inTimeRun = null;
}

function _scheduleIteration() {
  if (!_inTimeRun || _inTimeRun.cancelled) return;
  const r = _inTimeRun;
  r.iteration++;

  // 1) Play the demo immediately. The chord pad is a session-level
  // intro (matches degree drill behaviour): only the very first
  // demo of the very first card gets it; subsequent demos and loop
  // iterations are melody-only. Use the ♪ Ref button to re-hear.
  let chord = null;
  if (state.session && !state.session.phraseChordIntroPlayed) {
    const anchor = state.session.phraseAnchor;
    const tones = anchor && anchor.context && anchor.context.chordTones;
    if (tones && tones.length) {
      chord = { tones, octaveOffset: -1, volume: 0.55 };
      state.session.phraseChordIntroPlayed = true;
    }
  }
  playPhrase(r.card.phrase, r.card.rootPitch, r.bpm, { chord }).catch(() => {});

  // 2) After demo + count-in, open the echo window.
  const echoStartMs = (r.phraseDurationSec + r.countInSec) * 1000;
  const echoOpenTimer = setTimeout(_openEchoWindow, echoStartMs);
  r.timers.push(echoOpenTimer);
}

function _openEchoWindow() {
  if (!_inTimeRun || _inTimeRun.cancelled) return;
  const r = _inTimeRun;
  r.windowOpenedAt = performance.now();
  // Render / re-render the per-slot dots, preserving prior-iteration
  // results so the user sees what's still pending.
  if (typeof renderPhraseDots === 'function') {
    renderPhraseDots(r.slots.length);
    for (let i = 0; i < r.slots.length; i++) {
      const id = r.slots[i].id;
      if (r.captured.has(id) && typeof markPhraseDot === 'function') {
        markPhraseDot(i, 'captured', r.slots.length);
      } else if (r.wrong.has(id) && typeof markPhraseDot === 'function') {
        markPhraseDot(i, 'wrong', r.slots.length);
      }
    }
  }
  // Arm the MIDI matcher in pass-through mode so every press hits us.
  setMidiMatcher({
    mode: 'phrasePassThrough',
    container: document.getElementById('card-notation'),
    onCorrect: () => {},
    onPress: (midi) => _registerPress(midi)
  });
  // Schedule the window close.
  const closeTimer = setTimeout(_closeEchoWindow, r.echoWindowSec * 1000);
  r.timers.push(closeTimer);
}

function _registerPress(midi) {
  if (!_inTimeRun || _inTimeRun.cancelled || !_inTimeRun.windowOpenedAt) return;
  const r = _inTimeRun;
  const pressSec = (performance.now() - r.windowOpenedAt) / 1000;
  // Find the nearest slot within tolerance.
  let nearest = null;
  let nearestDelta = Infinity;
  let nearestIdx = -1;
  for (let i = 0; i < r.slots.length; i++) {
    const slot = r.slots[i];
    const d = Math.abs(slot.onsetSec - pressSec);
    if (d <= (PHRASE_IN_TIME_TOLERANCE_MS / 1000) && d < nearestDelta) {
      nearest = slot; nearestDelta = d; nearestIdx = i;
    }
  }
  if (!nearest) return;  // ignore out-of-window presses
  const correct = r.ignoreOct
    ? (((midi % 12) + 12) % 12) === (((nearest.midi % 12) + 12) % 12)
    : midi === nearest.midi;
  if (correct) {
    r.captured.set(nearest.id, { midi, deltaSec: pressSec - nearest.onsetSec });
    r.wrong.delete(nearest.id);
    if (typeof markPhraseDot === 'function') markPhraseDot(nearestIdx, 'captured', r.slots.length);
  } else {
    if (!r.captured.has(nearest.id)) r.wrong.add(nearest.id);
    if (typeof markPhraseDot === 'function') markPhraseDot(nearestIdx, 'wrong', r.slots.length);
  }
  // Early-exit: if every slot is captured, close the window immediately.
  if (r.captured.size === r.slots.length) _closeEchoWindow(true);
}

function _closeEchoWindow(earlyExit = false) {
  if (!_inTimeRun || _inTimeRun.cancelled) return;
  const r = _inTimeRun;
  for (const t of r.timers) clearTimeout(t);
  r.timers = [];
  r.windowOpenedAt = null;
  if (typeof clearMidiMatcher === 'function') clearMidiMatcher();

  const cleanRun = r.captured.size === r.slots.length;
  if (r.callbacks.onIteration) {
    r.callbacks.onIteration(r.iteration, {
      capturedCount: r.captured.size,
      totalSlots: r.slots.length,
      wrongIds: Array.from(r.wrong)
    });
  }
  if (cleanRun) {
    _finish(true);
    return;
  }
  if (r.iteration >= PHRASE_IN_TIME_MAX_ITERATIONS) {
    _finish(false);
    return;
  }
  // Loop — schedule another iteration after a short breath.
  const breath = setTimeout(_scheduleIteration, 600);
  r.timers.push(breath);
}

function _finish(success) {
  if (!_inTimeRun) return;
  const r = _inTimeRun;
  if (r.callbacks.onComplete) {
    r.callbacks.onComplete(success, {
      capturedCount: r.captured.size,
      totalSlots: r.slots.length,
      wrongIds: Array.from(r.wrong),
      iterations: r.iteration
    });
  }
  _inTimeRun = null;
}
