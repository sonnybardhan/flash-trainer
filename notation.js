// ============================================================
// notation.js — pitch math, chord voicings, key signatures,
//   VexFlow rendering, chord label formatting, range picker.
//
// Depends on globals from app.js: state, $, formatSpellingDisplay,
//   setActiveSegment, updateNotationRowVisibility, rerenderCurrentCard,
//   saveNotationSettings, markCustomIfActive.
// Depends on vexflow.js: window.Vex.
// ============================================================

// Build the HTML for a chord tone display (handles double accidentals).
function toneToDisplayHTML(tone) {
  let accHTML = '';
  if (tone.accidental > 0) accHTML = '<span class="accidental">♯</span>'.repeat(tone.accidental);
  else if (tone.accidental < 0) accHTML = '<span class="accidental">♭</span>'.repeat(-tone.accidental);
  return tone.letter + accHTML;
}

const QUALITY_SUFFIX = { major: '', minor: 'm', diminished: '°', augmented: '+' };

// ============================================================
// Notation engine — pitch math
// ============================================================
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function parseSpelling(id) {
  let letter = id[0];
  let acc = 0;
  for (let i = 1; i < id.length; i++) {
    if (id[i] === '#') acc++;
    else if (id[i] === 'b') acc--;
  }
  return { letter, accidental: acc };
}

function parsePitchName(s) {
  let letter = s[0];
  let i = 1;
  let acc = 0;
  while (i < s.length && (s[i] === '#' || s[i] === 'b')) {
    acc += s[i] === '#' ? 1 : -1;
    i++;
  }
  return { letter, accidental: acc, octave: parseInt(s.slice(i), 10) };
}

function pitchSemitones(p) {
  return p.octave * 12 + LETTER_SEMI[p.letter] + p.accidental;
}

function chordTones(spelling, quality) {
  const root = parseSpelling(spelling);
  const rootLetterIdx = LETTERS.indexOf(root.letter);
  const rootSt = LETTER_SEMI[root.letter] + root.accidental;

  // third: letter+2, quality of third depends on chord quality
  const thirdLetter = LETTERS[(rootLetterIdx + 2) % 7];
  const thirdInterval = (quality === 'major' || quality === 'augmented') ? 4 : 3;
  const thirdTargetMod = ((rootSt + thirdInterval) % 12 + 12) % 12;
  let thirdAcc = thirdTargetMod - LETTER_SEMI[thirdLetter];
  if (thirdAcc < -6) thirdAcc += 12;
  if (thirdAcc > 6) thirdAcc -= 12;

  // fifth: letter+4, quality of fifth depends on chord quality
  const fifthLetter = LETTERS[(rootLetterIdx + 4) % 7];
  let fifthInterval = 7;
  if (quality === 'diminished') fifthInterval = 6;
  else if (quality === 'augmented') fifthInterval = 8;
  const fifthTargetMod = ((rootSt + fifthInterval) % 12 + 12) % 12;
  let fifthAcc = fifthTargetMod - LETTER_SEMI[fifthLetter];
  if (fifthAcc < -6) fifthAcc += 12;
  if (fifthAcc > 6) fifthAcc -= 12;

  return [
    { letter: root.letter, accidental: root.accidental, role: 'root' },
    { letter: thirdLetter, accidental: thirdAcc, role: 'third' },
    { letter: fifthLetter, accidental: fifthAcc, role: 'fifth' }
  ];
}

function buildClosedVoicing(spelling, quality, inversion, baseOctave) {
  const tones = chordTones(spelling, quality);
  let order;
  if (inversion === 'root') order = [tones[0], tones[1], tones[2]];
  else if (inversion === '1st') order = [tones[1], tones[2], tones[0]];
  else order = [tones[2], tones[0], tones[1]];

  const out = [];
  let prevSemi = -Infinity;
  let octave = baseOctave;
  for (const t of order) {
    let candidate = pitchSemitones({ ...t, octave });
    while (candidate <= prevSemi) {
      octave++;
      candidate = pitchSemitones({ ...t, octave });
    }
    out.push({ ...t, octave });
    prevSemi = candidate;
  }
  return out;
}

function placeChordInRange(spelling, quality, inversion, rangeLow, rangeHigh) {
  const lowSemi = pitchSemitones(parsePitchName(rangeLow));
  const highSemi = pitchSemitones(parsePitchName(rangeHigh));
  for (let oct = 1; oct <= 7; oct++) {
    const pitches = buildClosedVoicing(spelling, quality, inversion, oct);
    const loSemi = pitchSemitones(pitches[0]);
    const hiSemi = pitchSemitones(pitches[pitches.length - 1]);
    if (loSemi >= lowSemi && hiSemi <= highSemi) return pitches;
  }
  return null;
}

// Open voicing ("Spread 3" with the convention agreed for inversions):
//   Root: bass = root + 5th (P5), treble = 3rd
//   1st:  bass = 3rd alone,       treble = 5th + root (closed)
//   2nd:  bass = 5th alone,       treble = root + 3rd (closed)
// Returns { bassTones, trebleTones } as ordered chord-tone arrays (no octaves yet).
function openVoicingLayout(spelling, quality, inversion) {
  const [root, third, fifth] = chordTones(spelling, quality);
  if (inversion === 'root') return { bassTones: [root, fifth], trebleTones: [third] };
  if (inversion === '1st')  return { bassTones: [third],       trebleTones: [fifth, root] };
  return                          { bassTones: [fifth],       trebleTones: [root, third] };
}

