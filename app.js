// ============================================================
// app.js — session lifecycle, settings UI handlers,
//   metronome, history, persistence, init.
//
// Notation rendering + range picker live in notation.js,
// loaded before this file so its functions are in scope.
// ============================================================

// ============================================================
// Data — spelling roster
// ============================================================
// Each entry is a distinct selectable spelling. Same pitch class
// can appear twice with different spellings (e.g. C# and Db).
const SPELLINGS = [
  { id: 'C',  display: 'C'  },
  { id: 'C#', display: 'C#' },
  { id: 'Db', display: 'Db' },
  { id: 'D',  display: 'D'  },
  { id: 'Eb', display: 'Eb' },
  { id: 'E',  display: 'E'  },
  { id: 'F',  display: 'F'  },
  { id: 'F#', display: 'F#' },
  { id: 'Gb', display: 'Gb' },
  { id: 'G',  display: 'G'  },
  { id: 'G#', display: 'G#' },
  { id: 'Ab', display: 'Ab' },
  { id: 'A',  display: 'A'  },
  { id: 'Bb', display: 'Bb' },
  { id: 'B',  display: 'B'  }
];
const SPELLING_IDS = SPELLINGS.map(s => s.id);
// Sharp-key roots (key signatures with 1–6 sharps): G, D, A, E, B, F#
const SHARP_IDS = ['G', 'D', 'A', 'E', 'B', 'F#'];
// Flat-key roots (key signatures with 1–6 flats): F, Bb, Eb, Ab, Db, Gb
const FLAT_IDS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

const QUALITIES = ['major', 'minor', 'diminished', 'augmented'];
const INVERSIONS = ['root', '1st', '2nd'];
const STRESS_WEIGHTS = { low: 2, medium: 3, high: 5 };

// ============================================================
// State
// ============================================================
const state = {
  selectedSpellings: new Set(SPELLING_IDS),
  selectedQualities: new Set(['major', 'minor']),
  selectedInversions: new Set(['root']),
  focusItems: [],
  metronome: { enabled: false, bpm: 80, meter: 4, accent: true },
  steppers: { count: 50, time: 10, seconds: 4, beats: 4, bars: 1, bpm: 80 },
  theme: 'dark',
  session: null,
  // Notation Mode settings (§12 defaults)
  notation: {
    drillType: 'chords',         // chords | intervals | degrees
    intervalSelection: ['m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7'],
    degreeKey: 'C',              // single root spelling (e.g. 'C', 'F#', 'Bb')
    degreeChordQuality: 'major', // major | minor
    degreeScaleMode: 'ionian',   // see SCALE_PRESETS below; 'custom' when user-edited
    degreeScaleDegrees: ['1','2','3','4','5','6','7'],
    format: 'notation',          // text | notation | both
    clef: 'treble',              // treble | bass | both
    voicing: 'closed',           // closed | open | mixed
    doubleRootInBass: false,
    articulation: 'block',       // block | arpeggio | mixed
    arpeggioDirection: 'up',     // up | down | mixed
    accidentals: 'onNotation',   // keySig | onNotation
    rangeLow: 'C4',
    rangeHigh: 'A5',
    showName: 'tapToReveal',     // off | afterDelay | tapToReveal | always
    labelStyle: 'plain',         // plain | slash | figured
    unconventionalSpellings: false,
    playSound: false,            // piano audio on each card (lazy loads engine)
    pianoPreset: 'fluidr3',      // see PIANO_PRESETS in sound.js
    eq: { preset: 'warm', bassDb: 3, midDb: 0, trebleDb: -4, reverb: 10 },  // see EQ_PRESETS in sound.js
    midiThru: true,              // route MIDI input through the piano engine
    midiIgnoreOctaves: false,    // accept any octave as long as voicing order matches
    degreeRangeMode: 'auto'      // 'auto' (P4 below root → octave + M3 above) | 'custom' (use rangeLow/High)
  }
};

// ============================================================
// DOM helpers
// ============================================================
const $ = (id) => document.getElementById(id);

function formatSpellingHTML(id) {
  if (id.includes('#')) return id[0] + '<span style="margin-left:1px;">♯</span>';
  if (id.length > 1 && id[1] === 'b') return id[0] + '<span style="margin-left:1px;">♭</span>';
  return id;
}

function formatSpellingDisplay(id) {
  if (id.includes('#')) return id[0] + '<span class="accidental">♯</span>';
  if (id.length > 1 && id[1] === 'b') return id[0] + '<span class="accidental">♭</span>';
  return id;
}

function formatInversion(i) {
  if (i === 'root') return 'root';
  return i + ' inv';
}



// ============================================================
// Stepper component
// ============================================================
function buildStepper(elId, value, onChange) {
  const el = $(elId);
  const min = +el.dataset.min;
  const max = +el.dataset.max;
  const step = +el.dataset.step;

  el.innerHTML = `
    <button class="stepper-minus">−</button>
    <div class="stepper-value">${value}</div>
    <button class="stepper-plus">+</button>
  `;

  const valueEl = el.querySelector('.stepper-value');
  const minusBtn = el.querySelector('.stepper-minus');
  const plusBtn = el.querySelector('.stepper-plus');

  let current = value;
  let holdTimer = null;
  let holdInterval = null;

  const update = (newVal) => {
    newVal = Math.max(min, Math.min(max, newVal));
    if (newVal === current) return;
    current = newVal;
    const cur = el.querySelector('.stepper-value');
    if (cur) cur.textContent = current;
    onChange(current);
    minusBtn.disabled = current <= min;
    plusBtn.disabled = current >= max;
  };

  const startHold = (direction) => {
    update(current + direction * step);
    holdTimer = setTimeout(() => {
      holdInterval = setInterval(() => update(current + direction * step), 80);
    }, 350);
  };
  const stopHold = () => {
    clearTimeout(holdTimer);
    clearInterval(holdInterval);
    holdTimer = null;
    holdInterval = null;
  };

  minusBtn.addEventListener('mousedown', () => startHold(-1));
  minusBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(-1); });
  plusBtn.addEventListener('mousedown', () => startHold(1));
  plusBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(1); });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => {
    minusBtn.addEventListener(evt, stopHold);
    plusBtn.addEventListener(evt, stopHold);
  });

  const attachValueClick = (node) => {
    node.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = current;
      input.min = min;
      input.max = max;
      node.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const v = parseInt(input.value);
        const newVal = isNaN(v) ? current : Math.max(min, Math.min(max, v));
        const newValueEl = document.createElement('div');
        newValueEl.className = 'stepper-value';
        newValueEl.textContent = newVal;
        attachValueClick(newValueEl);
        input.replaceWith(newValueEl);
        current = newVal;
        onChange(current);
        minusBtn.disabled = current <= min;
        plusBtn.disabled = current >= max;
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  };
  attachValueClick(valueEl);

  minusBtn.disabled = current <= min;
  plusBtn.disabled = current >= max;

  return { setValue: (v) => update(v), getValue: () => current };
}

