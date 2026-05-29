// ============================================================
// Difficulty presets (§11.3)
// ============================================================
const DIFFICULTY_PRESETS = {
  1: { // Beginner
    roots: ['C','D','E','F','G','A','B'],
    qualities: ['major'],
    inversions: ['root'],
    notation: { voicing: 'closed', articulation: 'block', clef: 'treble',
                accidentals: 'keySig', rangeLow: 'C4', rangeHigh: 'G5',
                showName: 'always', unconventionalSpellings: false }
  },
  2: { // Easy
    roots: ['C','D','E','F','G','A','B','C#','F#'],
    qualities: ['major','minor'],
    inversions: ['root','1st'],
    notation: { voicing: 'closed', articulation: 'block', clef: 'treble',
                accidentals: 'keySig', rangeLow: 'C4', rangeHigh: 'A5',
                showName: 'always', unconventionalSpellings: false }
  },
  3: { // Intermediate
    roots: ['C','D','E','F','G','A','B','C#','F#','G#'],
    qualities: ['major','minor','diminished'],
    inversions: ['root','1st','2nd'],
    notation: { voicing: 'closed', articulation: 'block', clef: 'treble',
                accidentals: 'onNotation', rangeLow: 'C4', rangeHigh: 'A5',
                showName: 'tapToReveal', unconventionalSpellings: false }
  },
  4: { // Advanced
    roots: SPELLING_IDS,
    qualities: ['major','minor','diminished','augmented'],
    inversions: ['root','1st','2nd'],
    notation: { voicing: 'closed', articulation: 'arpeggio', clef: 'both',
                accidentals: 'onNotation', rangeLow: 'E2', rangeHigh: 'C6',
                showName: 'tapToReveal', unconventionalSpellings: false }
  },
  5: { // Expert
    roots: SPELLING_IDS,
    qualities: ['major','minor','diminished','augmented'],
    inversions: ['root','1st','2nd'],
    notation: { voicing: 'mixed', articulation: 'mixed', clef: 'both',
                accidentals: 'onNotation', rangeLow: 'E2', rangeHigh: 'C6',
                showName: 'off', unconventionalSpellings: true }
  }
};

let difficultyConfirmed = false;     // first-time confirm gate (per page load)
let applyingPreset = false;          // suppresses Custom transition during preset apply
let activeDifficulty = null;         // 1..5 or null = Custom

function setDifficultyIndicator(level) {
  activeDifficulty = level;
  document.querySelectorAll('#difficulty-segment .segment').forEach(s => {
    s.classList.toggle('active', String(level) === s.dataset.difficulty);
  });
  $('difficulty-custom-row').style.display = level === null ? 'flex' : 'none';
}

function applyDifficultyPreset(level) {
  const p = DIFFICULTY_PRESETS[level];
  if (!p) return;
  applyingPreset = true;
  state.selectedSpellings = new Set(p.roots);
  state.selectedQualities = new Set(p.qualities);
  state.selectedInversions = new Set(p.inversions);
  Object.assign(state.notation, p.notation);
  renderRootChips();
  renderQualityChips();
  renderInversionChips();
  applyNotationSettingsToUI();
  rerenderCurrentCard();
  saveNotationSettings();
  applyingPreset = false;
  setDifficultyIndicator(level);
}

function markCustomIfActive() {
  if (applyingPreset) return;
  if (activeDifficulty !== null) setDifficultyIndicator(null);
}