// Place an ordered set of tones in the lowest octave that puts all of them within [lo, hi].
// Tones stack within an octave (closed) — used per-staff for open voicings.
function placeTonesInRange(tones, rangeLow, rangeHigh) {
  const lowSemi = pitchSemitones(parsePitchName(rangeLow));
  const highSemi = pitchSemitones(parsePitchName(rangeHigh));
  for (let oct = 1; oct <= 7; oct++) {
    const out = [];
    let prevSemi = -Infinity;
    let octave = oct;
    for (const t of tones) {
      let candidate = pitchSemitones({ ...t, octave });
      while (candidate <= prevSemi) {
        octave++;
        candidate = pitchSemitones({ ...t, octave });
      }
      out.push({ ...t, octave });
      prevSemi = candidate;
    }
    const loS = pitchSemitones(out[0]);
    const hiS = pitchSemitones(out[out.length - 1]);
    if (loS >= lowSemi && hiS <= highSemi) return out;
  }
  return null;
}

function placeOpenVoicing(card, rangeLow, rangeHigh) {
  const layout = openVoicingLayout(card.spelling, card.quality, card.inversion);
  // Bass: from rangeLow up to C4. Treble: from C4 to rangeHigh.
  const splitSemi = pitchSemitones(parsePitchName('C4'));
  const bassHi = pitchSemitones(parsePitchName(rangeHigh)) > splitSemi ? 'C4' : rangeHigh;
  const trebleLo = pitchSemitones(parsePitchName(rangeLow)) < splitSemi ? 'C4' : rangeLow;
  const bass = placeTonesInRange(layout.bassTones, rangeLow, bassHi);
  const treble = placeTonesInRange(layout.trebleTones, trebleLo, rangeHigh);
  if (!bass || !treble) return null;
  return { bass, treble };
}

function accidentalString(acc) {
  if (acc === 0) return null;
  if (acc > 0) return '#'.repeat(acc);
  return 'b'.repeat(-acc);
}

function pitchToVexKey(p) {
  const accStr = accidentalString(p.accidental) || '';
  return `${p.letter.toLowerCase()}${accStr}/${p.octave}`;
}

// Enharmonic substitution for "unconventional spellings = off".
// Preserves sounding pitch (semitone) but rewrites letter/octave to
// avoid awkward spellings on the staff.
const NATURAL_BY_PC = { 0:'C', 2:'D', 4:'E', 5:'F', 7:'G', 9:'A', 11:'B' };
function substitutePitch(p) {
  if (state.notation.unconventionalSpellings) return p;
  if (p.letter === 'C' && p.accidental === -1) return { ...p, letter: 'B', accidental: 0, octave: p.octave - 1 };
  if (p.letter === 'F' && p.accidental === -1) return { ...p, letter: 'E', accidental: 0 };
  if (p.letter === 'B' && p.accidental === 1)  return { ...p, letter: 'C', accidental: 0, octave: p.octave + 1 };
  if (p.letter === 'E' && p.accidental === 1)  return { ...p, letter: 'F', accidental: 0 };
  if (Math.abs(p.accidental) >= 2) {
    const semi = pitchSemitones(p);
    const pc = ((semi % 12) + 12) % 12;
    if (pc in NATURAL_BY_PC) {
      const letter = NATURAL_BY_PC[pc];
      const octave = Math.floor((semi - LETTER_SEMI[letter]) / 12);
      return { ...p, letter, accidental: 0, octave };
    }
  }
  return p;
}
function substituteAll(pitches) {
  return pitches.map(substitutePitch);
}

// ============================================================
// Notation engine — key signatures (Mode A)
// ============================================================
// Map root spelling -> VexFlow key signature name. Only the
// standard 15 keys (each direction) are supported; anything
// else (e.g. G# major, Db/Gb minor) falls back to Mode B.
const MAJOR_KEY_SIGS = {
  'C': 'C', 'G': 'G', 'D': 'D', 'A': 'A', 'E': 'E', 'B': 'B', 'F#': 'F#', 'C#': 'C#',
  'F': 'F', 'Bb': 'Bb', 'Eb': 'Eb', 'Ab': 'Ab', 'Db': 'Db', 'Gb': 'Gb', 'Cb': 'Cb'
};
const MINOR_KEY_SIGS = {
  'A': 'Am', 'E': 'Em', 'B': 'Bm', 'F#': 'F#m', 'C#': 'C#m', 'G#': 'G#m', 'D#': 'D#m', 'A#': 'A#m',
  'D': 'Dm', 'G': 'Gm', 'C': 'Cm', 'F': 'Fm', 'Bb': 'Bbm', 'Eb': 'Ebm', 'Ab': 'Abm'
};

