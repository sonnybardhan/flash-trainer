// ============================================================
// Sound / EQ modal
// ============================================================
function _eqValues(eq) {
  const preset = EQ_PRESETS[eq.preset] || EQ_PRESETS.warm;
  return {
    bassDb:   (eq.bassDb   != null) ? eq.bassDb   : preset.bassDb,
    midDb:    (eq.midDb    != null) ? eq.midDb    : preset.midDb,
    trebleDb: (eq.trebleDb != null) ? eq.trebleDb : preset.trebleDb,
    reverb:   (eq.reverb   != null) ? eq.reverb   : 10
  };
}
function _fmtDb(n) { return (n > 0 ? '+' : '') + n + ' dB'; }
function _eqMatchesPreset(eq) {
  const preset = EQ_PRESETS[eq.preset] || EQ_PRESETS.warm;
  const v = _eqValues(eq);
  return v.bassDb === preset.bassDb && v.midDb === preset.midDb && v.trebleDb === preset.trebleDb;
}

// iOS-style slider fill: paints the accent track segment from --low to --high
// percent. For ±range sliders (bass/mid/treble) the fill straddles center;
// for 0-N sliders (reverb) it fills from left.
function _updateSliderFill(sliderEl, fromCenter = true) {
  const min = parseFloat(sliderEl.min);
  const max = parseFloat(sliderEl.max);
  const val = parseFloat(sliderEl.value);
  const pct = ((val - min) / (max - min)) * 100;
  if (fromCenter) {
    sliderEl.style.setProperty('--low',  Math.min(50, pct) + '%');
    sliderEl.style.setProperty('--high', Math.max(50, pct) + '%');
  } else {
    sliderEl.style.setProperty('--low',  '0%');
    sliderEl.style.setProperty('--high', pct + '%');
  }
}
function _shortPianoLabel(id) {
  const full = (PIANO_PRESETS[id] || PIANO_PRESETS.fluidr3).label;
  // strip trailing parenthetical like " (default)" or " (mellow)"
  return full.replace(/\s*\(.*\)\s*$/, '');
}
function updateEqCurrentLabel() {
  const eq = state.notation.eq || { preset: 'warm', bassDb: 3, midDb: 0, trebleDb: -4 };
  const presetLabel = (EQ_PRESETS[eq.preset] || EQ_PRESETS.warm).label;
  const piano = _shortPianoLabel(state.notation.pianoPreset);
  const eqStr = _eqMatchesPreset(eq) ? presetLabel : `${presetLabel} · custom`;
  $('eq-current-label').textContent = `${piano} · ${eqStr}`;
}
function applyEqToUI() {
  const eq = state.notation.eq || { preset: 'warm', bassDb: 3, midDb: 0, trebleDb: -4, reverb: 10 };
  setActiveSegment('eq-preset-segment', 'eqPreset', eq.preset);
  $('eq-piano-select').value = state.notation.pianoPreset || 'fluidr3';
  const v = _eqValues(eq);
  $('eq-bass-slider').value = String(v.bassDb);
  $('eq-bass-value').textContent = _fmtDb(v.bassDb);
  _updateSliderFill($('eq-bass-slider'), true);
  $('eq-mid-slider').value = String(v.midDb);
  $('eq-mid-value').textContent = _fmtDb(v.midDb);
  _updateSliderFill($('eq-mid-slider'), true);
  $('eq-treble-slider').value = String(v.trebleDb);
  $('eq-treble-value').textContent = _fmtDb(v.trebleDb);
  _updateSliderFill($('eq-treble-slider'), true);
  $('eq-reverb-slider').value = String(v.reverb);
  $('eq-reverb-value').textContent = v.reverb + '%';
  _updateSliderFill($('eq-reverb-slider'), false);
  updateEqCurrentLabel();
}
$('eq-open-btn').addEventListener('click', () => {
  applyEqToUI();
  $('eq-modal-backdrop').classList.add('active');
});
$('eq-modal-close').addEventListener('click', () => $('eq-modal-backdrop').classList.remove('active'));
$('eq-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'eq-modal-backdrop') $('eq-modal-backdrop').classList.remove('active');
});
$('eq-modal-reset').addEventListener('click', () => {
  const preset = EQ_PRESETS.warm;
  state.notation.eq = {
    preset: 'warm',
    bassDb: preset.bassDb, midDb: preset.midDb, trebleDb: preset.trebleDb,
    reverb: 10
  };
  applyEqToUI();
  applyEQ();
  saveNotationSettings();
});
$('eq-preset-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  const presetId = seg.dataset.eqPreset;
  const presetDef = EQ_PRESETS[presetId] || EQ_PRESETS.warm;
  const cur = state.notation.eq || {};
  state.notation.eq = {
    preset: presetId,
    bassDb: presetDef.bassDb, midDb: presetDef.midDb, trebleDb: presetDef.trebleDb,
    reverb: (cur.reverb != null) ? cur.reverb : 10  // preserve reverb across preset swaps
  };
  applyEqToUI();
  applyEQ();
  saveNotationSettings();
});
function _setEqField(field, value, sliderId, formatter, fromCenter) {
  const cur = state.notation.eq || { preset: 'warm' };
  state.notation.eq = { ...cur, [field]: value };
  $(sliderId.replace('-slider', '-value')).textContent = formatter(value);
  _updateSliderFill($(sliderId), fromCenter);
  updateEqCurrentLabel();
  applyEQ();
  saveNotationSettings();
}
$('eq-bass-slider').addEventListener('input',   (e) =>
  _setEqField('bassDb',   parseInt(e.target.value, 10), 'eq-bass-slider',   _fmtDb, true));
