// Interval-drill: selection chips for which intervals are in the drill pool.
const INTERVAL_CHIP_ORDER = ['m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7'];
const DIATONIC_INTERVALS = ['M2','M3','P4','P5','M6','M7'];

function renderIntervalChips() {
  const c = $('interval-chips');
  if (!c) return;
  c.replaceChildren();
  const active = new Set(state.notation.intervalSelection || INTERVAL_CHIP_ORDER);
  INTERVAL_CHIP_ORDER.forEach(id => {
    const b = document.createElement('button');
    b.className = 'chip' + (active.has(id) ? ' active' : '');
    b.textContent = id;
    b.onclick = () => {
      const set = new Set(state.notation.intervalSelection || []);
      if (set.has(id)) {
        if (set.size === 1) return; // keep at least one selected
        set.delete(id);
      } else {
        set.add(id);
      }
      state.notation.intervalSelection = INTERVAL_CHIP_ORDER.filter(x => set.has(x));
      saveNotationSettings();
      renderIntervalChips();
    };
    c.appendChild(b);
  });
}

// Degree-drill: single-key select + chord-quality segment + scale picker.
const DEGREE_KEY_OPTIONS = [
  'C','C#','Db','D','Eb','E','F','F#','Gb','G','G#','Ab','A','Bb','B'
];
// Scale presets — each maps to a set of chromatic degree IDs. 'custom' is
// inferred (not in this map); used when the user-edited set matches no preset.
const SCALE_PRESETS = {
  ionian:           { label: 'Ionian (major)',    degrees: ['1','2','3','4','5','6','7'] },
  dorian:           { label: 'Dorian',            degrees: ['1','2','b3','4','5','6','b7'] },
  phrygian:         { label: 'Phrygian',          degrees: ['1','b2','b3','4','5','b6','b7'] },
  lydian:           { label: 'Lydian',            degrees: ['1','2','3','#4','5','6','7'] },
  mixolydian:       { label: 'Mixolydian',        degrees: ['1','2','3','4','5','6','b7'] },
  aeolian:          { label: 'Aeolian (minor)',   degrees: ['1','2','b3','4','5','b6','b7'] },
  locrian:          { label: 'Locrian',           degrees: ['1','b2','b3','4','#4','b6','b7'] },
  harmonicMinor:    { label: 'Harmonic minor',    degrees: ['1','2','b3','4','5','b6','7'] },
  melodicMinor:     { label: 'Melodic minor',     degrees: ['1','2','b3','4','5','6','7'] },
  majorPentatonic:  { label: 'Major pentatonic',  degrees: ['1','2','3','5','6'] },
  minorPentatonic:  { label: 'Minor pentatonic',  degrees: ['1','b3','4','5','b7'] },
  blues:            { label: 'Blues',             degrees: ['1','b3','4','#4','5','b7'] },
  chromatic:        { label: 'Chromatic',         degrees: ['1','b2','2','b3','3','4','#4','5','b6','6','b7','7'] }
};
const DEGREE_CHIP_ORDER = ['1','b2','2','b3','3','4','#4','5','b6','6','b7','7'];
const DEGREE_CHIP_LABELS = {
  '1':'1', 'b2':'♭2', '2':'2', 'b3':'♭3', '3':'3', '4':'4',
  '#4':'♯4', '5':'5', 'b6':'♭6', '6':'6', 'b7':'♭7', '7':'7'
};

function _sameDegreeSet(a, b) {
  if (a.length !== b.length) return false;
  const sa = new Set(a), sb = new Set(b);
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}
function detectScaleMode(degrees) {
  for (const [id, def] of Object.entries(SCALE_PRESETS)) {
    if (_sameDegreeSet(degrees, def.degrees)) return id;
  }
  return 'custom';
}