// For each key, the implied accidental for each letter (sharp = 1, flat = -1).
// Letters not in the map are natural (0).
const KEY_ACCIDENTALS = {
  'C':   {}, 'G':   {F:1}, 'D':   {F:1,C:1}, 'A':   {F:1,C:1,G:1}, 'E':   {F:1,C:1,G:1,D:1},
  'B':   {F:1,C:1,G:1,D:1,A:1}, 'F#':  {F:1,C:1,G:1,D:1,A:1,E:1}, 'C#':  {F:1,C:1,G:1,D:1,A:1,E:1,B:1},
  'F':   {B:-1}, 'Bb':  {B:-1,E:-1}, 'Eb':  {B:-1,E:-1,A:-1}, 'Ab':  {B:-1,E:-1,A:-1,D:-1},
  'Db':  {B:-1,E:-1,A:-1,D:-1,G:-1}, 'Gb':  {B:-1,E:-1,A:-1,D:-1,G:-1,C:-1}, 'Cb':  {B:-1,E:-1,A:-1,D:-1,G:-1,C:-1,F:-1},
  'Am':  {}, 'Em':  {F:1}, 'Bm':  {F:1,C:1}, 'F#m': {F:1,C:1,G:1}, 'C#m': {F:1,C:1,G:1,D:1},
  'G#m': {F:1,C:1,G:1,D:1,A:1}, 'D#m': {F:1,C:1,G:1,D:1,A:1,E:1}, 'A#m': {F:1,C:1,G:1,D:1,A:1,E:1,B:1},
  'Dm':  {B:-1}, 'Gm':  {B:-1,E:-1}, 'Cm':  {B:-1,E:-1,A:-1}, 'Fm':  {B:-1,E:-1,A:-1,D:-1},
  'Bbm': {B:-1,E:-1,A:-1,D:-1,G:-1}, 'Ebm': {B:-1,E:-1,A:-1,D:-1,G:-1,C:-1}, 'Abm': {B:-1,E:-1,A:-1,D:-1,G:-1,C:-1,F:-1}
};

function keySigFor(spelling, quality) {
  // Only major/minor get key signatures. Dim/aug always render with accidentals on notes (§6).
  if (quality === 'major') return MAJOR_KEY_SIGS[spelling] || null;
  if (quality === 'minor') return MINOR_KEY_SIGS[spelling] || null;
  return null;
}

function impliedAccidental(keyName, letter) {
  if (!keyName) return 0;
  return (KEY_ACCIDENTALS[keyName] || {})[letter] || 0;
}

function accidentalModifierFor(actual, implied) {
  if (actual === implied) return null;
  if (actual === 0) return 'n'; // natural cancels a key-sig sharp/flat
  return actual > 0 ? '#'.repeat(actual) : 'b'.repeat(-actual);
}

// ============================================================
// Notation engine — rendering
// ============================================================
function themeColor() {
  return getComputedStyle(document.body).getPropertyValue('--text').trim() || '#000';
}

function defaultRangeForClef(clef) {
  if (clef === 'bass') return { low: 'E2', high: 'C4' };
  if (clef === 'both') return { low: 'E2', high: 'A5' };
  return { low: 'C4', high: 'A5' };
}

// Narrow the active range to a clef's natural span (used for grand staff chord placement).
function narrowRangeForClef(lo, hi, clef) {
  const splitSemi = pitchSemitones(parsePitchName('C4'));
  if (clef === 'treble') {
    if (pitchSemitones(parsePitchName(lo)) < splitSemi) lo = 'C4';
  } else {
    if (pitchSemitones(parsePitchName(hi)) > splitSemi) hi = 'C4';
  }
  return { lo, hi };
}

// Stable per-card clef pick for Both+Closed mode (avoids flipping on re-render).
function resolveChordClef(card, clef, voicing) {
  if (clef !== 'both' || voicing !== 'closed') return null;
  if (!('chordClef' in card)) {
    card.chordClef = Math.random() < 0.5 ? 'treble' : 'bass';
  }
  return card.chordClef;
}

// Stable per-card voicing resolution. In Both+Mixed, picks closed or open once.
// Anything other than Both is forced to Closed (Open requires both staves, §3.2).
function resolveVoicing(card, clef, voicing) {
  if (clef !== 'both') return 'closed';
  if (voicing !== 'mixed') return voicing;
  if (!('voicingResolved' in card)) {
    card.voicingResolved = Math.random() < 0.5 ? 'closed' : 'open';
  }
  return card.voicingResolved;
}

function resolveArticulation(setting) {
  if (setting === 'mixed') return Math.random() < 0.5 ? 'block' : 'arpeggio';
  return setting;
}
function resolveDirection(setting) {
  if (setting === 'mixed') return Math.random() < 0.5 ? 'up' : 'down';
  return setting;
}

function makeBlockNote(VF, clef, pitches, addAcc) {
  const note = new VF.StaveNote({ clef, keys: pitches.map(pitchToVexKey), duration: 'w', auto_stem: true });
  addAcc(note, pitches);
  return note;
}
function makeArpNotes(VF, clef, pitches, direction, addAcc) {
  const ordered = direction === 'down' ? [...pitches].reverse() : pitches;
  return ordered.map(p => {
    // No auto_stem: we set a unified stem direction for the whole beam group later.
    const n = new VF.StaveNote({ clef, keys: [pitchToVexKey(p)], duration: '8' });
    addAcc(n, [p]);
    return n;
  });
}