// ============================================================
// Rendering
// ============================================================
function renderRootChips() {
  const c = $('root-chips');
  c.innerHTML = '';
  SPELLINGS.forEach((s) => {
    const b = document.createElement('button');
    b.className = 'chip' + (state.selectedSpellings.has(s.id) ? ' active' : '');
    b.innerHTML = formatSpellingHTML(s.id);
    b.onclick = () => {
      if (state.selectedSpellings.has(s.id)) state.selectedSpellings.delete(s.id);
      else state.selectedSpellings.add(s.id);
      renderRootChips();
      markCustomIfActive();
    };
    c.appendChild(b);
  });
}

function renderChips(containerId, items, selectedSet, onToggle, labelFn) {
  const c = $(containerId);
  c.innerHTML = '';
  items.forEach(item => {
    const b = document.createElement('button');
    b.className = 'chip' + (selectedSet.has(item) ? ' active' : '');
    b.innerHTML = labelFn ? labelFn(item) : item;
    b.onclick = () => { onToggle(item); renderAll(); markCustomIfActive(); };
    c.appendChild(b);
  });
}

const QUALITY_SHORT = { major: 'maj', minor: 'min', diminished: 'dim', augmented: 'aug' };
function renderQualityChips() {
  renderChips('quality-chips', QUALITIES, state.selectedQualities, (q) => {
    if (state.selectedQualities.has(q)) state.selectedQualities.delete(q);
    else state.selectedQualities.add(q);
  }, (q) => QUALITY_SHORT[q] || q);
}
function renderInversionChips() {
  renderChips('inversion-chips', INVERSIONS, state.selectedInversions, (i) => {
    if (state.selectedInversions.has(i)) state.selectedInversions.delete(i);
    else state.selectedInversions.add(i);
  }, formatInversion);
}

function renderFocusList() {
  const list = $('focus-list');
  list.innerHTML = '';
  state.focusItems.forEach((f, idx) => {
    const row = document.createElement('div');
    row.className = 'focus-item';
    const spellingOpts = SPELLINGS.map(s =>
      `<option value="${s.id}" ${s.id === f.spelling ? 'selected' : ''}>${s.display}</option>`
    ).join('');
    row.innerHTML = `
      <div class="focus-item-top">
        <select data-idx="${idx}" data-key="spelling">${spellingOpts}</select>
        <select data-idx="${idx}" data-key="quality">${QUALITIES.map(q => `<option ${q === f.quality ? 'selected' : ''}>${q}</option>`).join('')}</select>
        <select data-idx="${idx}" data-key="inversion">${INVERSIONS.map(i => `<option value="${i}" ${i === f.inversion ? 'selected' : ''}>${formatInversion(i)}</option>`).join('')}</select>
        <button class="delete" data-idx="${idx}">×</button>
      </div>
      <div class="stress-pills">
        <div class="stress-pill low ${f.stress === 'low' ? 'active' : ''}" data-idx="${idx}" data-stress="low">Low</div>
        <div class="stress-pill medium ${f.stress === 'medium' ? 'active' : ''}" data-idx="${idx}" data-stress="medium">Medium</div>
        <div class="stress-pill high ${f.stress === 'high' ? 'active' : ''}" data-idx="${idx}" data-stress="high">High</div>
      </div>
    `;
    list.appendChild(row);
  });
  list.querySelectorAll('select').forEach(sel => {
    sel.onchange = (e) => {
      const idx = +e.target.dataset.idx;
      const key = e.target.dataset.key;
      state.focusItems[idx][key] = e.target.value;
      updateCollapseMeta();
    };
  });
  list.querySelectorAll('.delete').forEach(btn => {
    btn.onclick = (e) => {
      state.focusItems.splice(+e.target.dataset.idx, 1);
      renderFocusList();
      updateCollapseMeta();
    };
  });
  list.querySelectorAll('.stress-pill').forEach(pill => {
    pill.onclick = (e) => {
      state.focusItems[+e.target.dataset.idx].stress = e.target.dataset.stress;
      renderFocusList();
    };
  });
}

function renderHistory() {
  const list = $('history-list');
  const history = JSON.parse(localStorage.getItem('triad-history') || '[]');
  $('history-clear-btn').style.display = history.length > 0 ? 'inline-block' : 'none';
  if (history.length === 0) {
    list.innerHTML = '<div class="empty">No sessions yet</div>';
    return;
  }
  list.innerHTML = '';
  // We need stable indices into the original array; map reverse-displayed index -> real index
  history.slice().reverse().forEach((h, displayIdx) => {
    const realIdx = history.length - 1 - displayIdx;
    const div = document.createElement('div');
    div.className = 'history-item';
    const date = new Date(h.startedAt);
    const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
                    ' · ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const main = h.mode === 'count'
      ? `${h.actualReps} reps`
      : `${formatDuration(h.actualDuration)}`;
    const detail = h.mode === 'count'
      ? `in ${formatDuration(h.actualDuration)}`
      : `${h.actualReps} reps`;
    div.innerHTML = `
      <div class="history-top">
        <div>
          <span class="history-main">${main}</span>
          <span class="history-detail">${detail}</span>
        </div>
        <div class="history-date">${dateStr}</div>
      </div>
      <div class="history-config">${h.config}</div>
      <div class="history-notes">
        ${h.notes && h.notes.length > 0
          ? h.notes.map(n => `
            <div class="history-note">
              <div class="history-note-time">${n.time}</div>
              ${escapeHTML(n.text)}
            </div>`).join('')
          : '<div class="empty" style="padding:8px;">No notes</div>'}
      </div>
      <button class="history-delete" data-idx="${realIdx}">Delete this session</button>
    `;
    div.onclick = (e) => {
      if (e.target.classList.contains('history-delete')) return;
      div.classList.toggle('expanded');
    };
    div.querySelector('.history-delete').onclick = (e) => {
      e.stopPropagation();
      const idx = +e.target.dataset.idx;
      const hist = JSON.parse(localStorage.getItem('triad-history') || '[]');
      const item = hist[idx];
      showModal({
        title: 'Delete this session?',
        body: `${item.mode === 'count' ? item.actualReps + ' reps' : formatDuration(item.actualDuration)} on ${new Date(item.startedAt).toLocaleDateString()}. This cannot be undone.`,
        actions: [
          { label: 'Delete', kind: 'danger', onClick: () => {
            hist.splice(idx, 1);
            localStorage.setItem('triad-history', JSON.stringify(hist));
            renderHistory();
            updateCollapseMeta();
          }},
          { label: 'Cancel', kind: 'secondary' }
        ]
      });
    };
    list.appendChild(div);
  });
}

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function renderAll() {
  renderRootChips();
  renderQualityChips();
  renderInversionChips();
  renderFocusList();
  renderHistory();
  updateCollapseMeta();
}