function populateDegreeKeySelect() {
  const sel = $('degree-key-select');
  if (!sel || sel.options.length) return;
  DEGREE_KEY_OPTIONS.forEach(id => {
    const o = document.createElement('option');
    o.value = id; o.textContent = id;
    sel.appendChild(o);
  });
}
function populateDegreeScaleSelect() {
  const sel = $('degree-scale-select');
  if (!sel || sel.options.length) return;
  for (const [id, def] of Object.entries(SCALE_PRESETS)) {
    const o = document.createElement('option');
    o.value = id; o.textContent = def.label;
    sel.appendChild(o);
  }
  const cust = document.createElement('option');
  cust.value = 'custom'; cust.textContent = 'Custom';
  sel.appendChild(cust);
}
function renderDegreeScaleChips() {
  const c = $('degree-scale-chips');
  if (!c) return;
  c.replaceChildren();
  const active = new Set(state.notation.degreeScaleDegrees || []);
  DEGREE_CHIP_ORDER.forEach(id => {
    const b = document.createElement('button');
    b.className = 'chip' + (active.has(id) ? ' active' : '');
    b.textContent = DEGREE_CHIP_LABELS[id];
    b.onclick = () => {
      const set = new Set(state.notation.degreeScaleDegrees || []);
      if (set.has(id)) {
        if (set.size === 1) return; // keep at least one degree
        set.delete(id);
      } else {
        set.add(id);
      }
      state.notation.degreeScaleDegrees = DEGREE_CHIP_ORDER.filter(d => set.has(d));
      state.notation.degreeScaleMode = detectScaleMode(state.notation.degreeScaleDegrees);
      $('degree-scale-select').value = state.notation.degreeScaleMode;
      saveNotationSettings();
      renderDegreeScaleChips();
    };
    c.appendChild(b);
  });
}
function applyDegreeConfigToUI() {
  populateDegreeKeySelect();
  populateDegreeScaleSelect();
  $('degree-key-select').value = state.notation.degreeKey || 'C';
  setActiveSegment('degree-quality-segment', 'degreeQuality',
                    state.notation.degreeChordQuality || 'major');
  $('degree-scale-select').value = state.notation.degreeScaleMode || 'ionian';
  renderDegreeScaleChips();
  setActiveSegment('degree-range-mode-segment', 'degreeRangeMode',
                    state.notation.degreeRangeMode || 'auto');
}

function populatePianoPresetSelect() {
  for (const selId of ['piano-preset-select', 'eq-piano-select']) {
    const sel = $(selId);
    if (sel.options.length) continue;
    for (const [id, spec] of Object.entries(PIANO_PRESETS)) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = spec.label;
      sel.appendChild(o);
    }
  }
}

// Set the piano preset from either entry point and keep both selects + EQ
// row label in sync.
function setPianoPreset(presetId) {
  if (!PIANO_PRESETS[presetId]) return;
  state.notation.pianoPreset = presetId;
  $('piano-preset-select').value = presetId;
  $('eq-piano-select').value = presetId;
  // Prefetch when either audio path needs it: card playback or live MIDI thru.
  if (state.notation.playSound || state.notation.midiThru !== false) {
    prefetchPianoEngine();
  }
  updateEqCurrentLabel();
  saveNotationSettings();
}
function rerenderCurrentCard() {
  if (!state.session || !state.session.lastCard) return;
  const card = state.session.lastCard;
  // Interval/degree cards re-render via their own helpers; settings changes
  // mid-session for these drills are limited (mostly clef/range), so we just
  // re-run the per-drill render.
  if (card.drill === 'interval') { renderIntervalCard(card); setupMidiForCard(card); return; }
  if (card.drill === 'degree')   { renderDegreeCard(card);   setupMidiForCard(card); return; }
  paintCardNotation(card);
  setupMidiForCard(card);
}
$('format-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.format = seg.dataset.format;
  setActiveSegment('format-segment', 'format', state.notation.format);
  updateNotationRowVisibility();
  rerenderCurrentCard();
  saveNotationSettings();
});
$('drill-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.drillType = seg.dataset.drill;
  setActiveSegment('drill-segment', 'drill', state.notation.drillType);
  updateDrillVisibility();
  updateNotationRowVisibility();
  saveNotationSettings();
});

// Interval-selection preset row.
$('interval-presets').addEventListener('click', (e) => {
  const p = e.target.dataset.intervalPreset;
  if (!p) return;
  if (p === 'all')      state.notation.intervalSelection = [...INTERVAL_CHIP_ORDER];
  else if (p === 'diatonic') state.notation.intervalSelection = [...DIATONIC_INTERVALS];
  else if (p === 'clear')    state.notation.intervalSelection = [INTERVAL_CHIP_ORDER[0]];
  renderIntervalChips();
  saveNotationSettings();
});