// Pick a single stem direction for a beam group so all stems point the same
// way and the beam clears every notehead. Standard rule: the note furthest
// from the middle staff line decides — above middle -> stems down, below -> up.
// Returns the VexFlow stem direction (+1 up, -1 down) and applies it.
function unifyBeamStemDirection(notes, clef) {
  const middleSemi = clef === 'bass' ? 38 : 59; // D3 for bass, B4 for treble
  let furthest = 0;
  for (const n of notes) {
    const key = n.keys[0]; // 'c#/4', 'bb/3', etc.
    const slash = key.indexOf('/');
    const pitchPart = key.slice(0, slash);
    const oct = parseInt(key.slice(slash + 1), 10);
    const letter = pitchPart[0].toUpperCase();
    let acc = 0;
    for (let i = 1; i < pitchPart.length; i++) {
      if (pitchPart[i] === '#') acc++;
      else if (pitchPart[i] === 'b') acc--;
    }
    const semi = pitchSemitones({ letter, accidental: acc, octave: oct });
    const d = semi - middleSemi;
    if (Math.abs(d) > Math.abs(furthest)) furthest = d;
  }
  const dir = furthest > 0 ? -1 : 1;
  notes.forEach(n => n.setStemDirection(dir));
  return dir;
}
function makeWholeRest(VF, clef) {
  const key = clef === 'bass' ? 'd/3' : 'b/4';
  return new VF.StaveNote({ clef, keys: [key], duration: 'wr' });
}
function makeEighthRest(VF, clef) {
  const key = clef === 'bass' ? 'd/3' : 'b/4';
  return new VF.StaveNote({ clef, keys: [key], duration: '8r' });
}

function drawChordVoice(VF, ctx, stave, notes, articulation, width, clef) {
  const voice = articulation === 'block'
    ? new VF.Voice({ num_beats: 4, beat_value: 4 })
    : new VF.Voice({ num_beats: 3, beat_value: 8 });
  voice.addTickables(notes);
  let beam = null;
  if (articulation === 'arpeggio') {
    // Force a single stem direction across the beam group, then construct the
    // Beam BEFORE voice.draw so VexFlow marks the notes as beamed and skips
    // their flags. (generateBeams' default beat-based grouping splits 3
    // eighths into 2+1, so we build one Beam manually.)
    unifyBeamStemDirection(notes, clef);
    beam = new VF.Beam(notes);
  }
  new VF.Formatter().joinVoices([voice]).format([voice], width - 80);
  voice.draw(ctx, stave);
  if (beam) beam.setContext(ctx).draw();
}

function setupRenderer(VF, container, width, height) {
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const color = themeColor();
  ctx.setFillStyle(color);
  ctx.setStrokeStyle(color);
  return ctx;
}

function buildGrandStaff(VF, ctx, width, keyName) {
  const trebleStave = new VF.Stave(8, 8, width - 16);
  trebleStave.addClef('treble');
  if (keyName) trebleStave.addKeySignature(keyName);
  trebleStave.setContext(ctx).draw();

  const bassStave = new VF.Stave(8, 100, width - 16);
  bassStave.addClef('bass');
  if (keyName) bassStave.addKeySignature(keyName);
  bassStave.setContext(ctx).draw();

  new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
  new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
  return { trebleStave, bassStave };
}

function renderClosedGrand(card, container, ctx, VF, width, articulation, direction, keyName, addAcc, ns) {
  const { trebleStave, bassStave } = buildGrandStaff(VF, ctx, width, keyName);
  const chordClef = resolveChordClef(card, ns.clef, 'closed') || 'treble';
  const placeRange = narrowRangeForClef(ns.rangeLow, ns.rangeHigh, chordClef);
  const raw = placeChordInRange(card.spelling, card.quality, card.inversion, placeRange.lo, placeRange.hi);
  if (!raw) { renderSkip(container); return; }
  const pitches = substituteAll(raw);

  const chordNotes = articulation === 'block'
    ? [makeBlockNote(VF, chordClef, pitches, addAcc)]
    : makeArpNotes(VF, chordClef, pitches, direction, addAcc);
  const chordStave = chordClef === 'treble' ? trebleStave : bassStave;
  const otherStave = chordClef === 'treble' ? bassStave : trebleStave;
  const otherClef = chordClef === 'treble' ? 'bass' : 'treble';

  let otherNotes;
  if (ns.doubleRootInBass && chordClef === 'treble') {
    const rootTone = pitches.find(p => p.role === 'root');
    const rootInBass = { ...rootTone, octave: rootTone.octave - 1 };
    const note = new VF.StaveNote({ clef: 'bass', keys: [pitchToVexKey(rootInBass)], duration: 'w', auto_stem: true });
    addAcc(note, [rootInBass]);
    otherNotes = [note];
  } else {
    otherNotes = [makeWholeRest(VF, otherClef)];
  }

  drawChordVoice(VF, ctx, chordStave, chordNotes, articulation, width, chordClef);
  const restVoice = new VF.Voice({ num_beats: 4, beat_value: 4 });
  restVoice.addTickables(otherNotes);
  new VF.Formatter().joinVoices([restVoice]).format([restVoice], width - 80);
  restVoice.draw(ctx, otherStave);
}

