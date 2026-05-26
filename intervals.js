// ============================================================
// intervals.js — notation-reading interval drill.
//
// Generates two pitches within the active range, renders them
// on the staff, and exposes answer chips for the user to pick
// the interval quality. Audio playback is optional per the
// Play sound toggle; the replay button always replays the
// two-note sequence regardless.
//
// Depends on globals from notation.js (pitchSemitones, LETTERS,
// LETTER_SEMI, renderTwoNoteStave) and app.js (state, $).
// ============================================================

// Interval pool. letterSteps = how many letter names apart the
// two pitches are spelled (the diatonic distance). For most
// intervals this is fixed by the quality; the tritone is
// rendered as #4 going up, b5 going down.
const INTERVAL_DEFS = [
  { id: 'm2', label: 'm2', semitones: 1,  letterSteps: 1 },
  { id: 'M2', label: 'M2', semitones: 2,  letterSteps: 1 },
  { id: 'm3', label: 'm3', semitones: 3,  letterSteps: 2 },
  { id: 'M3', label: 'M3', semitones: 4,  letterSteps: 2 },
  { id: 'P4', label: 'P4', semitones: 5,  letterSteps: 3 },
  { id: 'TT', label: 'TT', semitones: 6,  letterSteps: 3 }, // letter step varies by direction (see computeTarget)
  { id: 'P5', label: 'P5', semitones: 7,  letterSteps: 4 },
  { id: 'm6', label: 'm6', semitones: 8,  letterSteps: 5 },
  { id: 'M6', label: 'M6', semitones: 9,  letterSteps: 5 },
  { id: 'm7', label: 'm7', semitones: 10, letterSteps: 6 },
  { id: 'M7', label: 'M7', semitones: 11, letterSteps: 6 }
];
const INTERVAL_BY_ID = Object.fromEntries(INTERVAL_DEFS.map(d => [d.id, d]));

function intervalLetterSteps(intervalDef, direction) {
  if (intervalDef.id === 'TT') return direction === 'down' ? 4 : 3;
  return intervalDef.letterSteps;
}

// Compute the second pitch from a root pitch + interval + direction.
// Uses letter-step + semitone math so accidentals come out conventional.
function computeIntervalTarget(rootPitch, intervalDef, direction) {
  const sign = direction === 'down' ? -1 : 1;
  const targetSemi = pitchSemitones(rootPitch) + sign * intervalDef.semitones;
  const rootLetterIdx = LETTERS.indexOf(rootPitch.letter);
  const steps = intervalLetterSteps(intervalDef, direction);
  const rawLetterIdx = rootLetterIdx + sign * steps;
  const letterIdx = ((rawLetterIdx % 7) + 7) % 7;
  const octShift = Math.floor(rawLetterIdx / 7);
  const octave = rootPitch.octave + octShift;
  const letter = LETTERS[letterIdx];
  const natural = pitchSemitones({ letter, accidental: 0, octave });
  return { letter, accidental: targetSemi - natural, octave };
}

// Pool of root-pitch spellings to draw from. Using the standard 15-spelling
// list keeps accidentals readable (no triple sharps etc.).
const INTERVAL_ROOT_SPELLINGS = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'Bb', 'B'
];

