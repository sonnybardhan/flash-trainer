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
  const perBarWidth = opts.perBarWidth || 240;
  const leadPad = 60; // room for clef + time sig
  const totalWidth = leadPad + phrase.bars * perBarWidth + 24;
  const height = 160;

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
  let prevStave = null;

  const bars = _groupByBar(phrase);
  bars.forEach(({ bar, events }, barIdx) => {
    // Stave: first bar gets clef + time sig.
    const xStart = barIdx === 0 ? 8 : leadPad + barIdx * perBarWidth + 8;
    const staveWidth = barIdx === 0 ? leadPad + perBarWidth : perBarWidth;
    const stave = new VF.Stave(xStart, 16, staveWidth);
    if (barIdx === 0) {
      stave.addClef(clef);
      stave.addTimeSignature('4/4');
    }
    stave.setContext(ctx).draw();
    prevStave = stave;

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

    // Wrap each triplet group.
    for (const bucket of tripletBuckets.values()) {
      const groupNotes = bucket.map(b => b.note);
      // Quarter-triplet: notes_occupied: 2 (3 quarters in 2 beats).
      // Eighth-triplet: notes_occupied: 2 in eighth units (3 eighths in 2-eighths = 1 beat).
      // VexFlow's defaults handle both as long as we pass num_notes: 3.
      const t = new VF.Tuplet(groupNotes, { num_notes: 3, notes_occupied: 2, ratioed: false, bracketed: true });
      tuplets.push(t);
    }

    // Beam adjacent eighth pairs within the same beat. Don't beam
    // triplet eighths — those already get the tuplet bracket.
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
      beams.push(new VF.Beam(r));
    }

    // Format and draw the bar.
    const voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
    voice.setStrict(false); // be forgiving while we shake out edge cases
    voice.addTickables(notes);
    new VF.Formatter().joinVoices([voice]).format([voice], staveWidth - 30);
    voice.draw(ctx, stave);
  });

  for (const t of tuplets) t.setContext(ctx).draw();
  for (const b of beams)   b.setContext(ctx).draw();
}
