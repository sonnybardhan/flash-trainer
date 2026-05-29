// ============================================================
// State
// ============================================================
const state = {
  selectedSpellings: new Set(SPELLING_IDS),
  selectedQualities: new Set(['major', 'minor']),
  selectedInversions: new Set(['root']),
  focusItems: [],
  metronome: { enabled: false, bpm: 80, meter: 4, accent: true },
  steppers: { count: 50, time: 10, seconds: 4, beats: 4, bars: 1, bpm: 80 },
  theme: 'dark',
  session: null,
  // Notation Mode settings (§12 defaults)
  notation: {
    drillType: 'chords',         // chords | intervals | degrees
    intervalSelection: ['m2','M2','m3','M3','P4','TT','P5','m6','M6','m7','M7'],
    degreeKey: 'C',              // single root spelling (e.g. 'C', 'F#', 'Bb')
    degreeChordQuality: 'major', // major | minor
    degreeScaleMode: 'ionian',   // see SCALE_PRESETS below; 'custom' when user-edited
    degreeScaleDegrees: ['1','2','3','4','5','6','7'],
    format: 'notation',          // text | notation | both
    clef: 'treble',              // treble | bass | both
    voicing: 'closed',           // closed | open | mixed
    doubleRootInBass: false,
    articulation: 'block',       // block | arpeggio | mixed
    arpeggioDirection: 'up',     // up | down | mixed
    accidentals: 'onNotation',   // keySig | onNotation
    rangeLow: 'C4',
    rangeHigh: 'A5',
    showName: 'tapToReveal',     // off | afterDelay | tapToReveal | always
    labelStyle: 'plain',         // plain | slash | figured
    unconventionalSpellings: false,
    playSound: false,            // piano audio on each card (lazy loads engine)
    pianoPreset: 'fluidr3',      // see PIANO_PRESETS in sound.js
    eq: { preset: 'warm', bassDb: 3, midDb: 0, trebleDb: -4, reverb: 10 },  // see EQ_PRESETS in sound.js
    midiThru: true,              // route MIDI input through the piano engine
    midiIgnoreOctaves: false,    // accept any octave as long as voicing order matches
    degreeRangeMode: 'auto',     // 'auto' (P4 below root → octave + M3 above) | 'custom' (use rangeLow/High)
    phraseBars: 1,               // 1 | 2 | 4
    phraseInteraction: 'aural-free',  // aural-free | aural-intime | sing | id-degrees
    phraseAllowedDurations: ['quarter','half','eighthPair'],
    phraseRestsIncluded: true    // mirrors CET's allowRests boolean
  }
};

