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
  // If the user navigated back and a "future" card already exists in
  // history, step into that one instead of building a new one. Forward
  // through history first, then build fresh once we're at the end.
  if (s.historyIdx < s.history.length - 1) {
    s.historyIdx++;
    s.lastCard = s.history[s.historyIdx];
    s.cardCount++;
    s.beatsSinceCardChange = 0;
    renderCard(s.lastCard);
    updateNavButtons();
    return;
  }
  const drill = state.notation.drillType || 'chords';
  let card;
  if (drill === 'intervals') {
    card = buildIntervalCard();
  } else if (drill === 'degrees') {
    card = buildDegreeCard();
  } else if (drill === 'phrases') {
    card = buildPhraseCard();
    if (!card) {
      // Generator gave up — surface a clear message and stop the session
      // instead of crashing on a null card downstream.
      if (typeof showToast === 'function') {
        showToast('Couldn’t build a phrase from this scale — broaden the degrees or change the chord quality.', 5000);
      }
      endSession(false);
      return;
    }
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
  s.history.push(card);
  s.historyIdx = s.history.length - 1;
  s.cardCount++;
  s.beatsSinceCardChange = 0;
  renderCard(card);
  updateNavButtons();
  if (s.mode === 'count' && s.cardCount > s.target) {
    endSession();
    return;
  }
}

// Step back to the previously-shown card. Disabled at the front of
// history; doesn't tear anything down — the card stays in history,
// the user can step forward again.
function previousCard() {
  const s = state.session;
  if (!s || s.historyIdx <= 0) return;
  s.historyIdx--;
  s.lastCard = s.history[s.historyIdx];
  s.beatsSinceCardChange = 0;
  renderCard(s.lastCard);
  updateNavButtons();
}

// A card counts as "solved" for forward-button purposes when:
//   - degree drill: card.answered is true
//   - phrase drill in any answer-collecting mode: card.answered is true
//   - chord / interval / phrase-non-quiz: tap-to-advance is the
//     primary mechanism, so they're "solved" the moment they're
//     viewed (the user has already seen the answer or the prompt)
function cardIsSolved(card) {
  if (!card) return false;
  if (card.drill === 'degree' || card.drill === 'phrase') {
    return !!card.answered;
  }
  return true;
}

function updateNavButtons() {
  const backBtn = $('back-btn');
  const fwdBtn = $('forward-btn');
  if (!backBtn || !fwdBtn) return;
  const s = state.session;
  if (!s) {
    backBtn.disabled = true; fwdBtn.disabled = true;
    return;
  }
  backBtn.disabled = s.historyIdx <= 0;
  // Forward is enabled either when we have a future to revisit, or
  // when the current card is solved and a new card can be built.
  const hasFuture = s.historyIdx < s.history.length - 1;
  fwdBtn.disabled = !(hasFuture || cardIsSolved(s.lastCard));
}

function progressText() {
  const s = state.session;
  if (s.mode === 'count') return `${s.cardCount} / ${s.target}`;
  if (s.mode === 'infinite') return `${s.cardCount} ∞`;
  return `${s.cardCount}`;
}