function updateCollapseMeta() {
  // Advance meta
  const advanceVal = $('advance-select').value;
  const labels = {
    manual: 'Tap card',
    midi: 'On correct play',
    seconds: `${state.steppers.seconds}s`,
    beats: `${state.steppers.beats} beats`,
    bars: `${state.steppers.bars} bars`
  };
  $('advance-meta').textContent = labels[advanceVal] || 'Tap card';

  // Metronome meta
  $('metro-meta').textContent = state.metronome.enabled
    ? `${state.metronome.bpm} ${state.metronome.meter}/4`
    : 'Off';

  // Focus meta
  $('focus-meta').textContent = state.focusItems.length;

  // History meta
  const historyCount = (JSON.parse(localStorage.getItem('triad-history') || '[]')).length;
  $('history-meta').textContent = historyCount;
}

// ============================================================
// Collapsibles
// ============================================================
document.querySelectorAll('.collapse-header').forEach(h => {
  h.addEventListener('click', (e) => {
    if (e.target.closest('.stepper, select, .switch, button.delete, .collapse-action')) return;
    $(h.dataset.target).classList.toggle('open');
  });
});

// History: Clear all
$('history-clear-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  showModal({
    title: 'Clear all history?',
    body: 'All session records and notes will be permanently deleted. This cannot be undone.',
    actions: [
      { label: 'Clear all', kind: 'danger', onClick: () => {
        localStorage.removeItem('triad-history');
        renderHistory();
        updateCollapseMeta();
      }},
      { label: 'Cancel', kind: 'secondary' }
    ]
  });
});

// ============================================================
// Theme
// ============================================================
function applyTheme(theme) {
  state.theme = theme;
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark', theme === 'dark');
  $('theme-toggle').textContent = theme === 'dark' ? '☼' : '☾';
  if (state.session && state.session.lastCard) {
    renderNotation(state.session.lastCard, $('card-notation'));
  }
}
$('theme-toggle').addEventListener('click', () => {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
});

// ============================================================
// Modal
// ============================================================
function showModal({ title, body, actions }) {
  $('modal-title').textContent = title;
  $('modal-body').textContent = body;
  const ac = $('modal-actions');
  ac.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.className = a.kind === 'primary' ? 'modal-btn-primary' :
                  a.kind === 'danger' ? 'modal-btn-danger' : 'modal-btn-secondary';
    b.onclick = () => {
      $('modal-backdrop').classList.remove('active');
      if (a.onClick) a.onClick();
    };
    ac.appendChild(b);
  });
  $('modal-backdrop').classList.add('active');
}

// ============================================================
// Presets, mode/advance toggles
// ============================================================
$('root-presets').addEventListener('click', (e) => {
  const p = e.target.dataset.preset;
  if (!p) return;
  if (p === 'all') {
    state.selectedSpellings = new Set(SPELLING_IDS);
  } else if (p === 'sharps') {
    state.selectedSpellings = new Set(SHARP_IDS);
  } else if (p === 'flats') {
    state.selectedSpellings = new Set(FLAT_IDS);
  } else if (p === 'clear') {
    state.selectedSpellings = new Set();
  }
  renderRootChips();
  renderFocusList();
  markCustomIfActive();
});

$('mode-select').addEventListener('change', (e) => {
  $('count-stepper').style.display = e.target.value === 'count' ? 'flex' : 'none';
  $('time-stepper').style.display = e.target.value === 'time' ? 'flex' : 'none';
  if ($('live-mode-select')) $('live-mode-select').value = e.target.value;
});
$('advance-select').addEventListener('change', () => {
  const val = $('advance-select').value;
  // Beats/bars advance has no meaning without the metronome — auto-enable it.
  if ((val === 'beats' || val === 'bars') && !state.metronome.enabled) {
    state.metronome.enabled = true;
    $('metro-switch').classList.add('on');
    $('bpm-row').style.display = 'flex';
    $('meter-row').style.display = 'flex';
    $('accent-row').style.display = 'flex';
  }
  updateAdvanceUI();
  updateCollapseMeta();
});

function updateAdvanceUI() {
  const val = $('advance-select').value;
  $('seconds-row').style.display = val === 'seconds' ? 'flex' : 'none';
  $('beats-row').style.display = val === 'beats' ? 'flex' : 'none';
  $('bars-row').style.display = val === 'bars' ? 'flex' : 'none';
}

