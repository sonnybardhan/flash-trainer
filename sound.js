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

// EQ presets — each sets the lowshelf bass gain (dB), lowpass cutoff (Hz),
// and the master gain. The "bassDb" on a preset is its default; the user's
// bass slider in the Sound modal can override it.
const EQ_PRESETS = {
  neutral:   { bassDb:  0, lowpass: 4500, gain: 0.60, label: 'Neutral' },
  warm:      { bassDb:  3, lowpass: 2200, gain: 0.55, label: 'Warm' },
  mellow:    { bassDb:  2, lowpass: 1600, gain: 0.50, label: 'Mellow' },
  bright:    { bassDb:  0, lowpass: 6000, gain: 0.65, label: 'Bright' },
  bassBoost: { bassDb:  8, lowpass: 2600, gain: 0.55, label: 'Bass boost' }
};
const DEFAULT_EQ = { preset: 'warm', bassDb: 3 };

let _player = null;
let _outputNode = null;            // entry point of the EQ chain
let _lowshelf = null;
let _lowpass = null;
let _master = null;
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
  _lowshelf = audioCtx.createBiquadFilter();
  _lowshelf.type = 'lowshelf';
  _lowshelf.frequency.value = 200;
  _lowshelf.gain.value = 0;

  _lowpass = audioCtx.createBiquadFilter();
  _lowpass.type = 'lowpass';
  _lowpass.frequency.value = 2200;
  _lowpass.Q.value = 0.55;

  _master = audioCtx.createGain();
  _master.gain.value = 0.55;

  _lowshelf.connect(_lowpass);
  _lowpass.connect(_master);
  _master.connect(audioCtx.destination);
  _outputNode = _lowshelf;
  applyEQ();
}

// Apply state.notation.eq to the chain. Safe to call before chain is built;
// will re-apply once it is. Falls back to DEFAULT_EQ if state isn't set.
function applyEQ() {
  if (!_lowshelf) return;
  const eq = (state.notation && state.notation.eq) || DEFAULT_EQ;
  const preset = EQ_PRESETS[eq.preset] || EQ_PRESETS.warm;
  const bassDb = (eq.bassDb != null) ? eq.bassDb : preset.bassDb;
  // Smooth changes to avoid clicks.
  const t = audioCtx.currentTime;
  _lowshelf.gain.setTargetAtTime(bassDb, t, 0.02);
  _lowpass.frequency.setTargetAtTime(preset.lowpass, t, 0.02);
  _master.gain.setTargetAtTime(preset.gain, t, 0.02);
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

// Preload — called when the toggle flips on or when a different preset is
// picked, so the next card is ready without first-time lag.
//
// IMPORTANT: only loads the JS scripts. Does NOT touch AudioContext —
// creating an AudioContext outside a user gesture trips Chrome/Safari's
// autoplay policy and the context gets stuck unable to resume. The first
// playChord/previewChord call (always triggered by a click) is what
// actually instantiates and resumes the AudioContext.
function prefetchPianoEngine() {
  const id = (state.notation && state.notation.pianoPreset) || DEFAULT_PRESET_ID;
  _loadPlayerScript().catch(e => console.warn('[sound] player load failed', e));
  _loadPresetScript(id).catch(e => console.warn('[sound] preset load failed', e));
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

// Quick preview — play a C major triad with the current voicing/EQ/preset
// settings so the user can audition the sound without starting a session.
async function previewChord(articulation) {
  const fakeCard = { spelling: 'C', quality: 'major', inversion: 'root' };
  const pitches = computePlaybackPitches(fakeCard);
  if (!pitches) return;
  const direction = resolveDirection(state.notation.arpeggioDirection);
  const bpm = state.metronome.bpm || 80;
  const meter = state.metronome.meter || 4;
  // Need to prime the audio context if it hasn't been already. The click
  // handler that calls us is itself a user gesture, so resume() succeeds.
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  await playChord(pitches, { articulation, bpm, meter, direction });
}
