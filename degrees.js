// ============================================================
// degrees.js — degree-recognition drill.
//
// Plays a chord (major or minor, per the card's mode) followed
// by a single test tone, both via the shared playSequence sound
// path. The user identifies the tone's scale degree relative
// to the chord. Each card's mode is drawn from the active
// degreeModes setting; answer chips union the degrees across
// enabled modes.
//
// Depends on globals from notation.js (pitchSemitones,
// parseSpelling, parsePitchName, chordTones, placeChordInRange,
// renderTriadPlusTone, LETTERS) and app.js (state, $).
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
const DEGREE_ORDER = ['1','b2','2','b3','3','4','#4','5','b6','6','b7','7'];

const MODE_DEFS = {
  ionian:     { chordQuality: 'major', label: 'Ionian',     degrees: ['1','2','3','4','5','6','7']   },
  lydian:     { chordQuality: 'major', label: 'Lydian',     degrees: ['1','2','3','#4','5','6','7']  },
  mixolydian: { chordQuality: 'major', label: 'Mixolydian', degrees: ['1','2','3','4','5','6','b7']  },
  dorian:     { chordQuality: 'minor', label: 'Dorian',     degrees: ['1','2','b3','4','5','6','b7'] },
  phrygian:   { chordQuality: 'minor', label: 'Phrygian',   degrees: ['1','b2','b3','4','5','b6','b7'] },
  aeolian:    { chordQuality: 'minor', label: 'Aeolian',    degrees: ['1','2','b3','4','5','b6','b7'] }
};

// Roots to draw from. Same standard 15-spelling pool as the interval drill.
const DEGREE_ROOT_SPELLINGS = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'Bb', 'B'
];

function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

// Compute the test tone's pitch from a chord root + degree, placed within
// one octave above the chord root.
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

function buildDegreeCard() {
  const ns = state.notation;
  const enabledModes = (ns.degreeModes && ns.degreeModes.length)
    ? ns.degreeModes
    : ['ionian'];
  const loSemi = pitchSemitones(parsePitchName(ns.rangeLow));
  const hiSemi = pitchSemitones(parsePitchName(ns.rangeHigh));
  const maxAttempts = 60;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const modeId = enabledModes[randInt(0, enabledModes.length - 1)];
    const mode = MODE_DEFS[modeId];
    const spelling = DEGREE_ROOT_SPELLINGS[randInt(0, DEGREE_ROOT_SPELLINGS.length - 1)];
    // Place the chord in range using the existing closed-voicing placement.
    const triad = placeChordInRange(spelling, mode.chordQuality, 'root', ns.rangeLow, ns.rangeHigh);
    if (!triad) continue;
    // Apply enharmonic substitution unless the user wants strict spellings.
    const triadPitches = substituteAll(triad, { spelling, quality: mode.chordQuality });
    const rootPitch = triadPitches[0];
    const degreeId = mode.degrees[randInt(0, mode.degrees.length - 1)];
    const tonePitch = computeDegreeTone(rootPitch, degreeId);
    const toneSemi = pitchSemitones(tonePitch);
    // Tone may sit above rangeHigh by up to ~one octave — fine for ear training.
    // Reject only if accidentals get gnarly.
    if (Math.abs(tonePitch.accidental) > 2) continue;
    return {
      drill: 'degree',
      modeId, modeLabel: mode.label,
      spelling, chordQuality: mode.chordQuality,
      triadPitches, rootPitch,
      tonePitch, degreeId,
      answered: false
    };
  }
  // Fallback: C major Ionian, degree 5
  const triad = placeChordInRange('C', 'major', 'root', 'C3', 'C5')
                || [{letter:'C',accidental:0,octave:4},{letter:'E',accidental:0,octave:4},{letter:'G',accidental:0,octave:4}];
  const tone = { letter: 'G', accidental: 0, octave: 4 };
  return {
    drill: 'degree', modeId: 'ionian', modeLabel: 'Ionian',
    spelling: 'C', chordQuality: 'major',
    triadPitches: triad, rootPitch: triad[0],
    tonePitch: tone, degreeId: '5', answered: false
  };
}

// Build chips for the union of degrees across enabled modes, in chromatic order.
function activeDegreeChipIds() {
  const enabled = (state.notation.degreeModes && state.notation.degreeModes.length)
    ? state.notation.degreeModes : ['ionian'];
  const set = new Set();
  enabled.forEach(m => MODE_DEFS[m].degrees.forEach(d => set.add(d)));
  return DEGREE_ORDER.filter(id => set.has(id));
}

function renderDegreeAnswerChips(card) {
  const c = $('card-answer-chips');
  c.replaceChildren();
  const ids = activeDegreeChipIds();
  ids.forEach(id => {
    const b = document.createElement('button');
    b.className = 'answer-chip';
    b.dataset.degreeId = id;
    b.textContent = DEGREE_DEFS[id].label;
    b.onclick = () => handleDegreeAnswer(card, id);
    c.appendChild(b);
  });
}

function degreeRevealText(card) {
  return DEGREE_DEFS[card.degreeId].label;
}

function handleDegreeAnswer(card, pickedId) {
  if (card.answered) return;
  card.answered = true;
  card.userPicked = pickedId;
  const correct = pickedId === card.degreeId;
  card.correct = correct;
  const allChips = $('card-answer-chips').querySelectorAll('.answer-chip');
  allChips.forEach(c => {
    c.classList.add('disabled');
    if (c.dataset.degreeId === card.degreeId) c.classList.add('correct');
    if (!correct && c.dataset.degreeId === pickedId) c.classList.add('wrong');
  });
  // Reveal staff (chord + tone) and label.
  renderTriadPlusTone(card.triadPitches, card.tonePitch, $('card-notation'));
  const label = $('card-reveal-label');
  label.textContent = degreeRevealText(card);
  label.classList.remove('hidden', 'wrong', 'correct');
  label.classList.add(correct ? 'correct' : 'wrong');
  if (state.session) {
    state.session.degreeStats = state.session.degreeStats || { right: 0, total: 0 };
    state.session.degreeStats.total++;
    if (correct) state.session.degreeStats.right++;
  }
}

function renderDegreeCard(card) {
  $('card-notation').replaceChildren();
  $('card-answer-chips').replaceChildren();
  // Pre-answer: notation is blank, mode + chord-quality tag shown above.
  const tag = $('card-mode-tag');
  tag.textContent = `${card.modeLabel} · ${card.chordQuality}`;
  renderDegreeAnswerChips(card);
  const label = $('card-reveal-label');
  label.textContent = '';
  label.classList.add('hidden');
  label.classList.remove('wrong', 'correct');
}

async function playDegreeChordAndTone(card) {
  const bpm = state.metronome.bpm || 80;
  const beatSec = 60 / bpm;
  // Chord plays as a block, then ~1.5 beats later the test tone plays.
  await playSequence([card.triadPitches, card.tonePitch], beatSec * 1.6, beatSec * 1.3);
}

async function replayDegreeChord(card) {
  await playSequence([card.triadPitches], 0.5, 1.3);
}
