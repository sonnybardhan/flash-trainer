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
  const saved = JSON.parse(localStorage.getItem('triad-settings') || 'null');
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

window.addEventListener('beforeunload', saveSettings);
setInterval(saveSettings, 5000);

// ============================================================
