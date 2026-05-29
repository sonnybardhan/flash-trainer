// ============================================================
// Metronome
// ============================================================
let audioCtx = null;
let metroState = { nextBeatTime: 0, currentBeat: 0, schedulerId: null, uiQueue: [] };
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

// Single factory for the shared AudioContext so the three creation sites
// (metronome, MIDI-thru note-on, sound preview) stay in sync.
function createAudioCtx() {
  return new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
}

async function ensureAudioContext() {
  if (!audioCtx) audioCtx = createAudioCtx();
  if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') {
    try { await audioCtx.resume(); } catch (e) { /* iOS may reject outside user gesture */ }
  }
}

function scheduleClick(time, isDownbeat) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = isDownbeat ? 1500 : 900;
  osc.type = 'square';
  const attack = 0.001;
  const decay = isDownbeat ? 0.05 : 0.035;
  const peak = isDownbeat ? 0.4 : 0.25;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(peak, time + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);
  osc.start(time);
  osc.stop(time + attack + decay + 0.01);
  metroState.uiQueue.push({ time, isDownbeat });
}

function metroScheduler() {
  if (!audioCtx) return;
  const interval = 60.0 / state.metronome.bpm;
  while (metroState.nextBeatTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
    const isDownbeat = state.metronome.accent && (metroState.currentBeat % state.metronome.meter === 0);
    scheduleClick(metroState.nextBeatTime, isDownbeat);
    metroState.nextBeatTime += interval;
    metroState.currentBeat++;
  }
}

async function startMetronome() {
  await ensureAudioContext();
  metroState.currentBeat = 0;
  metroState.nextBeatTime = audioCtx.currentTime + 0.1;
  metroState.uiQueue = [];
  metroState.schedulerId = setInterval(metroScheduler, LOOKAHEAD_MS);
  requestAnimationFrame(updatePulseUI);
  $('metro-indicator').style.display = 'flex';
  updateMetroDisplay();
}

function stopMetronome() {
  if (metroState.schedulerId) clearInterval(metroState.schedulerId);
  metroState.schedulerId = null;
  metroState.uiQueue = [];
  $('metro-indicator').style.display = 'none';
  $('metro-panel').classList.remove('open');
  $('pulse-dot').className = 'pulse-dot';
}

function updateMetroDisplay() {
  $('metro-display').textContent = `${state.metronome.bpm} bpm`;
}

function updatePulseUI() {
  if (!metroState.schedulerId) return;
  const now = audioCtx.currentTime;
  while (metroState.uiQueue.length > 0 && metroState.uiQueue[0].time <= now) {
    const beat = metroState.uiQueue.shift();
    const dot = $('pulse-dot');
    dot.className = 'pulse-dot ' + (beat.isDownbeat ? 'downbeat' : 'beat');
    setTimeout(() => { dot.className = 'pulse-dot'; }, 80);
    onBeatPlayed(beat);
  }
  requestAnimationFrame(updatePulseUI);
}

function onBeatPlayed(beat) {
  const s = state.session;
  if (!s || s.pauseStartedAt) return;
  s.beatsSinceCardChange = (s.beatsSinceCardChange || 0) + 1;
  if (s.advance === 'beats') {
    if (s.beatsSinceCardChange >= s.beatsPerCard) nextCard();
  } else if (s.advance === 'bars') {
    if (s.beatsSinceCardChange >= s.barsPerCard * state.metronome.meter) nextCard();
  }
}

$('metro-display-tap').addEventListener('click', (e) => {
  e.stopPropagation();
  $('metro-panel').classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!$('metro-indicator').contains(e.target)) {
    $('metro-panel').classList.remove('open');
  }
  if (!$('advance-indicator').contains(e.target)) {
    $('advance-panel').classList.remove('open');
  }
  if ($('degree-range-indicator') && !$('degree-range-indicator').contains(e.target)) {
    $('degree-range-panel').classList.remove('open');
  }
  if ($('session-indicator') && !$('session-indicator').contains(e.target)) {
    $('session-panel').classList.remove('open');
  }
});

$('advance-display-tap').addEventListener('click', (e) => {
  e.stopPropagation();
  $('advance-panel').classList.toggle('open');
});

$('degree-range-display-tap').addEventListener('click', (e) => {
  e.stopPropagation();
  $('degree-range-panel').classList.toggle('open');
});
$('session-display-tap').addEventListener('click', (e) => {
  e.stopPropagation();
  $('session-panel').classList.toggle('open');
});

function updateLiveSessionUI() {
  if (!state.session) return;
  const s = state.session;
  $('live-mode-select').value = s.mode;
  $('live-count-row').style.display = s.mode === 'count' ? 'flex' : 'none';
  $('live-time-row').style.display  = s.mode === 'time'  ? 'flex' : 'none';
  let label;
  if (s.mode === 'count') label = `${s.target} reps`;
  else if (s.mode === 'time') label = `${Math.round(s.target / 60)} min`;
  else label = '∞ infinite';
  $('session-display').textContent = label;
  $('stat-progress').textContent = progressText();
}

$('live-mode-select').addEventListener('change', (e) => {
  e.stopPropagation();
  if (!state.session) return;
  const newMode = e.target.value;
  state.session.mode = newMode;
  // Sync the home select so the choice persists past this session.
  $('mode-select').value = newMode;
  $('count-stepper').style.display = newMode === 'count' ? 'flex' : 'none';
  $('time-stepper').style.display  = newMode === 'time'  ? 'flex' : 'none';
  if (newMode === 'count') {
    state.session.target = state.steppers.count;
  } else if (newMode === 'time') {
    state.session.target = state.steppers.time * 60;
  } else {
    state.session.target = Infinity;
  }
  updateLiveSessionUI();
});
$('live-degree-range-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  e.stopPropagation();
  setDegreeRangeMode(seg.dataset.degreeRangeMode);
});

$('live-advance-select').addEventListener('change', (e) => {
  e.stopPropagation();
  if (!state.session) return;
  const val = e.target.value;
  // Beats/bars need the metronome — auto-enable if it's off, same as home.
  if ((val === 'beats' || val === 'bars') && !state.metronome.enabled) {
    state.metronome.enabled = true;
    $('metro-switch').classList.add('on');
    $('live-accent-switch').classList.toggle('on', state.metronome.accent);
    startMetronome();
  }
  state.session.advance = val;
  // Mirror to home select so the user's preference persists after the session.
  $('advance-select').value = val;
  updateAdvanceUI();
  updateCollapseMeta();
  applyLiveAdvanceChange();
});