$('eq-mid-slider').addEventListener('input',    (e) =>
  _setEqField('midDb',    parseInt(e.target.value, 10), 'eq-mid-slider',    _fmtDb, true));
$('eq-treble-slider').addEventListener('input', (e) =>
  _setEqField('trebleDb', parseInt(e.target.value, 10), 'eq-treble-slider', _fmtDb, true));
$('eq-reverb-slider').addEventListener('input', (e) =>
  _setEqField('reverb',   parseInt(e.target.value, 10), 'eq-reverb-slider', (v) => v + '%', false));
$('eq-preview-block').addEventListener('click', () => previewChord('block'));
$('eq-preview-arp').addEventListener('click', () => previewChord('arpeggio'));
$('label-style-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.labelStyle = seg.dataset.labelStyle;
  setActiveSegment('label-style-segment', 'labelStyle', state.notation.labelStyle);
  if (state.session && state.session.lastCard) {
    renderChordLabel(state.session.lastCard);
    renderChordNameOverlay(state.session.lastCard);
  }
  saveNotationSettings();
});
$('show-name-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.showName = seg.dataset.showName;
  setActiveSegment('show-name-segment', 'showName', state.notation.showName);
  if (state.session && state.session.lastCard) {
    // If switching away from tap-to-reveal, drop the per-card reveal flag.
    if (state.notation.showName !== 'tapToReveal') {
      delete state.session.lastCard.nameRevealed;
    }
    renderChordNameOverlay(state.session.lastCard);
  }
  saveNotationSettings();
  markCustomIfActive();
});
$('difficulty-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  const level = +seg.dataset.difficulty;
  const apply = () => {
    difficultyConfirmed = true;
    applyDifficultyPreset(level);
  };
  if (!difficultyConfirmed) {
    showModal({
      title: 'Replace your selection?',
      body: 'Applying a difficulty level overwrites your roots, qualities, inversions, and several display settings. Focus items, metronome, and advance mode are untouched.',
      actions: [
        { label: 'Cancel' },
        { label: 'Continue', kind: 'primary', onClick: apply }
      ]
    });
    return;
  }
  apply();
});
$('range-open-btn').addEventListener('click', openRangeModal);
$('range-modal-close').addEventListener('click', closeRangeModal);
$('range-modal-reset').addEventListener('click', resetRangeToDefault);
$('range-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'range-modal-backdrop') closeRangeModal();
});

$('add-focus-btn').addEventListener('click', () => {
  const spelling = [...state.selectedSpellings][0] || 'C';
  const quality = [...state.selectedQualities][0] || 'major';
  const inversion = [...state.selectedInversions][0] || 'root';
  state.focusItems.push({ spelling, quality, inversion, stress: 'medium' });
  renderFocusList();
  updateCollapseMeta();
});

