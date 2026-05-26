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

// EQ presets — three-band EQ now: lowshelf bass (~250 Hz), peaking mid
// (~1 kHz), and highshelf treble (~3.5 kHz). Each preset defines the dB
// values for all three bands plus a master gain. The Sound modal's bass /
// mid / treble sliders override the preset's defaults independently.
const EQ_PRESETS = {
  neutral:   { bassDb:  0, midDb:  0, trebleDb:  0, gain: 0.60, label: 'Neutral' },
  warm:      { bassDb:  3, midDb:  0, trebleDb: -4, gain: 0.55, label: 'Warm' },
  mellow:    { bassDb:  2, midDb: -1, trebleDb: -6, gain: 0.50, label: 'Mellow' },
  bright:    { bassDb:  0, midDb:  1, trebleDb:  3, gain: 0.65, label: 'Bright' },
  bassBoost: { bassDb:  8, midDb:  0, trebleDb: -2, gain: 0.55, label: 'Bass boost' }
};
const DEFAULT_EQ = { preset: 'warm', bassDb: 3, midDb: 0, trebleDb: -4, reverb: 10 };

let _player = null;
let _outputNode = null;            // entry point of the EQ chain
let _lowshelf = null;              // bass
let _peaking = null;               // mid
let _highshelf = null;             // treble
let _convolver = null;             // reverb impulse response
let _wetGain = null;               // wet (reverb) level
let _master = null;                // master gain
const REVERB_MAX_WET = 0.45;       // wetGain at slider = 100
let _activePresetData = null;      // the loaded preset object (for queueWaveTable)
let _activePresetId = null;        // which preset id is currently loaded
let _playerScriptPromise = null;
const _presetScriptPromises = {};  // id -> Promise<presetObject>
let _activeEnvelopes = [];         // envelopes from the most recent chord (for cutoff)

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

// Generate a synthetic impulse response: white noise with exponential decay.
// Used for the reverb convolver — saves shipping an IR audio file.
function _makeImpulseResponse(ctx, durationSec = 2.0, decay = 2.5) {
  const length = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
}

function _buildOutputChain() {
  if (_outputNode) return;
  _lowshelf = audioCtx.createBiquadFilter();
  _lowshelf.type = 'lowshelf';
  _lowshelf.frequency.value = 250;
  _lowshelf.gain.value = 0;

  _peaking = audioCtx.createBiquadFilter();
  _peaking.type = 'peaking';
  _peaking.frequency.value = 1000;
  _peaking.Q.value = 1.0;
  _peaking.gain.value = 0;

  _highshelf = audioCtx.createBiquadFilter();
  _highshelf.type = 'highshelf';
  _highshelf.frequency.value = 3500;
  _highshelf.gain.value = 0;

  _convolver = audioCtx.createConvolver();
  _convolver.buffer = _makeImpulseResponse(audioCtx, 2.2, 2.4);
  _wetGain = audioCtx.createGain();
  _wetGain.gain.value = 0;

  _master = audioCtx.createGain();
  _master.gain.value = 0.55;

  // Dry: lowshelf -> peaking -> highshelf -> master.
  // Wet: highshelf also feeds the convolver -> wetGain -> master.
  _lowshelf.connect(_peaking);
  _peaking.connect(_highshelf);
  _highshelf.connect(_master);
  _highshelf.connect(_convolver);
  _convolver.connect(_wetGain);
  _wetGain.connect(_master);
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
  const bassDb   = (eq.bassDb   != null) ? eq.bassDb   : preset.bassDb;
  const midDb    = (eq.midDb    != null) ? eq.midDb    : preset.midDb;
  const trebleDb = (eq.trebleDb != null) ? eq.trebleDb : preset.trebleDb;
  const reverb01 = Math.max(0, Math.min(100, (eq.reverb != null) ? eq.reverb : 10)) / 100;
  // Smooth changes to avoid clicks.
  const t = audioCtx.currentTime;
  _lowshelf.gain.setTargetAtTime(bassDb,    t, 0.02);
  _peaking.gain.setTargetAtTime(midDb,      t, 0.02);
  _highshelf.gain.setTargetAtTime(trebleDb, t, 0.02);
  _master.gain.setTargetAtTime(preset.gain, t, 0.02);
  _wetGain.gain.setTargetAtTime(reverb01 * REVERB_MAX_WET, t, 0.02);
}

