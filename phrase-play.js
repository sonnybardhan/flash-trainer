// ============================================================
// phrase-play.js — audio playback for a generated phrase.
//
// Schedules each sounding event with the WebAudioFont engine that
// sound.js already loads. The phrase is laid out in beats; this
// module converts beats → seconds via the supplied BPM and dispatches
// queueWaveTable calls anchored to audioCtx.currentTime + a small
// lead-in.
//
// Depends on globals exposed by sound.js:
//   - _ensurePreset, _player, _activePresetData, _outputNode
// Depends on app.js: audioCtx
// ============================================================

let _phraseEnvelopes = [];   // envelopes from the currently scheduled phrase

function _phrasePitchToMidi(p) {
  const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (p.octave + 1) * 12 + LETTER_SEMI[p.letter] + p.accidental;
}

function stopPhrase() {
  for (const env of _phraseEnvelopes) {
    if (env && typeof env.cancel === 'function') {
      try { env.cancel(); } catch (e) {}
    }
  }
  _phraseEnvelopes = [];
}

// Schedule the phrase. Returns a Promise that resolves once the
// phrase's last event has finished playing (or rejects if the engine
// can't start). Stops any prior phrase first so a card change doesn't
// leave a tail ringing.
async function playPhrase(phrase, rootPitch, bpm, opts = {}) {
  const id = (typeof state !== 'undefined'
              && state.notation && state.notation.pianoPreset) || 'fluidr3';
  await _ensurePreset(id);
  if (!audioCtx || !_activePresetData) return;
  stopPhrase();

  const beatSec = 60 / Math.max(30, bpm || 80);
  const t0 = audioCtx.currentTime + 0.05;
  const target = _outputNode || audioCtx.destination;
  const rootMidi = _phrasePitchToMidi(rootPitch);
  const vol = opts.volume != null ? opts.volume : 0.85;
  // Optional chord pad. opts.chord = {
  //   tones: [0, 4, 7],          // semitones relative to rootPitch
  //   octaveOffset: -1,          // octaves below the melody root
  //   volume: 0.5                // softer so the melody sits on top
  // }
  // Plays as a single sustained voicing under the entire phrase.
  let phraseBeats = 0;
  for (const ev of phrase.events) {
    phraseBeats = Math.max(phraseBeats, ev.onset + _phraseDurationBeats(ev.duration));
  }
  const phraseDurSec = phraseBeats * beatSec;
  if (opts.chord && Array.isArray(opts.chord.tones) && opts.chord.tones.length > 0) {
    const chordOctOff = opts.chord.octaveOffset != null ? opts.chord.octaveOffset : -1;
    const chordVol = opts.chord.volume != null ? opts.chord.volume : 0.55;
    for (const semi of opts.chord.tones) {
      const midi = rootMidi + semi + 12 * chordOctOff;
      const env = _player.queueWaveTable(audioCtx, target, _activePresetData,
                                          t0, midi, phraseDurSec + 0.2, chordVol);
      if (env) _phraseEnvelopes.push(env);
    }
  }

  let lastEnd = phraseDurSec;
  for (const ev of phrase.events) {
    if (ev.kind === 'rest') continue;
    const startSec = ev.onset * beatSec;
    const durSec = _phraseDurationBeats(ev.duration) * beatSec * 0.95;
    const midi = rootMidi + ev.semitone + 12 * (ev.octaveOffset || 0);
    const env = _player.queueWaveTable(audioCtx, target, _activePresetData,
                                        t0 + startSec, midi, durSec, vol);
    if (env) _phraseEnvelopes.push(env);
    lastEnd = Math.max(lastEnd, startSec + durSec);
  }

  return new Promise(resolve => setTimeout(resolve, (lastEnd + 0.1) * 1000));
}

// Stand-alone helper: play just the chord (sustained) followed by the
// scale degrees as eighth notes. Used by the "reference" button so the
// user can hear the harmonic+melodic context on demand.
async function playPhraseReference({ rootPitch, chordTones, scaleSemitones, bpm = 80 }) {
  const id = (typeof state !== 'undefined'
              && state.notation && state.notation.pianoPreset) || 'fluidr3';
  await _ensurePreset(id);
  if (!audioCtx || !_activePresetData) return;
  stopPhrase();

  const beatSec = 60 / Math.max(30, bpm);
  const eighthSec = beatSec / 2;
  const t0 = audioCtx.currentTime + 0.05;
  const target = _outputNode || audioCtx.destination;
  const rootMidi = _phrasePitchToMidi(rootPitch);

  // Chord first — sustained for 2 beats so the user gets a solid sense
  // of key. Played an octave below the melody for clean separation.
  const chordDur = 2 * beatSec;
  for (const semi of chordTones || []) {
    const midi = rootMidi + semi - 12;
    const env = _player.queueWaveTable(audioCtx, target, _activePresetData,
                                        t0, midi, chordDur, 0.55);
    if (env) _phraseEnvelopes.push(env);
  }
  // Then the scale degrees ascending as eighth notes, starting right
  // after the chord lands and continuing under its tail.
  const meloStart = t0 + chordDur + 0.1;
  const sorted = (scaleSemitones || []).slice().sort((a, b) => a - b);
  // Cap at one octave + tonic above to keep it tidy.
  sorted.push(12);
  let i = 0;
  for (const semi of sorted) {
    const midi = rootMidi + semi;
    const env = _player.queueWaveTable(audioCtx, target, _activePresetData,
                                        meloStart + i * eighthSec,
                                        midi, eighthSec * 0.95, 0.8);
    if (env) _phraseEnvelopes.push(env);
    i++;
  }
  const total = (chordDur + 0.1 + sorted.length * eighthSec) * 1000;
  return new Promise(resolve => setTimeout(resolve, total + 150));
}

function _phraseDurationBeats(d) {
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
