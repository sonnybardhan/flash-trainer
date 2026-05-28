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

  let lastEnd = 0;
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