// Wait for every zone in a preset to have its decoded AudioBuffer populated.
// adjustPreset() kicks off audioContext.decodeAudioData per zone asynchronously
// and returns immediately; if we schedule notes before those decodes finish,
// WebAudioFont logs "empty buffer" and plays nothing. Without this poll the
// first card after a fresh load would always be silent.
function _waitForPresetReady(preset, timeoutMs = 6000) {
  return new Promise(resolve => {
    const start = Date.now();
    const tick = () => {
      if (preset && preset.zones && preset.zones.every(z => z.buffer)) {
        resolve(); return;
      }
      if (Date.now() - start > timeoutMs) {
        console.warn('[sound] preset decode timed out; some notes may not sound');
        resolve(); return;
      }
      setTimeout(tick, 30);
    };
    tick();
  });
}

// Per-preset readiness cache so two simultaneous playChord calls for the
// same preset both await the same decoding pass instead of double-adjusting.
const _presetReadyPromises = {};

async function _ensurePreset(presetId) {
  if (!PIANO_PRESETS[presetId]) presetId = DEFAULT_PRESET_ID;
  await _loadPlayerScript();
  await ensureAudioContext();
  if (!_player) _player = new WebAudioFontPlayer();
  _buildOutputChain();

  if (_activePresetId !== presetId) {
    if (!_presetReadyPromises[presetId]) {
      _presetReadyPromises[presetId] = (async () => {
        const preset = await _loadPresetScript(presetId);
        _player.adjustPreset(audioCtx, preset);
        await _waitForPresetReady(preset);
        return preset;
      })();
    }
    const preset = await _presetReadyPromises[presetId];
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
// Fade out any notes scheduled by the previous chord so they don't ring into
// the next card. envelope.cancel() ramps the envelope gain to ~0 over 0.1 s.
function _stopActiveNotes() {
  for (const env of _activeEnvelopes) {
    if (env && typeof env.cancel === 'function') {
      try { env.cancel(); } catch (e) { /* envelope already detached */ }
    }
  }
  _activeEnvelopes = [];
}
// Public alias for app.js — call this on session end / quit / pause if needed.
function stopAllPianoNotes() { _stopActiveNotes(); }

async function playChord(pitches, opts) {
  if (!pitches || !pitches.length) return;
  const presetId = (state.notation && state.notation.pianoPreset) || DEFAULT_PRESET_ID;
  try { await _ensurePreset(presetId); }
  catch (e) { console.warn('[sound] preset load failed', e); return; }
  if (!audioCtx || !_activePresetData) return;

  // Kill the previous card's notes before starting the new one.
  _stopActiveNotes();

  const bpm = Math.max(30, opts.bpm || 80);
  const meter = Math.max(1, opts.meter || 4);
  const articulation = opts.articulation || 'block';
  const beatSec = 60 / bpm;
  const t0 = audioCtx.currentTime + 0.02;
  const target = _outputNode || audioCtx.destination;

  if (articulation === 'block') {
    const durationSec = beatSec * meter;
    for (const p of pitches) {
      const env = _player.queueWaveTable(audioCtx, target, _activePresetData, t0,
                                          pitchToMidi(p), durationSec);
      if (env) _activeEnvelopes.push(env);
    }
    return;
  }

  const ordered = opts.direction === 'down' ? [...pitches].reverse() : pitches;
  const noteDur = beatSec * 0.9;
  ordered.forEach((p, i) => {
    const env = _player.queueWaveTable(audioCtx, target, _activePresetData,
                                        t0 + i * beatSec, pitchToMidi(p), noteDur);
    if (env) _activeEnvelopes.push(env);
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
