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
  const history = readJSON('triad-history', []);
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
      const hist = readJSON('triad-history', []);
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
  const historyCount = (readJSON('triad-history', [])).length;
  $('history-meta').textContent = historyCount;
}

