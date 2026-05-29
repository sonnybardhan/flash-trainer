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