function renderOpenGrand(card, container, ctx, VF, width, articulation, direction, keyName, addAcc, ns) {
  const { trebleStave, bassStave } = buildGrandStaff(VF, ctx, width, keyName);
  const raw = placeOpenVoicing(card, ns.rangeLow, ns.rangeHigh);
  if (!raw) { renderSkip(container); return; }
  const placed = { bass: substituteAll(raw.bass), treble: substituteAll(raw.treble) };

  if (articulation === 'block') {
    // Whole-note chord on each staff.
    const bassNote = makeBlockNote(VF, 'bass', placed.bass, addAcc);
    const trebleNote = makeBlockNote(VF, 'treble', placed.treble, addAcc);
    [['bass', bassStave, [bassNote]], ['treble', trebleStave, [trebleNote]]].forEach(([_, stave, notes]) => {
      const v = new VF.Voice({ num_beats: 4, beat_value: 4 });
      v.addTickables(notes);
      new VF.Formatter().joinVoices([v]).format([v], width - 80);
      v.draw(ctx, stave);
    });
    return;
  }

  // Arpeggio: 3 eighth notes total spread across staves, no beam (cross-staff, §4.4).
  // Build pitch-ordered sequence with staff tags.
  const tagged = [
    ...placed.bass.map(p => ({ pitch: p, staff: 'bass' })),
    ...placed.treble.map(p => ({ pitch: p, staff: 'treble' }))
  ];
  // Already pitch-ordered (bass < treble by construction). Reverse for down.
  const seq = direction === 'down' ? [...tagged].reverse() : tagged;

  const bassSlots = [];
  const trebleSlots = [];
  for (const item of seq) {
    if (item.staff === 'bass') {
      const n = new VF.StaveNote({ clef: 'bass', keys: [pitchToVexKey(item.pitch)], duration: '8', auto_stem: true });
      addAcc(n, [item.pitch]);
      bassSlots.push(n);
      trebleSlots.push(makeEighthRest(VF, 'treble'));
    } else {
      const n = new VF.StaveNote({ clef: 'treble', keys: [pitchToVexKey(item.pitch)], duration: '8', auto_stem: true });
      addAcc(n, [item.pitch]);
      trebleSlots.push(n);
      bassSlots.push(makeEighthRest(VF, 'bass'));
    }
  }
  [[bassStave, bassSlots], [trebleStave, trebleSlots]].forEach(([stave, notes]) => {
    const v = new VF.Voice({ num_beats: 3, beat_value: 8 });
    v.addTickables(notes);
    new VF.Formatter().joinVoices([v]).format([v], width - 80);
    v.draw(ctx, stave);
  });
}

function renderSkip(container) {
  container.replaceChildren();
  const skip = document.createElement('div');
  skip.className = 'notation-skip';
  skip.textContent = 'chord out of range';
  container.appendChild(skip);
}

function renderNotation(card, container) {
  container.replaceChildren();
  const ns = state.notation;
  const VF = Vex.Flow;

  const articulation = resolveArticulation(ns.articulation);
  const direction = resolveDirection(ns.arpeggioDirection);
  const keyName = ns.accidentals === 'keySig' ? keySigFor(card.spelling, card.quality) : null;
  const addAcc = (note, ps) => {
    ps.forEach((p, i) => {
      const accStr = accidentalModifierFor(p.accidental, impliedAccidental(keyName, p.letter));
      if (accStr !== null) note.addModifier(new VF.Accidental(accStr), i);
    });
  };

  const effectiveVoicing = resolveVoicing(card, ns.clef, ns.voicing);
  const isGrand = ns.clef === 'both';

  // Fixed dimensions regardless of articulation so Mixed mode doesn't
  // shift the card width between block and arpeggio renders.
  const width = 340;
  const height = isGrand ? 220 : 140;
  const ctx = setupRenderer(VF, container, width, height);

  if (!isGrand) {
    const clef = ns.clef === 'bass' ? 'bass' : 'treble';
    const raw = placeChordInRange(card.spelling, card.quality, card.inversion, ns.rangeLow, ns.rangeHigh);
    if (!raw) { renderSkip(container); return; }
    const pitches = substituteAll(raw);
    const stave = new VF.Stave(8, 18, width - 16);
    stave.addClef(clef);
    if (keyName) stave.addKeySignature(keyName);
    stave.setContext(ctx).draw();
    const notes = articulation === 'block'
      ? [makeBlockNote(VF, clef, pitches, addAcc)]
      : makeArpNotes(VF, clef, pitches, direction, addAcc);
    drawChordVoice(VF, ctx, stave, notes, articulation, width, clef);
    return;
  }

  // Grand staff path
  if (effectiveVoicing === 'open') {
    renderOpenGrand(card, container, ctx, VF, width, articulation, direction, keyName, addAcc, ns);
  } else {
    renderClosedGrand(card, container, ctx, VF, width, articulation, direction, keyName, addAcc, ns);
  }
}

// Range picker — visual staff modal
// ============================================================
const SVG_NS = 'http://www.w3.org/2000/svg';
const RANGE_MIN_SEMITONES = 12; // require at least an octave between bounds
const DIATONIC_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

// Picker visible range per clef. Wide enough to cover the practical
// piano range with several ledger positions above and below each staff.
function pickerVisibleFor(clef) {
  if (clef === 'bass')  return { trebleRange: null,            bassRange: ['C2', 'C7'] };
  if (clef === 'both')  return { trebleRange: ['C4', 'C7'],    bassRange: ['C2', 'B3'] };
  return                       { trebleRange: ['C2', 'C7'],    bassRange: null };
}

function naturalsInRange(lo, hi) {
  const out = [];
  const loS = pitchSemitones(parsePitchName(lo));
  const hiS = pitchSemitones(parsePitchName(hi));
  for (let o = 2; o <= 6; o++) {
    for (const l of ['C','D','E','F','G','A','B']) {
      const s = pitchSemitones({letter:l, accidental:0, octave:o});
      if (s >= loS && s <= hiS) out.push(`${l}${o}`);
    }
  }
  return out;
}