function randomInRange(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

// Enumerate root candidates whose pitch class fits at any octave that puts
// the target also in range.
function buildIntervalCard() {
  const ns = state.notation;
  const loSemi = pitchSemitones(parsePitchName(ns.rangeLow));
  const hiSemi = pitchSemitones(parsePitchName(ns.rangeHigh));
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const spelling = INTERVAL_ROOT_SPELLINGS[randomInRange(0, INTERVAL_ROOT_SPELLINGS.length - 1)];
    const root = parseSpelling(spelling);
    // Random octave that puts root in range.
    const candidateOctaves = [];
    for (let oct = 1; oct <= 7; oct++) {
      const s = pitchSemitones({ ...root, octave: oct });
      if (s >= loSemi && s <= hiSemi) candidateOctaves.push(oct);
    }
    if (candidateOctaves.length === 0) continue;
    const rootPitch = { ...root, octave: candidateOctaves[randomInRange(0, candidateOctaves.length - 1)] };
    const intervalDef = INTERVAL_DEFS[randomInRange(0, INTERVAL_DEFS.length - 1)];
    // Try both directions in random order; first one in range wins.
    const dirs = Math.random() < 0.5 ? ['up', 'down'] : ['down', 'up'];
    for (const direction of dirs) {
      const target = computeIntervalTarget(rootPitch, intervalDef, direction);
      const tSemi = pitchSemitones(target);
      if (tSemi >= loSemi && tSemi <= hiSemi && Math.abs(target.accidental) <= 2) {
        // Order pitches low-to-high for the staff (direction is implicit in which is higher).
        const [lowPitch, highPitch] = pitchSemitones(rootPitch) < tSemi
          ? [rootPitch, target] : [target, rootPitch];
        return {
          drill: 'interval',
          rootPitch, targetPitch: target,
          lowPitch, highPitch,
          intervalId: intervalDef.id,
          direction,
          answered: false
        };
      }
    }
  }
  // Fallback: simple M3 above middle of range
  const midSemi = Math.floor((loSemi + hiSemi) / 2);
  const rootPitch = { letter: 'C', accidental: 0, octave: Math.floor((midSemi - 0) / 12) };
  const target = computeIntervalTarget(rootPitch, INTERVAL_BY_ID.M3, 'up');
  return {
    drill: 'interval',
    rootPitch, targetPitch: target,
    lowPitch: rootPitch, highPitch: target,
    intervalId: 'M3', direction: 'up', answered: false
  };
}

// Build the row of answer chips inside #card-answer-chips.
function renderIntervalAnswerChips(card) {
  const c = $('card-answer-chips');
  c.replaceChildren();
  INTERVAL_DEFS.forEach(def => {
    const b = document.createElement('button');
    b.className = 'answer-chip';
    b.dataset.intervalId = def.id;
    b.textContent = def.label;
    b.onclick = () => handleIntervalAnswer(card, def.id, b);
    c.appendChild(b);
  });
}

function intervalRevealText(card) {
  const arrow = card.direction === 'down' ? '↓' : '↑';
  return `${card.intervalId} ${arrow}`;
}

function handleIntervalAnswer(card, pickedId, chipEl) {
  if (card.answered) return;
  card.answered = true;
  card.userPicked = pickedId;
  const correct = pickedId === card.intervalId;
  card.correct = correct;
  // Mark chips.
  const allChips = $('card-answer-chips').querySelectorAll('.answer-chip');
  allChips.forEach(c => {
    c.classList.add('disabled');
    if (c.dataset.intervalId === card.intervalId) c.classList.add('correct');
    if (!correct && c.dataset.intervalId === pickedId) c.classList.add('wrong');
  });
  // Reveal label.
  const label = $('card-reveal-label');
  label.textContent = intervalRevealText(card);
  label.classList.remove('hidden', 'wrong', 'correct');
  label.classList.add(correct ? 'correct' : 'wrong');
  // Track stats.
  if (state.session) {
    state.session.intervalStats = state.session.intervalStats || { right: 0, total: 0 };
    state.session.intervalStats.total++;
    if (correct) state.session.intervalStats.right++;
  }
}

// Initial pre-answer state of the reveal label (hidden when interval-name
// toggle is off, visible when on).
function renderIntervalRevealPreview(card) {
  const label = $('card-reveal-label');
  const showName = state.notation.showName;
  if (showName === 'always') {
    label.textContent = intervalRevealText(card);
    label.classList.remove('hidden', 'wrong', 'correct');
  } else {
    label.textContent = intervalRevealText(card); // ensure space reserved
    label.classList.add('hidden');
    label.classList.remove('wrong', 'correct');
  }
}

function renderIntervalCard(card) {
  $('card-notation').replaceChildren();
  $('card-answer-chips').replaceChildren();
  renderTwoNoteStave(card.lowPitch, card.highPitch, $('card-notation'));
  renderIntervalAnswerChips(card);
  renderIntervalRevealPreview(card);
}

// Replay button action — plays the two-note sequence in original direction.
async function replayIntervalAudio(card) {
  const bpm = state.metronome.bpm || 80;
  const gap = Math.max(0.35, 60 / bpm * 0.6);
  await playSequence([card.rootPitch, card.targetPitch], gap, gap * 0.95);
}

// Auto-play after card change if the play-sound toggle is on.
function maybePlayIntervalAudio(card) {
  if (!state.notation.playSound) return;
  replayIntervalAudio(card);
}
