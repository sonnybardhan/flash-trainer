// ============================================================
// app.js — session lifecycle, settings UI handlers,
//   metronome, history, persistence, init.
//
// Notation rendering + range picker live in notation.js,
// loaded before this file so its functions are in scope.
// ============================================================

// ============================================================
// Data — spelling roster
// ============================================================
// Each entry is a distinct selectable spelling. Same pitch class
// can appear twice with different spellings (e.g. C# and Db).
const SPELLINGS = [
  { id: 'C',  display: 'C'  },
  { id: 'C#', display: 'C#' },
  { id: 'Db', display: 'Db' },
  { id: 'D',  display: 'D'  },
  { id: 'Eb', display: 'Eb' },
  { id: 'E',  display: 'E'  },
  { id: 'F',  display: 'F'  },
  { id: 'F#', display: 'F#' },
  { id: 'Gb', display: 'Gb' },
  { id: 'G',  display: 'G'  },
  { id: 'G#', display: 'G#' },
  { id: 'Ab', display: 'Ab' },
  { id: 'A',  display: 'A'  },
  { id: 'Bb', display: 'Bb' },
  { id: 'B',  display: 'B'  }
];
const SPELLING_IDS = SPELLINGS.map(s => s.id);
// Sharp-key roots (key signatures with 1–6 sharps): G, D, A, E, B, F#
const SHARP_IDS = ['G', 'D', 'A', 'E', 'B', 'F#'];
// Flat-key roots (key signatures with 1–6 flats): F, Bb, Eb, Ab, Db, Gb
const FLAT_IDS = ['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb'];

const QUALITIES = ['major', 'minor', 'diminished', 'augmented'];
const INVERSIONS = ['root', '1st', '2nd'];
const STRESS_WEIGHTS = { low: 2, medium: 3, high: 5 };

