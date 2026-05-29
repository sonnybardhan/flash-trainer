// Settings persistence
// ============================================================
function saveSettings() {
  const settings = {
    spellings: [...state.selectedSpellings],
    qualities: [...state.selectedQualities],
    inversions: [...state.selectedInversions],
    focusItems: state.focusItems,
    metronome: state.metronome,
    steppers: state.steppers,
    theme: state.theme,
    mode: $('mode-select').value,
    advance: $('advance-select').value,
    meter: $('meter-select').value
  };
  localStorage.setItem('triad-settings', JSON.stringify(settings));
}

function loadSettings() {
  const saved = readJSON('triad-settings', null);
  if (saved) {
    // Migration: old saves used pitch indices. Default to all if not present.
    state.selectedSpellings = new Set(saved.spellings || SPELLING_IDS);
    state.selectedQualities = new Set(saved.qualities || ['major', 'minor']);
    state.selectedInversions = new Set(saved.inversions || ['root']);
    // Migration: old focus items had pitchIdx; drop them
    state.focusItems = (saved.focusItems || []).filter(f => f.spelling);
    state.metronome = saved.metronome || { enabled: false, bpm: 80, meter: 4, accent: true };
    state.steppers = { ...state.steppers, ...(saved.steppers || {}) };
    state.theme = saved.theme || (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    $('mode-select').value = saved.mode || 'count';
    $('advance-select').value = saved.advance || 'manual';
    $('meter-select').value = saved.meter || '4';
  } else {
    // No saved state — detect system preference
    state.theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
}

// Save on the events that actually fire reliably across platforms. The old
// blind 5s setInterval churned localStorage every 5s for the whole session;
// pagehide + visibilitychange(hidden) cover desktop close/refresh AND mobile
// (where beforeunload is unreliable) without the constant writes.
window.addEventListener('pagehide', saveSettings);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveSettings();
});

// ============================================================
