// ============================================================
// sound.js — piano playback for flashcards via WebAudioFont.
//
// Lazy-loads webaudiofont-player.js + the active preset script
// on first use so users who never enable the toggle don't pay
// for it. Reuses audioCtx from app.js (created by the metronome).
// Switching the preset dropdown loads the new sample bank on
// demand and caches it; previous presets stay loaded so toggling
// back is instant.
//
// Output passes through a lowpass filter + master gain to warm
// the tone and prevent ear fatigue during long sessions.
// ============================================================

const PIANO_PRESETS = {
  fluidr3:     { file: 'piano-fluidr3.js',     varName: '_tone_0000_FluidR3_GM_sf2_file',    label: 'FluidR3 grand (default)' },
  aspirin:     { file: 'piano-aspirin.js',     varName: '_tone_0000_Aspirin_sf2_file',       label: 'Aspirin' },
  generaluser: { file: 'piano-generaluser.js', varName: '_tone_0000_GeneralUserGS_sf2_file', label: 'GeneralUser GS' },
  jclive:      { file: 'piano-jclive.js',      varName: '_tone_0000_JCLive_sf2_file',        label: 'JCLive (mellow)' }
};
const DEFAULT_PRESET_ID = 'fluidr3';

// Tone shaping — tweak if too dark / too bright.
const _LOWPASS_HZ  = 2200;
const _LOWPASS_Q   = 0.55;
const _MASTER_GAIN = 0.55;

let _player = null;
let _outputNode = null;            // lowpass + gain chain we route notes into
let _activePresetData = null;      // the loaded preset object (for queueWaveTable)
let _activePresetId = null;        // which preset id is currently loaded
let _playerScriptPromise = null;
const _presetScriptPromises = {};  // id -> Promise<presetObject>

function _loadPlayerScript() {
  if (_playerScriptPromise) return _playerScriptPromise;
  _playerScriptPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'webaudiofont-player.js';
    s.onload = res;
    s.onerror = () => rej(new Error('failed to load webaudiofont-player.js'));
    document.head.appendChild(s);
  });
  return _playerScriptPromise;
}

function _loadPresetScript(presetId) {
  if (_presetScriptPromises[presetId]) return _presetScriptPromises[presetId];
  const spec = PIANO_PRESETS[presetId];
  if (!spec) return Promise.reject(new Error('unknown piano preset: ' + presetId));
  _presetScriptPromises[presetId] = new Promise((res, rej) => {
    if (window[spec.varName]) { res(window[spec.varName]); return; }
    const s = document.createElement('script');
    s.src = spec.file;
    s.onload = () => {
      const p = window[spec.varName];
      if (!p) rej(new Error('preset variable missing: ' + spec.varName));
      else res(p);
    };
    s.onerror = () => rej(new Error('failed to load ' + spec.file));
    document.head.appendChild(s);
  });
  return _presetScriptPromises[presetId];
}

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

async function _ensurePreset(presetId) {
  if (!PIANO_PRESETS[presetId]) presetId = DEFAULT_PRESET_ID;
  await _loadPlayerScript();
  await ensureAudioContext();
  if (!_player) _player = new WebAudioFontPlayer();
  _buildOutputChain();
  if (_activePresetId !== presetId) {
    const preset = await _loadPresetScript(presetId);
    _player.adjustPreset(audioCtx, preset);
    _activePresetData = preset;
    _activePresetId = presetId;
  }
}

// Preload — called when the toggle flips on or when a different preset
// is picked, so the next card is ready without first-time lag.
function prefetchPianoEngine() {
  const id = (state.notation && state.notation.pianoPreset) || DEFAULT_PRESET_ID;
  _ensurePreset(id).catch(e => console.warn('[sound] prefetch failed', e));
}

// Pitch object {letter, accidental, octave} -> MIDI note number.
const _LETTER_MIDI_OFFSET = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function pitchToMidi(p) {
  return (p.octave + 1) * 12 + _LETTER_MIDI_OFFSET[p.letter] + p.accidental;
}

// Schedule a chord on the audio context.
// pitches: array of {letter, accidental, octave} (low-to-high)
// opts: { articulation: 'block'|'arpeggio', bpm, meter, direction: 'up'|'down' }
async function playChord(pitches, opts) {
  if (!pitches || !pitches.length) return;
  const presetId = (state.notation && state.notation.pianoPreset) || DEFAULT_PRESET_ID;
  try { await _ensurePreset(presetId); }
  catch (e) { console.warn('[sound] preset load failed', e); return; }
  if (!audioCtx || !_activePresetData) return;

  const bpm = Math.max(30, opts.bpm || 80);
  const meter = Math.max(1, opts.meter || 4);
  const articulation = opts.articulation || 'block';
  const beatSec = 60 / bpm;
  const t0 = audioCtx.currentTime + 0.02;
  const target = _outputNode || audioCtx.destination;

  if (articulation === 'block') {
    const durationSec = beatSec * meter;
    for (const p of pitches) {
      _player.queueWaveTable(audioCtx, target, _activePresetData, t0,
                              pitchToMidi(p), durationSec);
    }
    return;
  }

  const ordered = opts.direction === 'down' ? [...pitches].reverse() : pitches;
  const noteDur = beatSec * 0.9;
  ordered.forEach((p, i) => {
    _player.queueWaveTable(audioCtx, target, _activePresetData,
                            t0 + i * beatSec, pitchToMidi(p), noteDur);
  });
}
