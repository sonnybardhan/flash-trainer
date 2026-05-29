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
$('back-btn').addEventListener('click', (e) => { e.stopPropagation(); previousCard(); });
$('forward-btn').addEventListener('click', (e) => { e.stopPropagation(); if (!$('forward-btn').disabled) nextCard(); });

$('phrase-ref-btn').addEventListener('click', async () => {
  if (!state.session || !state.session.phraseAnchor) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  const anchor = state.session.phraseAnchor;
  const bpm = (state.metronome && state.metronome.bpm) || 80;
  await playPhraseReference({
    rootPitch: anchor.rootPitch,
    chordTones: anchor.context.chordTones,
    scaleSemitones: anchor.context.available,
    bpm
  });
});

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
  if (card.drill === 'phrase') {
    // Replay = melody only. Chord is a session intro played once; the
    // ♪ Ref button is the way to re-hear it on demand.
    const bpm = (state.metronome && state.metronome.bpm) || 80;
    await playPhrase(card.phrase, card.rootPitch, bpm);
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
  if (typeof stopInTimeRecall === 'function') stopInTimeRecall();
  if (typeof stopPhrase === 'function') stopPhrase();
  if (typeof hideOnScreenKeyboard === 'function') hideOnScreenKeyboard();
  if ($('back-btn')) $('back-btn').disabled = true;
  if ($('forward-btn')) $('forward-btn').disabled = true;
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

    const history = readJSON('triad-history', []);
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
