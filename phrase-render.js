// ============================================================
// phrase-render.js — VexFlow rendering for generated phrases.
//
// Takes a phrase from phrase-gen.js plus a root pitch ({ letter,
// accidental, octave }) and renders the phrase to an SVG inside the
// caller's container.
//
// Handles tuplets:
//   - tripletEighths (3 in the space of 2) — beamed under a "3" bracket
//   - tripletQuarters (3 quarters in the space of 2) — bracketed, no beam
// And beams adjacent eighth pairs within the same beat.
//
// Pitch spelling defaults to ascending sharp names. A future revision
// will accept the active key signature so accidentals collapse into
// it; for v1 we always render with explicit accidentals on the notes.
// ============================================================

// Map our duration ids → VexFlow duration codes.
const PHRASE_DURATION_VEX = {
  half:           'h',
  quarter:        'q',
  eighth:         '8',
  tripletEighth:  '8',
  tripletQuarter: 'q',
  sixteenth:      '16'
};

// Semitone (0..11) → ascending-sharp letter + accidental for VexFlow keys.
const CHROMATIC_KEY = [
  'c',  'c#', 'd',  'd#', 'e',  'f',
  'f#', 'g',  'g#', 'a',  'a#', 'b'
];
// Parallel array of accidental strings to pass to VF.Accidental — null
// means no accidental modifier.
const CHROMATIC_ACC = [
  null, '#',  null, '#',  null, null,
  '#',  null, '#',  null, '#',  null
];

// Pitch object → MIDI number (C4 = 60).
function _pitchToMidi(p) {
  const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  return (p.octave + 1) * 12 + LETTER_SEMI[p.letter] + p.accidental;
}

// Convert a semitone offset + octave offset against the phrase root
// to a VexFlow key ("c#/4") and an accidental string (or null).
function _semiToVexKeyAndAcc(semiOffset, octaveOffset, rootPitch) {
  const rootMidi = _pitchToMidi(rootPitch);
  const targetMidi = rootMidi + semiOffset + 12 * octaveOffset;
  const pc = ((targetMidi % 12) + 12) % 12;
  const oct = Math.floor(targetMidi / 12) - 1;
  return {
    key: `${CHROMATIC_KEY[pc]}/${oct}`,
    acc: CHROMATIC_ACC[pc]
  };
}

function _restKeyForClef(clef) {
  return clef === 'bass' ? 'd/3' : 'b/4';
}

// Pick a single stem direction for a beam / tuplet group so all stems
// point the same way and the beam clears every notehead. Standard
// engraving rule: the note furthest from the middle staff line decides —
// above middle → stems down, below middle → stems up. Mirrors the same
// helper in notation.js, inlined here so phrase-render.js stays
// self-contained.
function _unifyStems(notes, clef) {
  if (!notes || notes.length === 0) return;
  const LETTER_SEMI_LOCAL = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const middleSemi = clef === 'bass' ? 38 : 59;  // D3 for bass, B4 for treble
  let furthest = 0;
  for (const n of notes) {
    const key = (n.keys && n.keys[0]) || '';
    const slash = key.indexOf('/');
    if (slash < 0) continue;
    const pitchPart = key.slice(0, slash);
    const oct = parseInt(key.slice(slash + 1), 10);
    const letter = pitchPart[0].toLowerCase();
    let acc = 0;
    for (let i = 1; i < pitchPart.length; i++) {
      if (pitchPart[i] === '#') acc++;
      else if (pitchPart[i] === 'b') acc--;
    }
    // Use the pitchSemitones convention (oct*12 + letter-semi + acc)
    // so middleSemi values match notation.js exactly.
    const semi = oct * 12 + (LETTER_SEMI_LOCAL[letter] || 0) + acc;
    const diff = semi - middleSemi;
    if (Math.abs(diff) > Math.abs(furthest)) furthest = diff;
  }
  const dir = furthest > 0 ? -1 : 1;  // above middle → stems down (-1)
  for (const n of notes) {
    if (typeof n.setStemDirection === 'function') n.setStemDirection(dir);
  }
}

// Group events by bar and return [{ bar, events }].
function _groupByBar(phrase) {
  const out = [];
  for (let b = 1; b <= phrase.bars; b++) {
    out.push({ bar: b, events: phrase.events.filter(e => e.bar === b) });
  }
  return out;
}