// Degree drill: key select + quality segment + scale picker.
$('degree-key-select').addEventListener('change', (e) => {
  const chosen = e.target.value;
  const quality = state.notation.degreeChordQuality || 'major';
  const preferred = preferredSpellingFor(chosen, quality);
  state.notation.degreeKey = preferred;
  if (preferred !== chosen) {
    $('degree-key-select').value = preferred;
    showToast(`${chosen} ${quality} notates poorly — using ${preferred} ${quality}`);
  }
  saveNotationSettings();
});
$('degree-quality-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  const newQuality = seg.dataset.degreeQuality;
  const key = state.notation.degreeKey || 'C';
  const preferredKey = preferredSpellingFor(key, newQuality);
  state.notation.degreeChordQuality = newQuality;
  if (preferredKey !== key) {
    state.notation.degreeKey = preferredKey;
    $('degree-key-select').value = preferredKey;
    showToast(`${key} ${newQuality} notates poorly — using ${preferredKey} ${newQuality}`);
  }
  setActiveSegment('degree-quality-segment', 'degreeQuality',
                    state.notation.degreeChordQuality);
  saveNotationSettings();
});
$('degree-range-mode-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  setDegreeRangeMode(seg.dataset.degreeRangeMode);
});

function setDegreeRangeMode(mode) {
  if (mode !== 'auto' && mode !== 'custom') return;
  state.notation.degreeRangeMode = mode;
  setActiveSegment('degree-range-mode-segment', 'degreeRangeMode', mode);
  if ($('live-degree-range-segment')) {
    setActiveSegment('live-degree-range-segment', 'degreeRangeMode', mode);
  }
  if ($('degree-range-display')) {
    $('degree-range-display').textContent = mode === 'auto' ? 'Auto' : 'Custom';
  }
  saveNotationSettings();
  // Live re-anchor: if we're mid-degree-session, rebuild the anchor with the
  // new range and replay the chord intro so the user re-orients.
  if (state.session && state.session.degreeAnchor) {
    const anchor = buildDegreeSessionAnchor();
    if (anchor) {
      state.session.degreeAnchor = anchor;
      state.session.degreeIntroPlayed = false;
      // If the current card is a degree card, rebuild it from the new anchor.
      if (state.session.lastCard && state.session.lastCard.drill === 'degree') {
        const card = buildDegreeCard();
        if (card) {
          state.session.lastCard = card;
          renderCard(card);
        }
      }
    }
  }
}
$('degree-scale-select').addEventListener('change', (e) => {
  const id = e.target.value;
  const preset = SCALE_PRESETS[id];
  if (!preset) {
    // 'custom' — leave degrees alone, just mark mode.
    state.notation.degreeScaleMode = 'custom';
  } else {
    state.notation.degreeScaleMode = id;
    state.notation.degreeScaleDegrees = [...preset.degrees];
  }
  saveNotationSettings();
  renderDegreeScaleChips();
});

// Phrase drill — bars / interaction / rhythm pickers.
$('phrase-bars-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.phraseBars = parseInt(seg.dataset.phraseBars, 10) || 1;
  setActiveSegment('phrase-bars-segment', 'phraseBars', String(state.notation.phraseBars));
  saveNotationSettings();
});
$('phrase-interaction-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.phraseInteraction = seg.dataset.phraseInteraction;
  setActiveSegment('phrase-interaction-segment', 'phraseInteraction', state.notation.phraseInteraction);
  saveNotationSettings();
});
$('phrase-rests-switch').addEventListener('click', () => {
  const prevMax = phraseDensityRange(
    state.notation.phraseAllowedDurations, state.notation.phraseRestsIncluded !== false
  ).max;
  state.notation.phraseRestsIncluded = state.notation.phraseRestsIncluded === false;
  $('phrase-rests-switch').classList.toggle('on', state.notation.phraseRestsIncluded);
  syncPhraseMaxNotesSlider(prevMax);   // rests toggle moves the min; re-clamp
  saveNotationSettings();
});

