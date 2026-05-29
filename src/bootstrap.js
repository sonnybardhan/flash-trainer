// Initialize
// ============================================================
loadSettings();
applyTheme(state.theme);

// Build steppers
const stepperRefs = {};
stepperRefs.count = buildStepper('count-stepper', state.steppers.count, (v) => {
  state.steppers.count = v;
  if (stepperRefs.liveCount) stepperRefs.liveCount.setValue(v);
  if (state.session && state.session.mode === 'count') {
    state.session.target = v;
    updateLiveSessionUI();
  }
});
stepperRefs.time = buildStepper('time-stepper', state.steppers.time, (v) => {
  state.steppers.time = v;
  if (stepperRefs.liveTime) stepperRefs.liveTime.setValue(v);
  if (state.session && state.session.mode === 'time') {
    state.session.target = v * 60;
    updateLiveSessionUI();
  }
});
stepperRefs.liveCount = buildStepper('live-count-stepper', state.steppers.count, (v) => {
  state.steppers.count = v;
  stepperRefs.count.setValue(v);
  if (state.session && state.session.mode === 'count') {
    state.session.target = v;
    updateLiveSessionUI();
  }
});
stepperRefs.liveTime = buildStepper('live-time-stepper', state.steppers.time, (v) => {
  state.steppers.time = v;
  stepperRefs.time.setValue(v);
  if (state.session && state.session.mode === 'time') {
    state.session.target = v * 60;
    updateLiveSessionUI();
  }
});
stepperRefs.seconds = buildStepper('seconds-stepper', state.steppers.seconds, (v) => {
  state.steppers.seconds = v;
  if (stepperRefs.liveSeconds) stepperRefs.liveSeconds.setValue(v);
  if (state.session && state.session.advance === 'seconds') {
    state.session.secondsPerCard = v;
    applyLiveAdvanceChange();
  }
  updateCollapseMeta();
});
stepperRefs.beats = buildStepper('beats-stepper', state.steppers.beats, (v) => {
  state.steppers.beats = v;
  if (stepperRefs.liveBeats) stepperRefs.liveBeats.setValue(v);
  if (state.session && state.session.advance === 'beats') {
    state.session.beatsPerCard = v;
    applyLiveAdvanceChange();
  }
  updateCollapseMeta();
});
stepperRefs.bars = buildStepper('bars-stepper', state.steppers.bars, (v) => {
  state.steppers.bars = v;
  if (stepperRefs.liveBars) stepperRefs.liveBars.setValue(v);
  if (state.session && state.session.advance === 'bars') {
    state.session.barsPerCard = v;
    applyLiveAdvanceChange();
  }
  updateCollapseMeta();
});
stepperRefs.liveSeconds = buildStepper('live-seconds-stepper', state.steppers.seconds, (v) => {
  state.steppers.seconds = v;
  stepperRefs.seconds.setValue(v);
  if (state.session && state.session.advance === 'seconds') {
    state.session.secondsPerCard = v;
    applyLiveAdvanceChange();
  }
  updateCollapseMeta();
});
stepperRefs.liveBeats = buildStepper('live-beats-stepper', state.steppers.beats, (v) => {
  state.steppers.beats = v;
  stepperRefs.beats.setValue(v);
  if (state.session && state.session.advance === 'beats') {
    state.session.beatsPerCard = v;
    applyLiveAdvanceChange();
  }
  updateCollapseMeta();
});
stepperRefs.liveBars = buildStepper('live-bars-stepper', state.steppers.bars, (v) => {
  state.steppers.bars = v;
  stepperRefs.bars.setValue(v);
  if (state.session && state.session.advance === 'bars') {
    state.session.barsPerCard = v;
    applyLiveAdvanceChange();
  }
  updateCollapseMeta();
});
stepperRefs.bpm = buildStepper('bpm-stepper', state.metronome.bpm, (v) => {
  state.metronome.bpm = v;
  if (state.session && metroState.schedulerId) updateMetroDisplay();
  updateCollapseMeta();
});
stepperRefs.liveBpm = buildStepper('live-bpm-stepper', state.metronome.bpm, (v) => {
  state.metronome.bpm = v;
  stepperRefs.bpm.setValue(v);
  updateMetroDisplay();
  updateCollapseMeta();
});

$('live-accent-switch').classList.toggle('on', state.metronome.accent);
$('live-accent-switch').addEventListener('click', (e) => {
  e.stopPropagation();
  state.metronome.accent = !state.metronome.accent;
  $('live-accent-switch').classList.toggle('on', state.metronome.accent);
  $('accent-switch').classList.toggle('on', state.metronome.accent);
});

// Apply loaded display state
$('count-stepper').style.display = $('mode-select').value === 'count' ? 'flex' : 'none';
$('time-stepper').style.display = $('mode-select').value === 'time' ? 'flex' : 'none';
updateAdvanceUI();
$('metro-switch').classList.toggle('on', state.metronome.enabled);
$('accent-switch').classList.toggle('on', state.metronome.accent);
$('bpm-row').style.display = state.metronome.enabled ? 'flex' : 'none';
$('meter-row').style.display = state.metronome.enabled ? 'flex' : 'none';
$('accent-row').style.display = state.metronome.enabled ? 'flex' : 'none';
loadNotationSettings();
applyNotationSettingsToUI();

// First-use heuristic: if history is empty, open Metronome + Focus by default
const historyExists = readJSON('triad-history', []).length > 0;
if (!historyExists) {
  $('metronome-section').classList.add('open');
  $('focus-section').classList.add('open');
}

renderAll();

// MIDI input — fire-and-forget so a denied permission doesn't block the app.
initMidi();

// Prime the AudioContext on the FIRST user gesture of any kind (click, key,
// touch). Browsers don't reliably count MIDI input as a user activation, so
// without this the very first MIDI note arrives before the AudioContext is
// allowed to start. Once primed, every subsequent note plays instantly.
(function primeAudioOnFirstGesture() {
  const events = ['pointerdown', 'keydown', 'touchstart'];
  const prime = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    }
    if (audioCtx.state !== 'running') {
      audioCtx.resume().catch(() => {});
    }
    if (state.notation.midiThru !== false && typeof prefetchPianoEngine === 'function') {
      prefetchPianoEngine();
    }
    events.forEach(ev => document.removeEventListener(ev, prime, true));
  };
  events.forEach(ev => document.addEventListener(ev, prime, { capture: true, once: false }));
})();
