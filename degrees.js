// ============================================================
// degrees.js — degree-recognition drill.
//
// The session has one fixed key + chord quality. The chord
// plays once at session start. From then on, only single test
// tones from the chord's diatonic scale play. The user picks
// the scale degree (1..7) from chips; wrong picks stay disabled
// (red) while others remain live, so the user keeps trying
// until they get it right. The card auto-advances on a correct
// pick.
//
// Major chord -> Ionian scale degrees: 1, 2, 3, 4, 5, 6, 7.
// Minor chord -> natural minor degrees: 1, 2, b3, 4, 5, b6, b7.
// ============================================================

const DEGREE_DEFS = {
  '1':  { semitones: 0,  letterSteps: 0,  label: '1' },
  'b2': { semitones: 1,  letterSteps: 1,  label: '♭2' },
  '2':  { semitones: 2,  letterSteps: 1,  label: '2' },
  'b3': { semitones: 3,  letterSteps: 2,  label: '♭3' },
  '3':  { semitones: 4,  letterSteps: 2,  label: '3' },
  '4':  { semitones: 5,  letterSteps: 3,  label: '4' },
  '#4': { semitones: 6,  letterSteps: 3,  label: '♯4' },
  '5':  { semitones: 7,  letterSteps: 4,  label: '5' },
  'b6': { semitones: 8,  letterSteps: 5,  label: '♭6' },
  '6':  { semitones: 9,  letterSteps: 5,  label: '6' },
  'b7': { semitones: 10, letterSteps: 6,  label: '♭7' },
  '7':  { semitones: 11, letterSteps: 6,  label: '7' }
};
// Visual ordering for chips matches chromatic order so layouts stay stable
// regardless of which scale the user picks.
const DEGREE_VISUAL_ORDER = ['1','b2','2','b3','3','4','#4','5','b6','6','b7','7'];

function orderedDegrees(degreeSet) {
  const s = new Set(degreeSet);
  return DEGREE_VISUAL_ORDER.filter(d => s.has(d));
}

function computeDegreeTone(rootPitch, degreeId) {
  const def = DEGREE_DEFS[degreeId];
  const targetSemi = pitchSemitones(rootPitch) + def.semitones;
  const rootLetterIdx = LETTERS.indexOf(rootPitch.letter);
  const rawLetterIdx = rootLetterIdx + def.letterSteps;
  const letterIdx = ((rawLetterIdx % 7) + 7) % 7;
  const octShift = Math.floor(rawLetterIdx / 7);
  const octave = rootPitch.octave + octShift;
  const letter = LETTERS[letterIdx];
  const natural = pitchSemitones({ letter, accidental: 0, octave });
  return { letter, accidental: targetSemi - natural, octave };
}

// Compute the auto range for a degree-drill key: P4 below the root through
// (octave + M3) above the root. Returns pitch-name strings ready for
// placeChordInRange.
const _SHARP_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function _semiToPitchName(semi) {
  const oct = Math.floor(semi / 12);
  return _SHARP_NAMES[((semi % 12) + 12) % 12] + oct;
}
function autoRangeForDegreeKey(key, baseOctave = 4) {
  const root = parseSpelling(key);
  const rootSemi = baseOctave * 12 + LETTER_SEMI[root.letter] + root.accidental;
  return {
    low:  _semiToPitchName(rootSemi - 5),       // P4 below root
    high: _semiToPitchName(rootSemi + 12 + 4)   // octave + M3 above root
  };
}

// Build the session's anchor chord. Called once per session, when the user
// hits Begin and the drill is 'degrees'.
function buildDegreeSessionAnchor() {
  const ns = state.notation;
  const quality = ns.degreeChordQuality || 'major';
  // If the saved key+quality is one of the awkward enharmonic combos
  // (e.g. G# major, Db minor), silently flip to the cleaner spelling.
  const rawKey = ns.degreeKey || 'C';
  const key = (typeof preferredSpellingFor === 'function')
    ? preferredSpellingFor(rawKey, quality) : rawKey;
  if (key !== rawKey) {
    ns.degreeKey = key;
    const sel = $('degree-key-select');
    if (sel) sel.value = key;
  }
  let rangeLow, rangeHigh;
  if (ns.degreeRangeMode === 'custom') {
    rangeLow = ns.rangeLow; rangeHigh = ns.rangeHigh;
  } else {
    const r = autoRangeForDegreeKey(key);
    rangeLow = r.low; rangeHigh = r.high;
  }
  const triad = placeChordInRange(key, quality, 'root', rangeLow, rangeHigh)
                 || placeChordInRange(key, quality, 'root', 'C3', 'C6');
  if (!triad) return null;
  const triadPitches = substituteAll(triad, { spelling: key, quality });
  // Snapshot the scale at session start so settings changes mid-session
  // don't shift the drill pool unexpectedly.
  const scaleDegrees = orderedDegrees(ns.degreeScaleDegrees && ns.degreeScaleDegrees.length
                                       ? ns.degreeScaleDegrees
                                       : ['1','2','3','4','5','6','7']);
  return {
    key, quality, triadPitches, rootPitch: triadPitches[0],
    scaleDegrees, scaleMode: ns.degreeScaleMode || 'custom'
  };
}