// Diatonic distance from a clef's bottom staff line. Half-line = diatonic step.
// Treble bottom line = E4, Bass bottom line = G2.
function pitchToLineFromTop(pitch, clef) {
  const p = parsePitchName(pitch);
  const diaP = p.octave * 7 + DIATONIC_INDEX[p.letter];
  const anchor = clef === 'treble' ? { letter: 'E', octave: 4 } : { letter: 'G', octave: 2 };
  const diaA = anchor.octave * 7 + DIATONIC_INDEX[anchor.letter];
  // Half-line steps from bottom staff line. Bottom line = VexFlow line index 4.
  const halfLinesFromBottom = diaP - diaA;
  return 4 - halfLinesFromBottom * 0.5;
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
}

// Draw a notehead (oval) at (cx, cy) plus any ledger lines required to
// position it relative to the given stave.
function drawNotehead(svg, cx, cy, stave, color, className, opacity) {
  const topY = stave.getYForLine(0);
  const bottomY = stave.getYForLine(4);
  const spacing = (bottomY - topY) / 4; // px per staff line
  // Ledger lines above
  const ledgerHalf = 13; // wider than the notehead so it reads as a ledger line
  if (cy < topY - spacing * 0.25) {
    let lineY = topY - spacing;
    while (lineY >= cy - spacing * 0.25) {
      svg.appendChild(svgEl('line', {
        x1: cx - ledgerHalf, x2: cx + ledgerHalf, y1: lineY, y2: lineY,
        stroke: color, 'stroke-width': 1.2, class: className + '-ledger'
      }));
      lineY -= spacing;
    }
  } else if (cy > bottomY + spacing * 0.25) {
    let lineY = bottomY + spacing;
    while (lineY <= cy + spacing * 0.25) {
      svg.appendChild(svgEl('line', {
        x1: cx - ledgerHalf, x2: cx + ledgerHalf, y1: lineY, y2: lineY,
        stroke: color, 'stroke-width': 1.2, class: className + '-ledger'
      }));
      lineY += spacing;
    }
  }
  // Notehead — slightly rotated whole-note oval.
  const note = svgEl('ellipse', {
    cx, cy, rx: 6.5, ry: 4.5, fill: color, class: className,
    transform: `rotate(-18 ${cx} ${cy})`
  });
  if (opacity != null) note.setAttribute('opacity', String(opacity));
  svg.appendChild(note);
}

function updateRangeCurrentLabel() {
  const label = `${state.notation.rangeLow} – ${state.notation.rangeHigh}`;
  $('range-current-label').textContent = label;
}

let pickerFirstTap = null;
let pickerError = null;

// Diatonic position = octave*7 + letter index (C=0..B=6). Used to lay out
// pitches in a single linear vertical coordinate space across both clefs.
function pitchDiatonic(pitch) {
  const p = parsePitchName(pitch);
  return p.octave * 7 + DIATONIC_INDEX[p.letter];
}

function enumeratePitches(lo, hi) {
  const loDia = pitchDiatonic(lo);
  const hiDia = pitchDiatonic(hi);
  const letters = ['C','D','E','F','G','A','B'];
  const out = [];
  for (let d = loDia; d <= hiDia; d++) {
    const oct = Math.floor(d / 7);
    const letter = letters[d - oct * 7];
    out.push({ pitch: `${letter}${oct}`, diatonic: d });
  }
  return out;
}

