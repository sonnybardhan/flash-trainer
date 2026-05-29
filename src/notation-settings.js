// ============================================================
// Notation settings — persistence and range UI
// ============================================================
const NOTATION_STORAGE_KEY = 'rep-trainer-notation';
function saveNotationSettings() {
  try { localStorage.setItem(NOTATION_STORAGE_KEY, JSON.stringify(state.notation)); } catch {}
}
function loadNotationSettings() {
  try {
    const raw = localStorage.getItem(NOTATION_STORAGE_KEY);
    if (!raw) return;
    const loaded = JSON.parse(raw);
    // Migrate "hand" (right/left/both) to "clef" (treble/bass/both).
    if ('hand' in loaded && !('clef' in loaded)) {
      const map = { right: 'treble', left: 'bass', both: 'both' };
      loaded.clef = map[loaded.hand] || 'treble';
      delete loaded.hand;
    }
    Object.assign(state.notation, loaded);
  } catch {}
}

// ============================================================


// Apply loaded settings to all notation UI controls.
function applyNotationSettingsToUI() {
  const ns = state.notation;
  if (!ns.drillType) ns.drillType = 'chords';
  if (!Array.isArray(ns.intervalSelection) || ns.intervalSelection.length === 0) {
    ns.intervalSelection = ['m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7'];
  }
  if (!ns.degreeKey) ns.degreeKey = 'C';
  if (!ns.degreeChordQuality) ns.degreeChordQuality = 'major';
  setActiveSegment('drill-segment', 'drill', ns.drillType);
  setActiveSegment('format-segment', 'format', ns.format);
  setActiveSegment('clef-segment', 'clef', ns.clef);
  setActiveSegment('voicing-segment', 'voicing', ns.voicing);
  setActiveSegment('articulation-segment', 'articulation', ns.articulation);
  setActiveSegment('arp-dir-segment', 'direction', ns.arpeggioDirection);
  setActiveSegment('accidentals-segment', 'accidentals', ns.accidentals);
  setActiveSegment('label-style-segment', 'labelStyle', ns.labelStyle);
  setActiveSegment('show-name-segment', 'showName', ns.showName);
  $('double-root-switch').classList.toggle('on', ns.doubleRootInBass);
  $('unconventional-switch').classList.toggle('on', ns.unconventionalSpellings);
  $('play-sound-switch').classList.toggle('on', ns.playSound);
  $('midi-thru-switch').classList.toggle('on', ns.midiThru !== false);
  $('midi-ignore-octaves-switch').classList.toggle('on', !!ns.midiIgnoreOctaves);
  populatePianoPresetSelect();
  $('piano-preset-select').value = ns.pianoPreset || 'fluidr3';
  if (!ns.eq) ns.eq = { preset: 'warm', bassDb: 3 };
  applyEqToUI();
  applyEQ();
  if (ns.playSound) prefetchPianoEngine();
  updateRangeCurrentLabel();
  renderIntervalChips();
  applyDegreeConfigToUI();
  // Phrase drill settings.
  setActiveSegment('phrase-bars-segment', 'phraseBars', String(ns.phraseBars || 1));
  setActiveSegment('phrase-interaction-segment', 'phraseInteraction', ns.phraseInteraction || 'aural-free');
  renderPhraseRhythmChips();
  $('phrase-rests-switch').classList.toggle('on', ns.phraseRestsIncluded !== false);
  updateDrillVisibility();
  updateNotationRowVisibility();
}

// Show/hide drill-specific sections based on the active drill type.
// (Notation row visibility is handled by updateNotationRowVisibility, which
// is drill-aware.)
function updateDrillVisibility() {
  const drill = state.notation.drillType || 'chords';
  // New attribute-based system: data-drills="degrees phrases" → visible for
  // either of those drill types. Wins over the legacy class-based rules
  // when both are present on the same element.
  document.querySelectorAll('[data-drills]').forEach(el => {
    const drills = el.dataset.drills.split(/\s+/);
    el.style.display = drills.includes(drill) ? '' : 'none';
  });
  document.querySelectorAll('.drill-chords-only').forEach(el => {
    if (el.hasAttribute('data-drills')) return;
    el.style.display = drill === 'chords' ? '' : 'none';
  });
  document.querySelectorAll('.drill-intervals-only').forEach(el => {
    el.style.display = drill === 'intervals' ? '' : 'none';
  });
  document.querySelectorAll('.drill-degrees-only').forEach(el => {
    el.style.display = drill === 'degrees' ? '' : 'none';
  });
  const showLabel = $('show-name-label');
  if (showLabel) {
    showLabel.textContent =
      drill === 'intervals' ? 'Show interval name' :
      drill === 'degrees'   ? 'Show degree' :
                              'Show chord name';
  }
}