function buildDegreeCard() {
  const anchor = state.session && state.session.degreeAnchor;
  if (!anchor) return null;
  const allowed = anchor.scaleDegrees;
  const lastId = state.session.lastCard && state.session.lastCard.drill === 'degree'
    ? state.session.lastCard.degreeId : null;
  let pool = allowed;
  if (lastId && allowed.length > 1) pool = allowed.filter(d => d !== lastId);
  const degreeId = pool[Math.floor(Math.random() * pool.length)];
  const tonePitch = computeDegreeTone(anchor.rootPitch, degreeId);
  return {
    drill: 'degree',
    key: anchor.key,
    quality: anchor.quality,
    scaleDegrees: anchor.scaleDegrees,
    scaleMode: anchor.scaleMode,
    triadPitches: anchor.triadPitches,
    rootPitch: anchor.rootPitch,
    tonePitch,
    degreeId,
    wrongPicks: [],
    answered: false
  };
}

const _SCALE_LABELS_SHORT = {
  ionian: 'Ionian', dorian: 'Dorian', phrygian: 'Phrygian',
  lydian: 'Lydian', mixolydian: 'Mixolydian', aeolian: 'Aeolian',
  locrian: 'Locrian', harmonicMinor: 'Harmonic min', melodicMinor: 'Melodic min',
  majorPentatonic: 'Maj pent', minorPentatonic: 'Min pent',
  blues: 'Blues', chromatic: 'Chromatic', custom: 'Custom'
};

function renderDegreeAnswerChips(card) {
  const c = $('card-answer-chips');
  c.replaceChildren();
  card.scaleDegrees.forEach(id => {
    const b = document.createElement('button');
    b.className = 'answer-chip';
    b.dataset.degreeId = id;
    b.textContent = DEGREE_DEFS[id].label;
    b.onclick = () => handleDegreeAnswer(card, id);
    c.appendChild(b);
  });
}

function _qualityWord(q) { return q === 'minor' ? 'minor' : 'major'; }
function _formatKey(id) {
  if (id.includes('#')) return id[0] + '♯';
  if (id.length > 1 && id[1] === 'b') return id[0] + '♭';
  return id;
}

function handleDegreeAnswer(card, pickedId) {
  if (card.answered) return;
  const correct = pickedId === card.degreeId;
  const chip = $('card-answer-chips').querySelector(
    `.answer-chip[data-degree-id="${pickedId}"]`
  );
  if (!correct) {
    if (card.wrongPicks.includes(pickedId)) return;
    card.wrongPicks.push(pickedId);
    if (chip) chip.classList.add('wrong', 'disabled');
    return;
  }
  card.answered = true;
  card.correct = true;
  if (typeof updateNavButtons === 'function') updateNavButtons();
  const allChips = $('card-answer-chips').querySelectorAll('.answer-chip');
  allChips.forEach(c => {
    c.classList.add('disabled');
    if (c.dataset.degreeId === card.degreeId) c.classList.add('correct');
  });
  renderTriadPlusTone(card.triadPitches, card.tonePitch, $('card-notation'));
  const label = $('card-reveal-label');
  label.textContent = DEGREE_DEFS[card.degreeId].label;
  label.classList.remove('hidden', 'wrong');
  label.classList.add('correct');
  if (state.session) {
    state.session.degreeStats = state.session.degreeStats || { right: 0, total: 0, mistakes: 0 };
    state.session.degreeStats.total++;
    state.session.degreeStats.right++;
    state.session.degreeStats.mistakes += card.wrongPicks.length;
  }
  setTimeout(() => {
    if (state.session && state.session.lastCard === card) {
      nextCard();
    }
  }, 850);
}

function renderDegreeCard(card) {
  $('card-notation').replaceChildren();
  $('card-answer-chips').replaceChildren();
  const tag = $('card-mode-tag');
  const scaleLabel = _SCALE_LABELS_SHORT[card.scaleMode] || 'Custom';
  tag.textContent = `${_formatKey(card.key)} ${_qualityWord(card.quality)} · ${scaleLabel}`;
  renderDegreeAnswerChips(card);
  const label = $('card-reveal-label');
  label.textContent = '';
  label.classList.add('hidden');
  label.classList.remove('wrong', 'correct');
}

async function playDegreeChord() {
  const anchor = state.session && state.session.degreeAnchor;
  if (!anchor) return;
  await playSequence([anchor.triadPitches], 0, 1.6);
}

async function playDegreeTone(card) {
  await playSequence([card.tonePitch], 0, 1.1);
}

async function playDegreeIntroThenTone(card) {
  const anchor = state.session && state.session.degreeAnchor;
  if (!anchor) return;
  const bpm = state.metronome.bpm || 80;
  const gap = 60 / bpm * 1.8;
  await playSequence([anchor.triadPitches, card.tonePitch], gap, 1.2);
}

async function replayDegreeChord() {
  await playDegreeChord();
}
