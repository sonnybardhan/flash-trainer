// ============================================================
// phrase-context.js — derive PitchContext from degree-drill inputs.
//
// Replaces CET's hand-curated PitchContextLibrary with two rules
// applied to whatever scale the user picked in the degree drill:
//
//   1. Avoid notes = scale degrees exactly a m2 above a chord tone
//      (canonical jazz "avoid note" rule).
//   2. Resolutions = each non-chord-tone → nearest chord tone(s)
//      within a M2 (stepwise resolution).
//
// Pure: takes plain data, returns a PitchContext object that
// phrase-gen.js can consume directly. See
// docs/superpowers/specs/2026-05-28-phrase-drill-design.md §3-4
// for the derivation rationale and a comparison against CET's
// hand-curated lessons (every CET lesson is matched by these rules).
// ============================================================

// Semitone offsets from the root for each degree id used by the
// degree drill. Mirrors degrees.js → DEGREE_DEFS but inlined to
// keep this module self-contained / testable.
const PHRASE_DEGREE_SEMITONE = {
  '1':  0,  'b2': 1,  '2':  2,  'b3': 3,  '3':  4,  '4':  5,
  '#4': 6,  '5':  7,  'b6': 8,  '6':  9,  'b7': 10, '7':  11
};

const REST_POLICY_STANDARD = { targetSilenceFraction: 0.12, maxSilenceFraction: 0.25 };
const REST_POLICY_NONE     = { targetSilenceFraction: 0.0,  maxSilenceFraction: 0.0  };

// Chord-tone semitones (offsets from root) for the chord quality.
// v1 supports major / minor; extensions to dim/aug land here later
// without touching anything else.
function chordToneSemitones(quality) {
  switch (quality) {
    case 'minor':      return [0, 3, 7];           // 1 b3 5
    case 'major':      return [0, 4, 7];           // 1 3 5
    case 'diminished': return [0, 3, 6];           // 1 b3 b5
    case 'augmented':  return [0, 4, 8];           // 1 3 #5
    default:           return [0, 4, 7];
  }
}

// Build the PitchContext from the user's degree-drill selections.
//
//   degreeIds: array of degree-id strings, e.g. ['1','2','3','4','5','6','7'].
//   quality:   'major' | 'minor' (rest of qualities accepted but only major/minor
//              are exposed in the UI today).
//   options:   { restPolicy, includesUpperTonic } — both optional.
//
// Returns the shape phrase-gen.js expects.
function buildPhraseContext(degreeIds, quality, options = {}) {
  const restPolicy        = options.restPolicy        ?? REST_POLICY_STANDARD;
  const includesUpperTonic = options.includesUpperTonic ?? true;

  // Sort the available pool low-to-high. Use a stable order; degree IDs map
  // to semitones via PHRASE_DEGREE_SEMITONE.
  const available = degreeIds
    .filter(id => PHRASE_DEGREE_SEMITONE.hasOwnProperty(id))
    .map(id => PHRASE_DEGREE_SEMITONE[id])
    .sort((a, b) => a - b);

  // Chord tones — keep only those that are actually in the available pool.
  // A user could pick a pentatonic without the 3rd; we don't invent the 3rd.
  const rawChord = chordToneSemitones(quality);
  const chordTones = rawChord.filter(s => available.includes(s));

  // Rule 1: avoid notes = pool members exactly a m2 above a chord tone.
  const chordSet = new Set(chordTones);
  const avoidNotes = available.filter(s => chordSet.has(s - 1));

  // Rule 2: resolution targets per non-chord-tone.
  //
  // The upper tonic is only counted as a resolution target when it
  // forms a half-step (leading-tone) resolution — otherwise we keep
  // resolutions within the original octave. This matches CET's
  // distinction between B → C in major (leading tone, m2 up via the
  // upper tonic) and Bb → G in minor pentatonic (b7 resolves down a
  // m3 to 5, NOT up a M2 to the upper tonic).
  const dist = (from, to) => Math.abs(to - from);
  const pcOf = (c) => ((c % 12) + 12) % 12;

  const resolvesTo = {};
  for (const s of available) {
    if (chordSet.has(s)) continue;

    // 1. m2 to an in-octave chord tone (the strongest resolution).
    let pool = chordTones.filter(c => dist(c, s) === 1);
    // 2. m2 up to the upper tonic (leading-tone case).
    if (pool.length === 0 && includesUpperTonic) {
      const upper = tonicForLeadingTone(s);
      if (upper != null) pool = [upper];
    }
    // 3. M2 to any in-octave chord tone (no leading tone qualifies here).
    if (pool.length === 0) {
      pool = chordTones.filter(c => dist(c, s) === 2);
    }
    // 4. Fallback: single nearest in-octave chord tone, regardless of distance.
    if (pool.length === 0) {
      const nearest = chordTones.slice().sort((a, b) => dist(a, s) - dist(b, s))[0];
      if (nearest != null) pool = [nearest];
    }
    const targets = Array.from(new Set(pool.map(pcOf))).sort((a, b) => a - b);
    if (targets.length > 0) resolvesTo[s] = targets;
  }

  // Helper: return the in-pool tonic semitone (0) if `s` is one half-step
  // below the upper tonic (i.e. s + 1 === 12), null otherwise. Implements
  // "leading-tone resolution = m2 up to tonic" specifically.
  function tonicForLeadingTone(s) {
    // Tonic is always 0 in this representation; the upper tonic sits at 12.
    if (!chordSet.has(0)) return null;
    if (s + 1 === 12) return 0;
    return null;
  }

  return {
    available,
    chordTones,
    avoidNotes,
    resolvesTo,
    restPolicy,
    tonic: 0,
    includesUpperTonic
  };
}

// Convenience: build the context from rep-trainer's live notation state.
// Reads degreeScaleDegrees + degreeChordQuality directly. The caller
// supplies state to avoid hard-coupling this module to app.js globals.
function phraseContextFromNotationState(ns) {
  const ids = (ns.degreeScaleDegrees && ns.degreeScaleDegrees.length)
    ? ns.degreeScaleDegrees
    : ['1','2','3','4','5','6','7'];
  const quality = ns.degreeChordQuality || 'major';
  return buildPhraseContext(ids, quality);
}