// ============================================================
// Toast (transient bottom-center message)
// ============================================================
let _toastTimer = null;
function showToast(message, ms = 3000) {
  const el = $('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), ms);
}

// Called by midi.js whenever the connected-device set changes (or is first
// observed). Manages the "On correct play (MIDI)" advance option and handles
// mid-session disconnect.
function onMidiConnectivityChange(connectedCount, prevCount) {
  const select = $('advance-select');
  const opt = $('advance-option-midi');
  if (!select || !opt) return;
  opt.hidden = connectedCount === 0;
  const liveOpt = $('live-advance-option-midi');
  if (liveOpt) liveOpt.hidden = connectedCount === 0;
  // First connect (transitioning from 0→N): if user is sitting on Tap card,
  // upgrade to MIDI advance.
  if (connectedCount > 0 && prevCount === 0 && select.value === 'manual') {
    select.value = 'midi';
    updateAdvanceUI();
    updateCollapseMeta();
  }
  // Device went away while a session is running in MIDI mode — fall back
  // to tap + toast so the user isn't stuck.
  if (connectedCount === 0 && state.session && state.session.advance === 'midi') {
    state.session.advance = 'manual';
    select.value = 'manual';
    updateAdvanceUI();
    updateCollapseMeta();
    if (typeof updateLiveAdvanceUI === 'function') updateLiveAdvanceUI();
    showToast('MIDI device disconnected — switched to Tap card');
  } else if (connectedCount === 0 && !state.session && select.value === 'midi') {
    // Not in a session: bounce the dropdown off the now-hidden option.
    select.value = 'manual';
    updateAdvanceUI();
    updateCollapseMeta();
  }
}

$('metro-switch').addEventListener('click', () => {
  state.metronome.enabled = !state.metronome.enabled;
  $('metro-switch').classList.toggle('on', state.metronome.enabled);
  $('bpm-row').style.display = state.metronome.enabled ? 'flex' : 'none';
  $('meter-row').style.display = state.metronome.enabled ? 'flex' : 'none';
  $('accent-row').style.display = state.metronome.enabled ? 'flex' : 'none';
  updateCollapseMeta();
});
$('accent-switch').addEventListener('click', () => {
  state.metronome.accent = !state.metronome.accent;
  $('accent-switch').classList.toggle('on', state.metronome.accent);
});
$('meter-select').addEventListener('change', (e) => {
  state.metronome.meter = +e.target.value;
  updateCollapseMeta();
});

// Display mode (text vs notation) toggle
function setActiveSegment(segmentId, attr, value) {
  document.querySelectorAll(`#${segmentId} .segment`).forEach(s => {
    s.classList.toggle('active', s.dataset[attr] === value);
  });
}
function updateNotationRowVisibility() {
  const ns = state.notation;
  const drill = ns.drillType || 'chords';
  const isChord = drill === 'chords';
  const isInterval = drill === 'intervals';
  const isDegree = drill === 'degrees';
  const isNotation = ns.format === 'notation';
  // Clef / accidentals / unconventional / range: always relevant for drills
  // that render notation (chords[notation], intervals always, degrees on reveal).
  const showStaffSettings = isChord ? isNotation : true;
  $('clef-row').style.display          = showStaffSettings ? 'flex' : 'none';
  $('accidentals-row').style.display   = showStaffSettings ? 'flex' : 'none';
  $('unconventional-row').style.display = showStaffSettings ? 'flex' : 'none';
  $('range-row').style.display         = showStaffSettings ? 'flex' : 'none';
  // Articulation: chord drill (block/arpeggio chord), interval drill (block = double-stop,
  // arpeggio = sequential). Hidden for degrees.
  const showArticulation = (isChord && isNotation) || isInterval;
  $('articulation-row').style.display = showArticulation ? 'flex' : 'none';
  // Direction (up/down) only applies to arpeggiated CHORD voicing — not intervals.
  const showDir = isChord && isNotation && ns.articulation !== 'block';
  $('arp-dir-row').style.display = showDir ? 'flex' : 'none';
  // Voicing / double-root / label-style: chord-drill only.
  $('voicing-row').style.display = (isChord && ns.clef === 'both') ? 'flex' : 'none';
  const showDoubleRoot = isChord && ns.clef === 'both' && ns.voicing === 'closed';
  $('double-root-row').style.display = showDoubleRoot ? 'flex' : 'none';
  $('label-style-row').style.display = (isChord && !isNotation) ? 'flex' : 'none';
  // Show-name row: chord(notation) shows chord name; intervals shows interval name;
  // degrees has its own reveal, hide row.
  $('show-name-row').style.display =
    isDegree   ? 'none' :
    isInterval ? 'flex' :
                 (isNotation ? 'flex' : 'none');
  // Difficulty / format toggles: chord-drill only.
  $('difficulty-row').style.display = isChord ? 'flex' : 'none';
  $('difficulty-custom-row').style.display =
    (isChord && activeDifficulty === null) ? 'flex' : 'none';
  const formatRow = $('format-segment').closest('.form-row');
  if (formatRow) formatRow.style.display = isChord ? 'flex' : 'none';
  // Piano preset dropdown + preview + EQ row only when sound is on.
  $('piano-preset-row').style.display = ns.playSound ? 'flex' : 'none';
  $('piano-preview-row').style.display = ns.playSound ? 'flex' : 'none';
  $('eq-row').style.display = ns.playSound ? 'flex' : 'none';
}

// ============================================================
// Difficulty presets (§11.3)
// ============================================================
const DIFFICULTY_PRESETS = {
  1: { // Beginner
    roots: ['C','D','E','F','G','A','B'],
    qualities: ['major'],
    inversions: ['root'],
    notation: { voicing: 'closed', articulation: 'block', clef: 'treble',
                accidentals: 'keySig', rangeLow: 'C4', rangeHigh: 'G5',
                showName: 'always', unconventionalSpellings: false }
  },
  2: { // Easy
    roots: ['C','D','E','F','G','A','B','C#','F#'],
    qualities: ['major','minor'],
    inversions: ['root','1st'],
    notation: { voicing: 'closed', articulation: 'block', clef: 'treble',
                accidentals: 'keySig', rangeLow: 'C4', rangeHigh: 'A5',
                showName: 'always', unconventionalSpellings: false }
  },
  3: { // Intermediate
    roots: ['C','D','E','F','G','A','B','C#','F#','G#'],
    qualities: ['major','minor','diminished'],
    inversions: ['root','1st','2nd'],
    notation: { voicing: 'closed', articulation: 'block', clef: 'treble',
                accidentals: 'onNotation', rangeLow: 'C4', rangeHigh: 'A5',
                showName: 'tapToReveal', unconventionalSpellings: false }
  },
  4: { // Advanced
    roots: SPELLING_IDS,
    qualities: ['major','minor','diminished','augmented'],
    inversions: ['root','1st','2nd'],
    notation: { voicing: 'closed', articulation: 'arpeggio', clef: 'both',
                accidentals: 'onNotation', rangeLow: 'E2', rangeHigh: 'C6',
                showName: 'tapToReveal', unconventionalSpellings: false }
  },
  5: { // Expert
    roots: SPELLING_IDS,
    qualities: ['major','minor','diminished','augmented'],
    inversions: ['root','1st','2nd'],
    notation: { voicing: 'mixed', articulation: 'mixed', clef: 'both',
                accidentals: 'onNotation', rangeLow: 'E2', rangeHigh: 'C6',
                showName: 'off', unconventionalSpellings: true }
  }
};

let difficultyConfirmed = false;     // first-time confirm gate (per page load)
let applyingPreset = false;          // suppresses Custom transition during preset apply
let activeDifficulty = null;         // 1..5 or null = Custom

function setDifficultyIndicator(level) {
  activeDifficulty = level;
  document.querySelectorAll('#difficulty-segment .segment').forEach(s => {
    s.classList.toggle('active', String(level) === s.dataset.difficulty);
  });
  $('difficulty-custom-row').style.display = level === null ? 'flex' : 'none';
}

function applyDifficultyPreset(level) {
  const p = DIFFICULTY_PRESETS[level];
  if (!p) return;
  applyingPreset = true;
  state.selectedSpellings = new Set(p.roots);
  state.selectedQualities = new Set(p.qualities);
  state.selectedInversions = new Set(p.inversions);
  Object.assign(state.notation, p.notation);
  renderRootChips();
  renderQualityChips();
  renderInversionChips();
  applyNotationSettingsToUI();
  rerenderCurrentCard();
  saveNotationSettings();
  applyingPreset = false;
  setDifficultyIndicator(level);
}

function markCustomIfActive() {
  if (applyingPreset) return;
  if (activeDifficulty !== null) setDifficultyIndicator(null);
}

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
  updateDrillVisibility();
  updateNotationRowVisibility();
}

