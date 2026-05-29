function renderCard(card) {
  if (!card) return;  // upstream returned null (e.g. generator gave up)
  const fc = $('flash-card');
  fc.classList.remove('drill-chords', 'drill-intervals', 'drill-degrees');
  const drillClass = card.drill === 'interval' ? 'drill-intervals'
                   : card.drill === 'degree'   ? 'drill-degrees'
                   : card.drill === 'phrase'   ? 'drill-phrases'
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
    retriggerTransition(fc);
    maybePlayIntervalAudio(card);
    setupMidiForCard(card);
    return;
  }
  if (card.drill === 'degree') {
    renderDegreeCard(card);
    $('stat-progress').textContent = progressText();
    retriggerTransition(fc);
    // First card of the session plays chord + tone; subsequent cards just tone.
    if (!state.session.degreeIntroPlayed) {
      state.session.degreeIntroPlayed = true;
      playDegreeIntroThenTone(card);
    } else if (!card.answered) {
      // Already-solved cards don't replay the tone — they restore visuals.
      playDegreeTone(card);
    }
    // Restore the solved-state view if the user navigated back here.
    if (card.answered && typeof renderTriadPlusTone === 'function') {
      renderTriadPlusTone(card.triadPitches, card.tonePitch, $('card-notation'));
      const label = $('card-reveal-label');
      if (label && typeof DEGREE_DEFS !== 'undefined') {
        label.textContent = (DEGREE_DEFS[card.degreeId] || {}).label || '';
        label.classList.remove('hidden', 'wrong');
        label.classList.add('correct');
      }
      // Mark the correct chip + disable all so user sees the past answer.
      $('card-answer-chips').querySelectorAll('.answer-chip').forEach(c => {
        c.classList.add('disabled');
        if (c.dataset.degreeId === card.degreeId) c.classList.add('correct');
      });
    }
    setupMidiForCard(card);
    return;
  }
  if (card.drill === 'phrase') {
    renderPhraseCard(card);
    $('stat-progress').textContent = progressText();
    retriggerTransition(fc);
    // Already-solved cards (navigated back to): show the staff
    // immediately, skip the playback + matcher arming.
    if (card.answered || card.revealed) {
      if (typeof revealPhraseCard === 'function') revealPhraseCard(card);
    } else {
      playPhraseCard(card);
      setupMidiForCard(card);
    }
    if (typeof showOnScreenKeyboardFor === 'function') showOnScreenKeyboardFor(card);
    if ($('phrase-ref-btn')) $('phrase-ref-btn').style.display = '';
    return;
  }
  // Non-phrase drills: ensure the keyboard + reference button are hidden.
  if (typeof hideOnScreenKeyboard === 'function') hideOnScreenKeyboard();
  if ($('phrase-ref-btn')) $('phrase-ref-btn').style.display = 'none';

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
  paintCardNotation(card);
  retriggerTransition(fc);
  triggerPlayback(card);
  setupMidiForCard(card);
}

// Paint the staff (or clear it, in text mode) for a chord card and sync the
// flash-card's format/clef classes. Shared by renderCard and the mid-session
// re-render path (rerenderCurrentCard) so the rules live in one place.
function paintCardNotation(card) {
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