function renderRangePicker() {
  const stage = $('range-picker-stage');
  stage.replaceChildren();
  const ns = state.notation;
  const { trebleRange, bassRange } = pickerVisibleFor(ns.clef);
  const VF = Vex.Flow;
  const isGrand = trebleRange && bassRange;

  // Overall visible diatonic span — single linear coordinate for the SVG.
  const visibleLow = bassRange ? bassRange[0] : trebleRange[0];
  const visibleHigh = trebleRange ? trebleRange[1] : bassRange[1];
  const loDia = pitchDiatonic(visibleLow);
  const hiDia = pitchDiatonic(visibleHigh);

  const spacing = 12;      // distance between adjacent staff lines (px)
  const halfLine = spacing / 2;
  const width = 420;

  // Pad above/below so the staff (or middle C for grand) lands at the
  // vertical center of the SVG.
  const centerDia = isGrand
    ? pitchDiatonic('C4')
    : trebleRange ? (pitchDiatonic('E4') + pitchDiatonic('F5')) / 2
                  : (pitchDiatonic('G2') + pitchDiatonic('A3')) / 2;
  const aboveCenter = hiDia - centerDia;
  const belowCenter = centerDia - loDia;
  const basePad = 18;
  let padTop = basePad, padBot = basePad;
  if (aboveCenter > belowCenter)      padBot += (aboveCenter - belowCenter) * halfLine;
  else if (belowCenter > aboveCenter) padTop += (belowCenter - aboveCenter) * halfLine;
  const height = padTop + (hiDia - loDia) * halfLine + padBot;

  // Anchor: highest visible pitch sits at y = padTop. Each diatonic step
  // below is +halfLine in y.
  const yForDia = (d) => padTop + (hiDia - d) * halfLine;
  const yForPitch = (pitch) => yForDia(pitchDiatonic(pitch));

  const renderer = new VF.Renderer(stage, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const color = themeColor();
  const accent = (getComputedStyle(document.body).getPropertyValue('--accent') || '').trim() || color;
  ctx.setFillStyle(color);
  ctx.setStrokeStyle(color);

  const staveOpts = { spacing_between_lines_px: spacing };
  let trebleStave = null, bassStave = null;

  if (trebleRange) {
    // VexFlow line 0 = top staff line (F5). getYForLine(0) = stave.y + headroom*spacing = stave.y + 48.
    const f5Y = yForPitch('F5');
    trebleStave = new VF.Stave(16, f5Y - 4 * spacing, width - 32, staveOpts);
    trebleStave.addClef('treble').setContext(ctx).draw();
  }
  if (bassRange) {
    const a3Y = yForPitch('A3');
    bassStave = new VF.Stave(16, a3Y - 4 * spacing, width - 32, staveOpts);
    bassStave.addClef('bass').setContext(ctx).draw();
  }
  if (isGrand) {
    new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
    new VF.StaveConnector(trebleStave, bassStave).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
  }

  const svg = stage.querySelector('svg');

  const xStart = 80;
  const xEnd = width - 24;
  const chordX = (xStart + xEnd) / 2;

  // Guide ledger lines: at every "line" diatonic position OUTSIDE any drawn staff.
  // A "line" position is one where diatonic - diatonic(E4) is even — true for
  // both treble (E4) and bass (G2) since both bottom lines have even diatonic.
  const e4Dia = pitchDiatonic('E4');
  const ledgerHalfW = 14;
  function inAnyStave(d) {
    if (trebleRange) {
      const lo = pitchDiatonic('E4'), hi = pitchDiatonic('F5');
      if (d >= lo && d <= hi) return true;
    }
    if (bassRange) {
      const lo = pitchDiatonic('G2'), hi = pitchDiatonic('A3');
      if (d >= lo && d <= hi) return true;
    }
    return false;
  }
  for (let d = loDia; d <= hiDia; d++) {
    if (((d - e4Dia) % 2 + 2) % 2 !== 0) continue; // only line positions
    if (inAnyStave(d)) continue;                    // skip already-drawn staff lines
    const y = yForDia(d);
    svg.appendChild(svgEl('line', {
      x1: chordX - ledgerHalfW, x2: chordX + ledgerHalfW,
      y1: y, y2: y, class: 'range-guide-ledger'
    }));
  }

  // Highlight band — narrow rounded ribbon around the chord stack.
  const bandHalfW = 28;
  if (!pickerError) {
    const loY = yForPitch(ns.rangeLow);
    const hiY = yForPitch(ns.rangeHigh);
    const minY = Math.min(loY, hiY) - spacing * 0.6;
    const maxY = Math.max(loY, hiY) + spacing * 0.6;
    svg.appendChild(svgEl('rect', {
      x: chordX - bandHalfW, y: minY,
      width: bandHalfW * 2, height: maxY - minY,
      rx: 4, class: 'range-band'
    }));
  }

  // Helper: which stave to anchor a notehead's ledger lines to (closest one).
  function staveFor(pitch) {
    if (!isGrand) return trebleStave || bassStave;
    const dia = pitchDiatonic(pitch);
    const c4 = pitchDiatonic('C4');
    return dia >= c4 ? trebleStave : bassStave;
  }

  // Bound noteheads stacked at chordX (block-chord style).
  drawNotehead(svg, chordX, yForPitch(ns.rangeLow), staveFor(ns.rangeLow), color, 'range-bound-note');
  drawNotehead(svg, chordX, yForPitch(ns.rangeHigh), staveFor(ns.rangeHigh), color, 'range-bound-note');

  // Pending tap notehead (slightly offset).
  if (pickerFirstTap) {
    drawNotehead(svg, chordX + spacing * 1.2, yForPitch(pickerFirstTap),
                 staveFor(pickerFirstTap), accent, 'range-pending-note', 0.85);
  }

  // Hit zones for every visible pitch (lines + spaces).
  const hitH = halfLine;
  for (let d = loDia; d <= hiDia; d++) {
    const oct = Math.floor(d / 7);
    const letter = ['C','D','E','F','G','A','B'][d - oct * 7];
    const pitch = `${letter}${oct}`;
    const y = yForDia(d);
    const rect = svgEl('rect', {
      x: xStart - 20, y: y - hitH / 2,
      width: xEnd - xStart + 40, height: hitH,
      class: 'range-hit',
      fill: 'none', stroke: 'none', 'pointer-events': 'all'
    });
    rect.addEventListener('click', () => handleRangeTap(pitch));
    rect.addEventListener('mouseenter', () => { $('range-picker-hover').textContent = pitch; });
    rect.addEventListener('mouseleave', () => { $('range-picker-hover').textContent = ''; });
    svg.appendChild(rect);
  }

  // Status line.
  const bounds = $('range-picker-bounds');
  if (pickerError) {
    bounds.textContent = pickerError;
    bounds.classList.add('error');
  } else if (pickerFirstTap) {
    bounds.textContent = `${pickerFirstTap} — tap another pitch to set range`;
    bounds.classList.remove('error');
  } else {
    bounds.textContent = `${ns.rangeLow} – ${ns.rangeHigh}  ·  ${octaveSpanLabel(ns.rangeLow, ns.rangeHigh)}`;
    bounds.classList.remove('error');
  }
}

function octaveSpanLabel(lo, hi) {
  const semis = Math.abs(pitchSemitones(parsePitchName(hi)) - pitchSemitones(parsePitchName(lo)));
  const octaves = semis / 12;
  if (Number.isInteger(octaves)) {
    return `${octaves} octave${octaves === 1 ? '' : 's'}`;
  }
  // round to two decimals, strip trailing zero
  return `${octaves.toFixed(2).replace(/0$/, '')} octaves`;
}

function handleRangeTap(pitch) {
  pickerError = null;
  if (!pickerFirstTap) {
    pickerFirstTap = pitch;
    renderRangePicker();
    return;
  }
  const first = pickerFirstTap;
  const second = pitch;
  if (first === second) {
    pickerError = `Pick two different pitches`;
    renderRangePicker();
    return;
  }
  const a = pitchSemitones(parsePitchName(first));
  const b = pitchSemitones(parsePitchName(second));
  if (Math.abs(a - b) < RANGE_MIN_SEMITONES) {
    pickerError = `Range too narrow — needs at least an octave`;
    pickerFirstTap = second;
    renderRangePicker();
    return;
  }
  const low = a < b ? first : second;
  const high = a < b ? second : first;
  state.notation.rangeLow = low;
  state.notation.rangeHigh = high;
  pickerFirstTap = null;
  updateRangeCurrentLabel();
  renderRangePicker();
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
}

function resetRangeToDefault() {
  const d = defaultRangeForClef(state.notation.clef);
  state.notation.rangeLow = d.low;
  state.notation.rangeHigh = d.high;
  pickerFirstTap = null;
  pickerError = null;
  updateRangeCurrentLabel();
  renderRangePicker();
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
}

function openRangeModal() {
  pickerFirstTap = null;
  pickerError = null;
  $('range-picker-hover').textContent = '';
  updateRangeCurrentLabel();
  renderRangePicker();
  $('range-modal-backdrop').classList.add('active');
}
function closeRangeModal() {
  $('range-modal-backdrop').classList.remove('active');
}

// Build the chord-name HTML for the active label style. Returns a string
// suitable for innerHTML on a label container.
function buildChordLabelHTML(card, style) {
  const tones = chordTones(card.spelling, card.quality);
  const suffix = QUALITY_SUFFIX[card.quality];
  const rootHTML = formatSpellingDisplay(card.spelling);
  if (style === 'slash') {
    if (card.inversion === 'root') return `${rootHTML}${suffix}`;
    const bassTone = card.inversion === '1st' ? tones[1] : tones[2];
    return `${rootHTML}${suffix}/${toneToDisplayHTML(bassTone)}`;
  }
  if (style === 'figured') {
    if (card.inversion === 'root') return `${rootHTML}${suffix}`;
    if (card.inversion === '1st') return `${rootHTML}${suffix}<sup class="figured">6</sup>`;
    return `${rootHTML}${suffix}<sup class="figured">6</sup><sub class="figured">4</sub>`;
  }
  // plain fallback: just root + 'm'/'°'/'+' (or nothing for major)
  return `${rootHTML}${suffix}`;
}

function renderChordLabel(card) {
  const style = state.notation.labelStyle;
  const fc = $('flash-card');
  fc.classList.remove('label-plain', 'label-slash', 'label-figured');
  fc.classList.add(`label-${style}`);

  if (style === 'plain') {
    $('card-root').innerHTML = formatSpellingDisplay(card.spelling);
    $('card-quality').textContent = card.quality;
    $('card-inversion').textContent = card.inversion === 'root' ? 'root position' :
                                       card.inversion === '1st' ? 'first inversion' : 'second inversion';
    return;
  }
  $('card-root').innerHTML = buildChordLabelHTML(card, style);
  $('card-quality').textContent = '';
  $('card-inversion').textContent = '';
}

function renderChordNameOverlay(card) {
  const ns = state.notation;
  const fc = $('flash-card');
  if (ns.format !== 'notation' || ns.showName === 'off') {
    $('card-name-overlay').textContent = '';
    fc.classList.add('name-hidden');
    return;
  }
  $('card-name-overlay').innerHTML = buildChordLabelHTML(card, ns.labelStyle);
  const shouldShow = ns.showName === 'always' || card.nameRevealed === true;
  fc.classList.toggle('name-hidden', !shouldShow);
}

// ============================================================
// Playback pitch computation
// ============================================================
// Returns the pitches that should sound for a card, based on the
// current notation settings (clef, voicing, range). Used by the
// optional piano playback regardless of whether the UI is showing
// notation or the chord label — settings drive the voicing in both.
//
// Returns null if no octave placement fits the active range.
function computePlaybackPitches(card) {
  const ns = state.notation;
  const isGrand = ns.clef === 'both';
  const effectiveVoicing = resolveVoicing(card, ns.clef, ns.voicing);

  if (!isGrand) {
    const raw = placeChordInRange(card.spelling, card.quality, card.inversion,
                                   ns.rangeLow, ns.rangeHigh);
    if (!raw) return null;
    return substituteAll(raw);
  }

  if (effectiveVoicing === 'open') {
    const raw = placeOpenVoicing(card, ns.rangeLow, ns.rangeHigh);
    if (!raw) return null;
    return [...substituteAll(raw.bass), ...substituteAll(raw.treble)];
  }

  // Closed voicing on grand staff: pitches land on one clef.
  const chordClef = resolveChordClef(card, ns.clef, 'closed') || 'treble';
  const place = narrowRangeForClef(ns.rangeLow, ns.rangeHigh, chordClef);
  const raw = placeChordInRange(card.spelling, card.quality, card.inversion, place.lo, place.hi);
  if (!raw) return null;
  return substituteAll(raw);
}
