// ============================================================
// intervals.js — notation-reading interval drill.
//
// Behaves like the chord drill: two pitches drawn on the staff,
// auto-cycle per the user's advance setting (tap / N seconds /
// N beats / N bars). The user reads the interval visually and
// optionally plays / sings it.
//
// User-controlled toggles (shared with the chord drill UI):
//   - Show interval name (off / tap / always)
//   - Play sound (on/off)
//   - Articulation: block = double stop (both notes together),
//                    arpeggio = sequential (one after the other)
//
// Card pool is drawn from state.notation.intervalSelection.
// ============================================================

const INTERVAL_DEFS = [
  { id: 'm2', label: 'm2', semitones: 1,  letterSteps: 1 },
  { id: 'M2', label: 'M2', semitones: 2,  letterSteps: 1 },
  { id: 'm3', label: 'm3', semitones: 3,  letterSteps: 2 },
  { id: 'M3', label: 'M3', semitones: 4,  letterSteps: 2 },
  { id: 'P4', label: 'P4', semitones: 5,  letterSteps: 3 },
  { id: 'TT', label: 'TT', semitones: 6,  letterSteps: 3 }, // letter step varies by direction
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

const INTERVAL_ROOT_SPELLINGS = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'Bb', 'B'
];

function _randInt(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function buildIntervalCard() {
  const ns = state.notation;
  const loSemi = pitchSemitones(parsePitchName(ns.rangeLow));
  const hiSemi = pitchSemitones(parsePitchName(ns.rangeHigh));
  const enabledIds = (ns.intervalSelection && ns.intervalSelection.length)
    ? ns.intervalSelection.filter(id => INTERVAL_BY_ID[id])
    : INTERVAL_DEFS.map(d => d.id);
  const lastId = state.session && state.session.lastCard && state.session.lastCard.drill === 'interval'
    ? state.session.lastCard.intervalId : null;
  for (let attempt = 0; attempt < 80; attempt++) {
    // Prefer a different interval than the previous card when more than one is enabled.
    let pool = enabledIds;
    if (lastId && enabledIds.length > 1 && attempt < 30) {
      pool = enabledIds.filter(id => id !== lastId);
    }
    const id = pool[_randInt(0, pool.length - 1)];
    const intervalDef = INTERVAL_BY_ID[id];
    const spelling = INTERVAL_ROOT_SPELLINGS[_randInt(0, INTERVAL_ROOT_SPELLINGS.length - 1)];
    const root = parseSpelling(spelling);
    const candidateOctaves = [];
    for (let oct = 1; oct <= 7; oct++) {
      const s = pitchSemitones({ ...root, octave: oct });
      if (s >= loSemi && s <= hiSemi) candidateOctaves.push(oct);
    }
    if (candidateOctaves.length === 0) continue;
    const rootPitch = { ...root, octave: candidateOctaves[_randInt(0, candidateOctaves.length - 1)] };
    const dirs = Math.random() < 0.5 ? ['up', 'down'] : ['down', 'up'];
    for (const direction of dirs) {
      const target = computeIntervalTarget(rootPitch, intervalDef, direction);
      const tSemi = pitchSemitones(target);
      if (tSemi >= loSemi && tSemi <= hiSemi && Math.abs(target.accidental) <= 2) {
        const [lowPitch, highPitch] = pitchSemitones(rootPitch) < tSemi
          ? [rootPitch, target] : [target, rootPitch];
        return {
          drill: 'interval',
          rootPitch, targetPitch: target,
          lowPitch, highPitch,
          intervalId: id,
          direction,
          nameRevealed: false
        };
      }
    }
  }
  // Fallback: M3 from middle of range.
  const midSemi = Math.floor((loSemi + hiSemi) / 2);
  const rootPitch = { letter: 'C', accidental: 0, octave: Math.max(1, Math.floor(midSemi / 12)) };
  const target = computeIntervalTarget(rootPitch, INTERVAL_BY_ID.M3, 'up');
  return {
    drill: 'interval',
    rootPitch, targetPitch: target,
    lowPitch: rootPitch, highPitch: target,
    intervalId: 'M3', direction: 'up', nameRevealed: false
  };
}

function intervalRevealText(card) {
  const arrow = card.direction === 'down' ? '↓' : '↑';
  return `${card.intervalId} ${arrow}`;
}

// Set the reveal label according to the show-name setting.
function revealIntervalName(card) {
  const label = $('card-reveal-label');
  const showName = state.notation.showName;
  label.classList.remove('correct', 'wrong');
  label.textContent = intervalRevealText(card);
  if (showName === 'always') {
    label.classList.remove('hidden');
  } else if (showName === 'tapToReveal') {
    if (card.nameRevealed) label.classList.remove('hidden');
    else label.classList.add('hidden');
  } else {
    label.classList.add('hidden');
  }
}

function renderIntervalCard(card) {
  $('card-notation').replaceChildren();
  $('card-answer-chips').replaceChildren();
  const articulation = resolveArticulation(state.notation.articulation);
  card.renderedArticulation = articulation;
  // Block displays the interval as a stacked dyad; arpeggio shows the two
  // pitches sequentially. Pass root-first ordering so direction (up/down) is
  // visible in arpeggio mode.
  if (articulation === 'block') {
    renderTwoNoteStave(card.lowPitch, card.highPitch, $('card-notation'), 'block');
  } else {
    renderTwoNoteStave(card.rootPitch, card.targetPitch, $('card-notation'), 'arpeggio');
  }
  revealIntervalName(card);
}

// Block = play both pitches together (double stop). Arpeggio = sequential.
async function playIntervalAudio(card) {
  const articulation = resolveArticulation(state.notation.articulation);
  const bpm = state.metronome.bpm || 80;
  const beatSec = 60 / bpm;
  if (articulation === 'block') {
    await playSequence([[card.lowPitch, card.highPitch]], 0, beatSec * 2);
    return;
  }
  // arpeggio: play root then target (preserves card's original direction).
  const seq = [card.rootPitch, card.targetPitch];
  await playSequence(seq, beatSec * 0.6, beatSec * 0.55);
}

async function replayIntervalAudio(card) {
  await playIntervalAudio(card);
}

function maybePlayIntervalAudio(card) {
  if (!state.notation.playSound) return;
  playIntervalAudio(card);
}
