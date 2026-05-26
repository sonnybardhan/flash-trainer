// ============================================================
// sound.js — piano playback for flashcards via WebAudioFont.
//
// Lazy-loads webaudiofont-player.js + piano-preset.js on first
// use so users who never enable the toggle don't pay for it.
// Reuses audioCtx from app.js (created by the metronome).
//
// The preset is a FluidR3 acoustic grand piano. The user's original
// ask was Tim GM6 specifically, but that SoundFont isn't pre-converted
// and would need either a runtime .sf2 parser (extra JS + ~6MB asset)
// or an offline conversion step. FluidR3's grand has very similar
// character; swap piano-preset.js to a different sample bank if you
// want a different tone.
// ============================================================

let _player = null;
let _preset = null;
let _loadPromise = null;
let _outputNode = null; // lowpass + gain chain we route notes into

// Tunables for the warm/bassy tone. Cutoff lower = darker, Q higher = more
// resonant. Gain caps the overall volume.
const _LOWPASS_HZ = 2200;
const _LOWPASS_Q  = 0.55;
const _MASTER_GAIN = 0.55;

function _buildOutputChain() {
  if (_outputNode) return;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = _LOWPASS_HZ;
  filter.Q.value = _LOWPASS_Q;

  const gain = audioCtx.createGain();
  gain.gain.value = _MASTER_GAIN;

  filter.connect(gain);
  gain.connect(audioCtx.destination);
  _outputNode = filter;
}

function loadPianoEngine() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = new Promise((resolve, reject) => {
    const load = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = () => rej(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
    load('webaudiofont-player.js')
      .then(() => load('piano-preset.js'))
      .then(async () => {
        await ensureAudioContext();
        _player = new WebAudioFontPlayer();
        _preset = window._tone_0000_FluidR3_GM_sf2_file;
        _player.adjustPreset(audioCtx, _preset);
        _buildOutputChain();
        resolve();
      })
      .catch(reject);
  });
  return _loadPromise;
}

// Pitch object {letter, accidental, octave} -> MIDI note number.
// MIDI: C-1 = 0, middle C (C4) = 60.
const _LETTER_MIDI_OFFSET = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pitchToMidi(p) {
  return (p.octave + 1) * 12 + _LETTER_MIDI_OFFSET[p.letter] + p.accidental;
}

// Schedule a chord on the audio context.
// pitches: array of {letter, accidental, octave} (low-to-high)
// opts: { articulation: 'block'|'arpeggio', bpm, meter, direction: 'up'|'down' }
async function playChord(pitches, opts) {
  if (!pitches || !pitches.length) return;
  if (!_player) {
    try { await loadPianoEngine(); } catch (e) { console.warn('[sound] piano load failed', e); return; }
  }
  if (!audioCtx) return;

  const bpm = Math.max(30, opts.bpm || 80);
  const meter = Math.max(1, opts.meter || 4);
  const articulation = opts.articulation || 'block';
  const beatSec = 60 / bpm;
  const t0 = audioCtx.currentTime + 0.02;

  const target = _outputNode || audioCtx.destination;
  if (articulation === 'block') {
    // All notes simultaneously, hold one bar.
    const durationSec = beatSec * meter;
    for (const p of pitches) {
      _player.queueWaveTable(audioCtx, target, _preset, t0,
                              pitchToMidi(p), durationSec);
    }
    return;
  }

  // Arpeggio — one note per beat in sequence.
  const ordered = opts.direction === 'down' ? [...pitches].reverse() : pitches;
  const noteDur = beatSec * 0.9; // slight gap between notes
  ordered.forEach((p, i) => {
    _player.queueWaveTable(audioCtx, target, _preset,
                            t0 + i * beatSec, pitchToMidi(p), noteDur);
  });
}

// Preload the engine when the user enables the toggle, so the first
// card after the toggle is ready to go.
function prefetchPianoEngine() {
  loadPianoEngine().catch(e => console.warn('[sound] prefetch failed', e));
}
