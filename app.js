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
    unconventionalSpellings: false
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
  const isNotation = ns.format === 'notation';
  $('clef-row').style.display = isNotation ? 'flex' : 'none';
  // Voicing only meaningful in Both (single-staff modes force Closed, §3.2).
  $('voicing-row').style.display = isNotation && ns.clef === 'both' ? 'flex' : 'none';
  $('articulation-row').style.display = isNotation ? 'flex' : 'none';
  const showDir = isNotation && ns.articulation !== 'block';
  $('arp-dir-row').style.display = showDir ? 'flex' : 'none';
  $('accidentals-row').style.display = isNotation ? 'flex' : 'none';
  $('unconventional-row').style.display = isNotation ? 'flex' : 'none';
  $('range-row').style.display = isNotation ? 'flex' : 'none';
  $('show-name-row').style.display = isNotation ? 'flex' : 'none';
  // Double root only meaningful in Both + Closed.
  const showDoubleRoot = isNotation && ns.clef === 'both' && ns.voicing === 'closed';
  $('double-root-row').style.display = showDoubleRoot ? 'flex' : 'none';
  // Label style applies to chord-label mode (and will apply to notation reveal later).
  $('label-style-row').style.display = !isNotation ? 'flex' : 'none';
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
  updateRangeCurrentLabel();
  updateNotationRowVisibility();
}
function rerenderCurrentCard() {
  if (state.session && state.session.lastCard) {
    const fc = $('flash-card');
    fc.classList.toggle('format-notation', state.notation.format === 'notation');
    fc.classList.toggle('format-text', state.notation.format === 'text');
    fc.classList.toggle('notation-grand', state.notation.clef === 'both');
    if (state.notation.format === 'notation') {
      renderNotation(state.session.lastCard, $('card-notation'));
    } else {
      $('card-notation').replaceChildren();
    }
    renderChordNameOverlay(state.session.lastCard);
  }
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
function buildQueue() {
  const base = [];
  for (const spelling of state.selectedSpellings)
    for (const q of state.selectedQualities)
      for (const i of state.selectedInversions)
        base.push({ spelling, quality: q, inversion: i, focus: null });

  const queue = [...base];
  state.focusItems.forEach(f => {
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
  const card = s.queue.shift();
  s.lastCard = card;
  s.cardCount++;
  s.beatsSinceCardChange = 0;
  renderCard(card);
  if (s.mode === 'count' && s.cardCount > s.target) {
    endSession();
    return;
  }
}



function renderCard(card) {
  renderChordLabel(card);
  const badge = $('card-focus-badge');
  if (card.focus) {
    badge.textContent = `${card.focus} priority`;
    badge.className = `card-focus-badge badge-${card.focus}`;
  } else {
    badge.className = 'card-focus-badge empty';
  }
  $('stat-progress').textContent = state.session.mode === 'count'
    ? `${state.session.cardCount} / ${state.session.target}`
    : `${state.session.cardCount}`;
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
  fc.classList.remove('transition');
  void fc.offsetWidth;
  fc.classList.add('transition');
}

// ============================================================
// Metronome
// ============================================================
let audioCtx = null;
let metroState = { nextBeatTime: 0, currentBeat: 0, schedulerId: null, uiQueue: [] };
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1;

async function ensureAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
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
});

// ============================================================
// Session start / end
// ============================================================
$('start-btn').addEventListener('click', () => {
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

  const mode = $('mode-select').value;
  const advance = $('advance-select').value;
  const target = mode === 'count' ? state.steppers.count : state.steppers.time * 60;

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

  state.session = {
    mode, advance, target,
    secondsPerCard: state.steppers.seconds,
    beatsPerCard: state.steppers.beats,
    barsPerCard: state.steppers.bars,
    cardCount: 0,
    beatsSinceCardChange: 0,
    queue: buildQueue(),
    lastCard: null,
    notes: [],
    startedAt: Date.now(),
    pausedDuration: 0,
    pauseStartedAt: null
  };

  $('flashcard-view').classList.add('active');
  document.body.classList.add('session-active');
  document.body.style.overflow = 'hidden';
  nextCard();
  startTimer();
  if (advance === 'seconds') startAutoAdvance();
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

$('flash-card').addEventListener('click', () => {
  const s = state.session;
  if (!s || s.pauseStartedAt) return;
  const ns = state.notation;
  // Tap-to-reveal: in notation mode, first tap reveals the name; in manual
  // advance the second tap advances. In time-based advance, tap only reveals.
  if (ns.format === 'notation' && ns.showName === 'tapToReveal' && s.lastCard && !s.lastCard.nameRevealed) {
    s.lastCard.nameRevealed = true;
    renderChordNameOverlay(s.lastCard);
    return;
  }
  if (s.advance === 'manual') nextCard();
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

function endSession(save = true) {
  clearInterval(timerInterval);
  clearInterval(advanceInterval);
  stopMetronome();
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
stepperRefs.count = buildStepper('count-stepper', state.steppers.count, (v) => { state.steppers.count = v; });
stepperRefs.time = buildStepper('time-stepper', state.steppers.time, (v) => { state.steppers.time = v; });
stepperRefs.seconds = buildStepper('seconds-stepper', state.steppers.seconds, (v) => { state.steppers.seconds = v; updateCollapseMeta(); });
stepperRefs.beats = buildStepper('beats-stepper', state.steppers.beats, (v) => { state.steppers.beats = v; updateCollapseMeta(); });
stepperRefs.bars = buildStepper('bars-stepper', state.steppers.bars, (v) => { state.steppers.bars = v; updateCollapseMeta(); });
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
