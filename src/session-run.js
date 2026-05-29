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

  // Degree + phrase drills are quiz-driven and force manual advance.
  // Chord and interval drills auto-cycle per the user's advance setting.
  const effectiveAdvance = (drill === 'degrees' || drill === 'phrases') ? 'manual' : advance;

  const degreeAnchor = drill === 'degrees' ? buildDegreeSessionAnchor() : null;
  if (drill === 'degrees' && !degreeAnchor) {
    showModal({
      title: 'Range too narrow for that chord',
      body: 'Widen the range so the triad fits, then try again.',
      actions: [{ label: 'OK', kind: 'primary' }]
    });
    return;
  }
  const phraseAnchor = drill === 'phrases' ? buildPhraseSessionAnchor() : null;
  if (drill === 'phrases') {
    const issue = validatePhraseConfig(phraseAnchor);
    if (issue) {
      showModal({
        title: 'Phrase config needs a tweak',
        body: issue,
        actions: [{ label: 'OK', kind: 'primary' }]
      });
      return;
    }
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
    degreeIntroPlayed: false,
    phraseAnchor,
    phraseChordIntroPlayed: false,
    // Session card history for back/forward navigation. history holds
    // every card the user has seen; historyIdx is the position they're
    // currently at. -1 = nothing rendered yet.
    history: [],
    historyIdx: -1
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
  // nextCard can end the session (e.g. phrase generator gave up).
  // Bail out before kicking off the timer / metronome so they don't
  // keep ticking with no session attached.
  if (!state.session) return;
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
  // Phrase drill (v1 stage 5): first tap reveals the staff, second advances.
  if (card && card.drill === 'phrase') {
    handlePhraseCardTap(card);
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