// Render the phrase into the container. Returns nothing — caller
// can clear/replace as needed.
function renderPhrase(phrase, rootPitch, container, opts = {}) {
  const VF = Vex.Flow;
  const clef = opts.clef || 'treble';
  const height = 160;

  // Dynamic per-bar width based on note density. Reserve ~32px per
  // event for breathing room, with a 220px floor so a 1-bar phrase
  // never looks cramped. The first bar gets an extra clef/time-sig
  // allowance (computed from the actual rendered stave below).
  const bars = _groupByBar(phrase);
  const perEventPx = 32;
  const minBarWidth = 220;
  const leadingClefAllowance = 70;  // clef + 4/4 time signature width
  const trailingPad = 18;
  const barWidths = bars.map(({ events }, i) => {
    const base = Math.max(minBarWidth, events.length * perEventPx + 32);
    return i === 0 ? base + leadingClefAllowance : base;
  });
  const totalWidth = barWidths.reduce((s, w) => s + w, 0) + 24;

  container.replaceChildren();
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(totalWidth, height);
  const ctx = renderer.getContext();
  // Honour the active theme — VexFlow defaults to mid-grey otherwise.
  const themeText = (typeof themeColor === 'function')
    ? themeColor()
    : (getComputedStyle(document.body).getPropertyValue('--text').trim() || '#e5e9f0');
  if (typeof ctx.setFillStyle === 'function') ctx.setFillStyle(themeText);
  if (typeof ctx.setStrokeStyle === 'function') ctx.setStrokeStyle(themeText);

  const tuplets = [];      // VF.Tuplet[]
  const beams = [];        // VF.Beam[]

  // Lay out staves left-to-right, each at the width we computed above.
  let xCursor = 8;
  bars.forEach(({ bar, events }, barIdx) => {
    const staveWidth = barWidths[barIdx];
    const stave = new VF.Stave(xCursor, 16, staveWidth);
    if (barIdx === 0) {
      stave.addClef(clef);
      stave.addTimeSignature('4/4');
    }
    stave.setContext(ctx).draw();
    xCursor += staveWidth;

    // Build VF.StaveNote per event.
    const tripletBuckets = new Map(); // tripletGroupId → array of notes
    const notes = [];
    for (const ev of events) {
      const durCode = PHRASE_DURATION_VEX[ev.duration] || 'q';
      let note;
      if (ev.kind === 'rest') {
        note = new VF.StaveNote({
          clef, keys: [_restKeyForClef(clef)], duration: durCode + 'r'
        });
      } else {
        const { key, acc } = _semiToVexKeyAndAcc(ev.semitone, ev.octaveOffset || 0, rootPitch);
        note = new VF.StaveNote({ clef, keys: [key], duration: durCode, auto_stem: true });
        if (acc) note.addModifier(new VF.Accidental(acc), 0);
      }
      notes.push(note);
      if (ev.isTriplet && ev.tripletGroupId != null) {
        if (!tripletBuckets.has(ev.tripletGroupId)) tripletBuckets.set(ev.tripletGroupId, []);
        tripletBuckets.get(ev.tripletGroupId).push({ note, ev });
      }
    }

    // Wrap each triplet group. Unify stem direction across the group
    // first so the tuplet bracket sits cleanly on one side of the noteheads.
    for (const bucket of tripletBuckets.values()) {
      const groupNotes = bucket.map(b => b.note);
      _unifyStems(groupNotes, clef);
      // Eighth-triplet beams too — three eighths beamed under the bracket.
      const isEighthTriplet = bucket[0] && bucket[0].ev.duration === 'tripletEighth';
      const t = new VF.Tuplet(groupNotes, {
        num_notes: 3, notes_occupied: 2,
        ratioed: false, bracketed: !isEighthTriplet
      });
      tuplets.push(t);
      if (isEighthTriplet) beams.push(new VF.Beam(groupNotes));
    }

    // Beam adjacent eighth pairs within the same beat. Don't beam
    // triplet eighths — those already get the tuplet bracket / beam.
    const eighthRuns = [];
    let run = [];
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const isPlainEighth = ev.duration === 'eighth' && !ev.isTriplet && ev.kind === 'note';
      if (isPlainEighth) {
        run.push(notes[i]);
      } else {
        if (run.length >= 2) eighthRuns.push(run);
        run = [];
      }
    }
    if (run.length >= 2) eighthRuns.push(run);
    for (const r of eighthRuns) {
      _unifyStems(r, clef);
      beams.push(new VF.Beam(r));
    }

    // Format and draw the bar. setStrict(false) because VexFlow's
    // tick counter doesn't auto-adjust for tuplets pre-format —
    // strict tick checking would reject any bar containing a triplet.
    // The phrase generator already guarantees the bar sums to 4 beats.
    const voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
    voice.setStrict(false);
    voice.addTickables(notes);
    // Use the stave's *actual* note area (after the clef + time sig
    // have been laid out) so the formatter knows exactly how much
    // room it has. Leaves a small pad before the trailing barline.
    const noteAreaWidth = stave.getNoteEndX() - stave.getNoteStartX() - trailingPad;
    new VF.Formatter().joinVoices([voice]).format([voice], Math.max(40, noteAreaWidth));
    voice.draw(ctx, stave);
  });

  for (const t of tuplets) t.setContext(ctx).draw();
  for (const b of beams)   b.setContext(ctx).draw();
}