// Show/hide drill-specific sections based on the active drill type.
// (Notation row visibility is handled by updateNotationRowVisibility, which
// is drill-aware.)
function updateDrillVisibility() {
  const drill = state.notation.drillType || 'chords';
  document.querySelectorAll('.drill-chords-only').forEach(el => {
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
  const fc = $('flash-card');
  fc.classList.toggle('format-notation', state.notation.format === 'notation');
  fc.classList.toggle('format-text', state.notation.format === 'text');
  fc.classList.toggle('notation-grand', state.notation.clef === 'both');
  if (state.notation.format === 'notation') {
    renderNotation(card, $('card-notation'));
  } else {
    $('card-notation').replaceChildren();
  }
  renderChordNameOverlay(card);
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
// Card-level "play note" button — degree drill only.
$('card-tone-replay').addEventListener('click', async (e) => {
  e.stopPropagation(); // don't bubble to .flash-card (which would advance for chord drill)
  if (!state.session || !state.session.lastCard) return;
  const card = state.session.lastCard;
  if (card.drill !== 'degree') return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  await playDegreeTone(card);
});
$('articulation-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.articulation = seg.dataset.articulation;
  setActiveSegment('articulation-segment', 'articulation', state.notation.articulation);
  updateNotationRowVisibility();
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('arp-dir-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.arpeggioDirection = seg.dataset.direction;
  setActiveSegment('arp-dir-segment', 'direction', state.notation.arpeggioDirection);
  rerenderCurrentCard();
  saveNotationSettings();
});
$('accidentals-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.accidentals = seg.dataset.accidentals;
  setActiveSegment('accidentals-segment', 'accidentals', state.notation.accidentals);
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('clef-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  const clef = seg.dataset.clef;
  state.notation.clef = clef;
  // Reset range to sensible defaults for the chosen clef.
  const d = defaultRangeForClef(clef);
  state.notation.rangeLow = d.low;
  state.notation.rangeHigh = d.high;
  updateRangeCurrentLabel();
  // Force a fresh clef pick on next render for Both mode.
  if (state.session && state.session.lastCard) delete state.session.lastCard.chordClef;
  setActiveSegment('clef-segment', 'clef', clef);
  updateNotationRowVisibility();
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('double-root-switch').addEventListener('click', () => {
  state.notation.doubleRootInBass = !state.notation.doubleRootInBass;
  $('double-root-switch').classList.toggle('on', state.notation.doubleRootInBass);
  rerenderCurrentCard();
  saveNotationSettings();
});
$('voicing-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.voicing = seg.dataset.voicing;
  // Voicing changed: invalidate any cached per-card resolutions so the new
  // voicing applies and Mixed re-rolls.
  if (state.session && state.session.lastCard) {
    delete state.session.lastCard.chordClef;
    delete state.session.lastCard.voicingResolved;
  }
  setActiveSegment('voicing-segment', 'voicing', state.notation.voicing);
  updateNotationRowVisibility();
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('unconventional-switch').addEventListener('click', () => {
  state.notation.unconventionalSpellings = !state.notation.unconventionalSpellings;
  $('unconventional-switch').classList.toggle('on', state.notation.unconventionalSpellings);
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('play-sound-switch').addEventListener('click', () => {
  state.notation.playSound = !state.notation.playSound;
  $('play-sound-switch').classList.toggle('on', state.notation.playSound);
  if (state.notation.playSound) prefetchPianoEngine();
  updateNotationRowVisibility();
  saveNotationSettings();
});
$('midi-thru-switch').addEventListener('click', () => {
  state.notation.midiThru = state.notation.midiThru === false;
  $('midi-thru-switch').classList.toggle('on', state.notation.midiThru);
  if (state.notation.midiThru) prefetchPianoEngine();
  saveNotationSettings();
});
$('midi-ignore-octaves-switch').addEventListener('click', () => {
  state.notation.midiIgnoreOctaves = !state.notation.midiIgnoreOctaves;
  $('midi-ignore-octaves-switch').classList.toggle('on', state.notation.midiIgnoreOctaves);
  saveNotationSettings();
  // Re-arm the current card's matcher with the new strictness.
  if (state.session && state.session.lastCard && typeof setupMidiForCard === 'function') {
    setupMidiForCard(state.session.lastCard);
  }
});
$('piano-preset-select').addEventListener('change', (e) => setPianoPreset(e.target.value));
$('eq-piano-select').addEventListener('change', (e) => setPianoPreset(e.target.value));
$('preview-block-btn').addEventListener('click', () => previewChord('block'));
$('preview-arp-btn').addEventListener('click', () => previewChord('arpeggio'));

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

// ============================================================
// Queue building (unchanged)
// ============================================================
// Chord spellings that have a cleaner enharmonic equivalent already in the
// roster — silently skipped from the deck so the standard spelling appears
// (e.g. Db major instead of C# major). The pitch class is still drillable
// via the other root spelling.
const EXCLUDED_COMBOS = new Set([
  'C#:major',      // -> Db major (C# major = 7 sharps, rare key)
  'G#:major',      // -> Ab major (8 sharps, not a real key)
  'Db:minor',      // -> C# minor (8 flats, not a real key)
  'Gb:minor',      // -> F# minor (9 flats)
  'Db:diminished', // -> C# diminished
  'Gb:diminished', // -> F# diminished
  'C#:augmented',  // -> Db augmented (drops G##)
  'G#:augmented',  // -> Ab augmented (drops D##)
  'Ab:diminished'  // -> G# diminished (drops Ebb, Cb)
]);
function isExcludedCombo(spelling, quality) {
  return EXCLUDED_COMBOS.has(`${spelling}:${quality}`);
}

// Enharmonic spelling pairs at each chromatic pitch class. When a (root,
// quality) combo is excluded we look here to find the cleaner spelling.
const ENHARMONIC_FLIP = {
  'C#': 'Db', 'Db': 'C#',
  'D#': 'Eb', 'Eb': 'D#',
  'F#': 'Gb', 'Gb': 'F#',
  'G#': 'Ab', 'Ab': 'G#',
  'A#': 'Bb', 'Bb': 'A#'
};

// Returns the preferred spelling for a (root, quality) combo. If the combo
// is excluded and the enharmonic equivalent is acceptable, returns that —
// otherwise returns the original spelling unchanged.
function preferredSpellingFor(spelling, quality) {
  if (!isExcludedCombo(spelling, quality)) return spelling;
  const flip = ENHARMONIC_FLIP[spelling];
  if (flip && !isExcludedCombo(flip, quality)) return flip;
  return spelling;
}

function buildQueue() {
  const base = [];
  for (const spelling of state.selectedSpellings)
    for (const q of state.selectedQualities)
      for (const i of state.selectedInversions) {
        if (isExcludedCombo(spelling, q)) continue;
        base.push({ spelling, quality: q, inversion: i, focus: null });
      }

  const queue = [...base];
  state.focusItems.forEach(f => {
    if (isExcludedCombo(f.spelling, f.quality)) return;
    const weight = STRESS_WEIGHTS[f.stress];
    const inBase = base.find(b => b.spelling === f.spelling && b.quality === f.quality && b.inversion === f.inversion);
    const copies = inBase ? weight - 1 : weight;
    for (let i = 0; i < copies; i++) {
      queue.push({ spelling: f.spelling, quality: f.quality, inversion: f.inversion, focus: f.stress });
    }
  });
  return shuffle(queue);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextCard() {
  const s = state.session;
  const drill = state.notation.drillType || 'chords';
  let card;
  if (drill === 'intervals') {
    card = buildIntervalCard();
  } else if (drill === 'degrees') {
    card = buildDegreeCard();
  } else {
    if (s.queue.length === 0) {
      s.queue = buildQueue();
      if (s.lastCard && s.queue[0] &&
          s.queue[0].spelling === s.lastCard.spelling &&
          s.queue[0].quality === s.lastCard.quality &&
          s.queue[0].inversion === s.lastCard.inversion &&
          s.queue.length > 1) {
        [s.queue[0], s.queue[1]] = [s.queue[1], s.queue[0]];
      }
    }
    card = s.queue.shift();
  }
  s.lastCard = card;
  s.cardCount++;
  s.beatsSinceCardChange = 0;
  renderCard(card);
  if (s.mode === 'count' && s.cardCount > s.target) {
    endSession();
    return;
  }
}

function progressText() {
  const s = state.session;
  if (s.mode === 'count') return `${s.cardCount} / ${s.target}`;
  if (s.mode === 'infinite') return `${s.cardCount} ∞`;
  return `${s.cardCount}`;
}

function renderCard(card) {
  const fc = $('flash-card');
  fc.classList.remove('drill-chords', 'drill-intervals', 'drill-degrees');
  const drillClass = card.drill === 'interval' ? 'drill-intervals'
                   : card.drill === 'degree'   ? 'drill-degrees'
                                               : 'drill-chords';
  fc.classList.add(drillClass);

  // Always reset shared per-card UI elements.
  const revealLabel = $('card-reveal-label');
  revealLabel.classList.remove('correct', 'wrong', 'hidden');
  revealLabel.textContent = '';
  $('card-mode-tag').textContent = '';

  if (card.drill === 'interval') {
    renderIntervalCard(card);
    $('stat-progress').textContent = progressText();
    fc.classList.remove('transition'); void fc.offsetWidth; fc.classList.add('transition');
    maybePlayIntervalAudio(card);
    setupMidiForCard(card);
    return;
  }
  if (card.drill === 'degree') {
    renderDegreeCard(card);
    $('stat-progress').textContent = progressText();
    fc.classList.remove('transition'); void fc.offsetWidth; fc.classList.add('transition');
    // First card of the session plays chord + tone; subsequent cards just tone.
    if (!state.session.degreeIntroPlayed) {
      state.session.degreeIntroPlayed = true;
      playDegreeIntroThenTone(card);
    } else {
      playDegreeTone(card);
    }
    setupMidiForCard(card);
    return;
  }

  // Chord drill — existing behavior.
  $('card-answer-chips').replaceChildren();
  renderChordLabel(card);
  const badge = $('card-focus-badge');
  if (card.focus) {
    badge.textContent = `${card.focus} priority`;
    badge.className = `card-focus-badge badge-${card.focus}`;
  } else {
    badge.className = 'card-focus-badge empty';
  }
  $('stat-progress').textContent = progressText();
  fc.classList.toggle('format-notation', state.notation.format === 'notation');
  fc.classList.toggle('format-text', state.notation.format === 'text');
  fc.classList.toggle('notation-grand', state.notation.clef === 'both');
  if (state.notation.format === 'notation') {
    renderNotation(card, $('card-notation'));
  } else {
    $('card-notation').replaceChildren();
  }
  renderChordNameOverlay(card);
  fc.classList.remove('transition');
  void fc.offsetWidth;
  fc.classList.add('transition');
  triggerPlayback(card);
  setupMidiForCard(card);
}

// Fire piano playback for the current card if the toggle is on.
// Voicing uses the active notation settings even in chord-label mode.
function triggerPlayback(card) {
  const ns = state.notation;
  if (!ns.playSound) return;
  const pitches = computePlaybackPitches(card);
  if (!pitches) return;
  const articulation = resolveArticulation(ns.articulation);
  const direction = resolveDirection(ns.arpeggioDirection);
  const bpm = state.metronome.bpm || 80;
  const meter = state.metronome.meter || 4;
  playChord(pitches, { articulation, bpm, meter, direction });
}

// ============================================================
// Metronome
// ============================================================
let audioCtx = null;
let metroState = { nextBeatTime: 0, currentBeat: 0, schedulerId: null, uiQueue: [] };
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

async function ensureAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
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

// ============================================================
// Session start / end
// ============================================================
$('start-btn').addEventListener('click', () => {
  const drill = state.notation.drillType || 'chords';
  if (drill === 'chords') {
    if (state.selectedSpellings.size === 0) {
      showModal({
        title: 'Pick at least one root',
        body: 'You need to select at least one root note to start.',
        actions: [
          { label: 'Use all', kind: 'primary', onClick: () => {
            state.selectedSpellings = new Set(SPELLING_IDS);
            renderRootChips();
          }},
          { label: 'OK', kind: 'secondary' }
        ]
      });
      return;
    }
    if (state.selectedQualities.size === 0 || state.selectedInversions.size === 0) {
      showModal({
        title: 'Almost there',
        body: 'Pick at least one chord quality and one inversion to start.',
        actions: [{ label: 'OK', kind: 'primary' }]
      });
      return;
    }
  } else if (drill === 'intervals') {
    if (!state.notation.intervalSelection || state.notation.intervalSelection.length === 0) {
      showModal({
        title: 'Pick at least one interval',
        body: 'The interval drill needs at least one interval selected.',
        actions: [{ label: 'OK', kind: 'primary' }]
      });
      return;
    }
  } else if (drill === 'degrees') {
    if (!state.notation.degreeKey || !state.notation.degreeChordQuality) {
      showModal({
        title: 'Pick a key and chord',
        body: 'Choose a key and major or minor chord for the degree drill.',
        actions: [{ label: 'OK', kind: 'primary' }]
      });
      return;
    }
    if (!Array.isArray(state.notation.degreeScaleDegrees) ||
        state.notation.degreeScaleDegrees.length === 0) {
      showModal({
        title: 'Pick at least one degree',
        body: 'The degree drill needs at least one scale degree selected.',
        actions: [{ label: 'OK', kind: 'primary' }]
      });
      return;
    }
  }

  const mode = $('mode-select').value;
  const advance = $('advance-select').value;
  const target = mode === 'count' ? state.steppers.count
                : mode === 'time'  ? state.steppers.time * 60
                                   : Infinity;

  if ((advance === 'beats' || advance === 'bars') && !state.metronome.enabled) {
    showModal({
      title: 'Metronome required',
      body: 'Advancing by beats or bars needs the metronome turned on.',
      actions: [
        { label: 'Enable metronome', kind: 'primary', onClick: () => {
          state.metronome.enabled = true;
          $('metro-switch').classList.add('on');
          $('bpm-row').style.display = 'flex';
          $('meter-row').style.display = 'flex';
          $('accent-row').style.display = 'flex';
          updateCollapseMeta();
        }},
        { label: 'Cancel', kind: 'secondary' }
      ]
    });
    return;
  }

  // Prime the AudioContext synchronously from inside the click gesture
  // so resume() is allowed when Play Sound is on but the metronome is off.
  // Also prime for interval/degree drills since their replay buttons and
  // (for degrees) chord+tone playback both need an active context.
  if (state.notation.playSound || drill !== 'chords') {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    if (drill !== 'chords') prefetchPianoEngine();
  }

  // Degree drill is chip-driven and forces manual advance. Chord and interval
  // drills both auto-cycle per the user's advance setting.
  const effectiveAdvance = (drill === 'degrees') ? 'manual' : advance;

  const degreeAnchor = drill === 'degrees' ? buildDegreeSessionAnchor() : null;
  if (drill === 'degrees' && !degreeAnchor) {
    showModal({
      title: 'Range too narrow for that chord',
      body: 'Widen the range so the triad fits, then try again.',
      actions: [{ label: 'OK', kind: 'primary' }]
    });
    return;
  }

  state.session = {
    mode, advance: effectiveAdvance, target,
    secondsPerCard: state.steppers.seconds,
    beatsPerCard: state.steppers.beats,
    barsPerCard: state.steppers.bars,
    cardCount: 0,
    beatsSinceCardChange: 0,
    queue: drill === 'chords' ? buildQueue() : [],
    lastCard: null,
    notes: [],
    startedAt: Date.now(),
    pausedDuration: 0,
    pauseStartedAt: null,
    degreeAnchor,
    degreeIntroPlayed: false
  };

  $('flashcard-view').classList.add('active');
  document.body.classList.add('session-active');
  document.body.style.overflow = 'hidden';
  // Hide the advance chip for degree drill — that drill always uses manual.
  $('advance-indicator').style.display = drill === 'degrees' ? 'none' : '';
  // Show the degree-range chip only for the degree drill.
  $('degree-range-indicator').style.display = drill === 'degrees' ? '' : 'none';
  const rangeMode = state.notation.degreeRangeMode || 'auto';
  $('degree-range-display').textContent = rangeMode === 'auto' ? 'Auto' : 'Custom';
  setActiveSegment('live-degree-range-segment', 'degreeRangeMode', rangeMode);
  updateLiveAdvanceUI();
  updateLiveSessionUI();
  nextCard();
  startTimer();
  if (effectiveAdvance === 'seconds') startAutoAdvance();
  if (state.metronome.enabled) startMetronome();
});

let timerInterval, advanceInterval;

function startTimer() {
  timerInterval = setInterval(() => {
    const s = state.session;
    if (!s || s.pauseStartedAt) return;
    const elapsed = Math.floor((Date.now() - s.startedAt - s.pausedDuration) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    $('stat-time').textContent = `${mm}:${ss}`;
    if (s.mode === 'time' && elapsed >= s.target) endSession();
  }, 250);
}

function startAutoAdvance() {
  clearInterval(advanceInterval);
  advanceInterval = setInterval(() => {
    if (state.session && !state.session.pauseStartedAt) nextCard();
  }, state.session.secondsPerCard * 1000);
}

function stopAutoAdvance() {
  clearInterval(advanceInterval);
  advanceInterval = null;
}

// Apply an in-session change to the advance mode or any of its per-mode
// values. Restarts the seconds-based interval where needed; beats/bars are
// driven by the metronome tick which reads the values live.
function applyLiveAdvanceChange() {
  if (!state.session) return;
  const a = state.session.advance;
  if (a === 'seconds') startAutoAdvance();
  else stopAutoAdvance();
  // Reset the beat counter so a switch into beats/bars doesn't fire
  // immediately based on the prior count.
  state.session.beatsSinceCardChange = 0;
  updateLiveAdvanceUI();
}

function updateLiveAdvanceUI() {
  if (!state.session) return;
  const a = state.session.advance;
  $('live-advance-select').value = a;
  $('live-seconds-row').style.display = a === 'seconds' ? 'flex' : 'none';
  $('live-beats-row').style.display   = a === 'beats'   ? 'flex' : 'none';
  $('live-bars-row').style.display    = a === 'bars'    ? 'flex' : 'none';
  const labels = {
    manual: 'Tap',
    midi:   '⌨ On play',
    seconds: `${state.session.secondsPerCard}s`,
    beats:   `${state.session.beatsPerCard} beats`,
    bars:    `${state.session.barsPerCard} bars`
  };
  $('advance-display').textContent = labels[a] || 'Tap';
  // Mirror MIDI-option visibility from the home select onto the live one.
  $('live-advance-option-midi').hidden = $('advance-option-midi').hidden;
}

$('flash-card').addEventListener('click', (e) => {
  const s = state.session;
  if (!s || s.pauseStartedAt) return;
  const card = s.lastCard;
  // Degree drill: chip-driven, never advance on card tap.
  if (card && card.drill === 'degree') {
    return;
  }
  const ns = state.notation;
  // Interval drill: tap-to-reveal toggles the interval label, then advances.
  if (card && card.drill === 'interval') {
    if (ns.showName === 'tapToReveal' && !card.nameRevealed) {
      card.nameRevealed = true;
      revealIntervalName(card);
      return;
    }
    if (s.advance === 'manual' || s.advance === 'midi') nextCard();
    return;
  }
  // Chord drill — existing behavior.
  if (ns.format === 'notation' && ns.showName === 'tapToReveal' && card && !card.nameRevealed) {
    card.nameRevealed = true;
    renderChordNameOverlay(card);
    return;
  }
  if (s.advance === 'manual' || s.advance === 'midi') nextCard();
});

// ============================================================
// Pause / notes
// ============================================================
$('pause-btn').addEventListener('click', () => {
  if (!state.session) return;
  state.session.pauseStartedAt = Date.now();
  if (state.metronome.enabled) stopMetronome();
  $('pause-overlay').classList.add('active');
  renderNotesList();
  setTimeout(() => $('note-input').focus(), 100);
});

$('resume-btn').addEventListener('click', () => {
  if (!state.session) return;
  state.session.pausedDuration += Date.now() - state.session.pauseStartedAt;
  state.session.pauseStartedAt = null;
  $('pause-overlay').classList.remove('active');
  $('note-input').value = '';
  if (state.metronome.enabled) startMetronome();
});

// iOS recovery: if the page returns from background/lock while the metronome is running,
// the AudioContext is likely suspended. Re-resume and rebase the schedule so we don't try
// to schedule clicks at past timestamps. If resume fails (no user gesture), the next tap fixes it.
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (!metroState.schedulerId || !audioCtx) return;
  await ensureAudioContext();
  if (audioCtx.state === 'running') {
    metroState.nextBeatTime = audioCtx.currentTime + 0.1;
    metroState.currentBeat = 0;
  }
});

$('save-note-btn').addEventListener('click', () => {
  const text = $('note-input').value.trim();
  if (!text) return;
  const elapsed = Math.floor((Date.now() - state.session.startedAt - state.session.pausedDuration) / 1000);
  state.session.notes.push({
    text,
    time: `${formatDuration(elapsed)} · card ${state.session.cardCount}`,
    timestamp: Date.now()
  });
  $('note-input').value = '';
  renderNotesList();
});

function renderNotesList() {
  const list = $('notes-list');
  if (!state.session.notes.length) { list.innerHTML = ''; return; }
  list.innerHTML = '<div class="notes-list-header">Notes this session</div>' +
    state.session.notes.map(n => `
      <div class="note-item">
        <div class="note-time">${n.time}</div>
        ${escapeHTML(n.text)}
      </div>
    `).join('');
}

$('end-btn').addEventListener('click', () => {
  showModal({
    title: 'End this session?',
    body: 'Your progress and notes will be saved to history.',
    actions: [
      { label: 'End session', kind: 'danger', onClick: () => endSession(true) },
      { label: 'Keep going', kind: 'secondary' }
    ]
  });
});
$('quit-x').addEventListener('click', () => endSession(false));

// Replay button: play the current card's chord on demand, even if the
// Play sound toggle is off. Audio context is primed inside this click
// gesture so resume() is allowed.
$('replay-btn').addEventListener('click', async () => {
  if (!state.session || !state.session.lastCard) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  const card = state.session.lastCard;
  if (card.drill === 'interval') {
    await replayIntervalAudio(card);
    return;
  }
  if (card.drill === 'degree') {
    await replayDegreeChord();
    return;
  }
  const pitches = computePlaybackPitches(card);
  if (!pitches) return;
  const articulation = resolveArticulation(state.notation.articulation);
  const direction = resolveDirection(state.notation.arpeggioDirection);
  const bpm = state.metronome.bpm || 80;
  const meter = state.metronome.meter || 4;
  await playChord(pitches, { articulation, bpm, meter, direction });
});

function endSession(save = true) {
  clearInterval(timerInterval);
  clearInterval(advanceInterval);
  stopMetronome();
  if (typeof stopAllPianoNotes === 'function') stopAllPianoNotes();
  if (!state.session) return;

  if (save) {
    const s = state.session;
    const totalPaused = s.pausedDuration + (s.pauseStartedAt ? Date.now() - s.pauseStartedAt : 0);
    const actualDuration = Math.floor((Date.now() - s.startedAt - totalPaused) / 1000);

    const config = [
      `${state.selectedSpellings.size} roots`,
      `${[...state.selectedQualities].join('/')}`,
      `${[...state.selectedInversions].map(formatInversion).join('/')}`,
      state.metronome.enabled ? `${state.metronome.bpm}bpm ${state.metronome.meter}/4` : '',
      state.focusItems.length ? `${state.focusItems.length} focus` : ''
    ].filter(Boolean).join(' · ');

    const record = {
      mode: s.mode,
      reps: s.mode === 'count' ? s.target : null,
      duration: s.mode === 'time' ? s.target : null,
      actualReps: Math.max(0, s.cardCount - 1),
      actualDuration,
      config,
      notes: s.notes,
      startedAt: s.startedAt
    };

    const history = JSON.parse(localStorage.getItem('triad-history') || '[]');
    history.push(record);
    localStorage.setItem('triad-history', JSON.stringify(history.slice(-100)));
  }

  state.session = null;
  $('flashcard-view').classList.remove('active');
  $('pause-overlay').classList.remove('active');
  document.body.classList.remove('session-active');
  document.body.style.overflow = '';
  renderHistory();
  updateCollapseMeta();
}

// ============================================================
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
const historyExists = (JSON.parse(localStorage.getItem('triad-history') || '[]')).length > 0;
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
