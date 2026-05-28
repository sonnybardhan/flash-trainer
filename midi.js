// ============================================================
// midi.js — Web MIDI input for notation drills.
//
// Listens for note-on/note-off events from any connected MIDI
// input, matches them against the active card's expected pitches,
// and triggers correct/wrong feedback. Three matcher modes:
//
//   'set'         — held-note set must equal the expected MIDI set
//                   (simultaneous play; e.g. block chord, block dyad)
//   'sequence'    — sliding window of recent note-ons must end with
//                   the expected sequence (arpeggios)
//   'pitchClass'  — any note whose pitch class equals the expected
//                   pitch class (octave-equivalent; degree drill)
//
// Pitch-to-MIDI: MIDI = pitchSemitones(p) + 12 (so C4 → 60).
// ============================================================

const midiState = {
  access: null,
  inputs: new Map(),       // id -> MIDIInput
  heldNotes: new Set(),    // currently-held MIDI note numbers
  sequence: [],            // recent note-ons (sliding window)
  matcher: null,           // active matcher or null
  initStarted: false,
  unsupported: false
};

const MIDI_SEQUENCE_BUFFER = 12;

function pitchToMidi(p) {
  return pitchSemitones(p) + 12;
}

function setMidiMatcher(opts) {
  // opts: { mode, expected, onCorrect, onWrong, container }
  midiState.matcher = opts || null;
  midiState.sequence = [];
}

function clearMidiMatcher() {
  midiState.matcher = null;
  midiState.sequence = [];
}

async function initMidi() {
  if (midiState.initStarted) return;
  midiState.initStarted = true;
  // Show "No MIDI device" right away so the user has feedback before / during
  // the browser permission prompt resolves.
  updateMidiIndicator();
  if (!navigator.requestMIDIAccess) {
    midiState.unsupported = true;
    updateMidiIndicator();
    return;
  }
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    midiState.access = access;
    refreshMidiInputs();
    access.onstatechange = () => {
      refreshMidiInputs();
      updateMidiIndicator();
      // First connect: warm up the piano engine so the first key feels instant.
      if (midiState.inputs.size > 0 && midiThruEnabled() &&
          typeof prefetchPianoEngine === 'function') {
        prefetchPianoEngine();
      }
    };
    updateMidiIndicator();
    if (midiState.inputs.size > 0 && midiThruEnabled() &&
        typeof prefetchPianoEngine === 'function') {
      prefetchPianoEngine();
    }
  } catch (e) {
    midiState.unsupported = true;
    updateMidiIndicator();
  }
}

function refreshMidiInputs() {
  if (!midiState.access) return;
  const prevCount = midiState.inputs.size;
  // Detach old listeners
  midiState.inputs.forEach(inp => { inp.onmidimessage = null; });
  midiState.inputs.clear();
  for (const input of midiState.access.inputs.values()) {
    if (input.state !== 'connected') continue;
    input.onmidimessage = handleMidiMessage;
    midiState.inputs.set(input.id, input);
  }
  if (typeof onMidiConnectivityChange === 'function') {
    onMidiConnectivityChange(midiState.inputs.size, prevCount);
  }
}

function connectedDeviceNames() {
  return Array.from(midiState.inputs.values()).map(i => i.name || 'MIDI device');
}

function handleMidiMessage(e) {
  const [status, data1, data2] = e.data;
  const cmd = status & 0xf0;
  if (cmd === 0x90 && data2 > 0) {
    onNoteOn(data1, data2);
  } else if (cmd === 0x80 || (cmd === 0x90 && data2 === 0)) {
    onNoteOff(data1);
  } else if (cmd === 0xB0 && data1 === 64) {
    // Sustain pedal (CC 64). Standard threshold: >=64 down, <64 up.
    if (data2 >= 64) {
      if (midiThruEnabled()) pianoLiveSustainOn();
    } else {
      if (midiThruEnabled()) pianoLiveSustainOff();
    }
  }
}

function midiThruEnabled() {
  // Default to on if the setting hasn't been initialized yet.
  if (!state || !state.notation) return true;
  return state.notation.midiThru !== false;
}

// External entry point for non-MIDI input sources (on-screen keyboard,
// tests). Behaves identically to a real device note-on, including
// MIDI-thru audio + matcher dispatch.
function simulateNoteOn(midi, velocity = 100) { onNoteOn(midi, velocity); }
function simulateNoteOff(midi)                { onNoteOff(midi); }

function onNoteOn(note, velocity) {
  midiState.heldNotes.add(note);
  midiState.sequence.push(note);
  if (midiState.sequence.length > MIDI_SEQUENCE_BUFFER) {
    midiState.sequence.shift();
  }
  if (midiThruEnabled()) pianoLiveNoteOn(note, velocity);
  evaluateMatch(note);
}

function onNoteOff(note) {
  midiState.heldNotes.delete(note);
  if (midiThruEnabled()) pianoLiveNoteOff(note);
  // Re-check 'set' mode in case the released note completes the held set
  // (e.g., user was holding an extra wrong note while the correct set was down).
  if (midiState.matcher && midiState.matcher.mode === 'set') {
    evaluateMatch(null);
  }
}

function evaluateMatch(latestNote) {
  const m = midiState.matcher;
  if (!m) return;

  // Pass-through mode: dispatches every note-on to the caller's
  // handler. Used by phrase-match.js to drive the in-time slot
  // tracker with full press timing control.
  if (m.mode === 'phrasePassThrough') {
    if (latestNote != null && typeof m.onPress === 'function') m.onPress(latestNote);
    return;
  }

  if (m.mode === 'set') {
    const held = midiState.heldNotes;
    const expected = m.expected; // array of MIDI numbers
    if (held.size === expected.length && expected.every(n => held.has(n))) {
      fireCorrect();
      return;
    }
    // Wrong feedback only on a new note-on outside the expected set
    if (latestNote != null && !expected.includes(latestNote)) {
      fireWrong();
    }
    return;
  }

  if (m.mode === 'sequence') {
    const expected = m.expected; // array of MIDI numbers, in order
    const seq = midiState.sequence;
    if (seq.length >= expected.length) {
      const tail = seq.slice(seq.length - expected.length);
      if (tail.every((n, i) => n === expected[i])) {
        fireCorrect();
        return;
      }
    }
    // Wrong if this note doesn't appear in expected at all
    if (latestNote != null && !expected.includes(latestNote)) {
      fireWrong();
    }
    return;
  }

  if (m.mode === 'pitchClass') {
    if (latestNote == null) return;
    const pc = ((latestNote % 12) + 12) % 12;
    const expected = m.expected; // single pc 0-11
    if (pc === expected) {
      fireCorrect();
    } else {
      fireWrong();
    }
    return;
  }

  // Voicing-ordered, octave-insensitive matching for block chords/intervals.
  // expected: array of pitch classes in low-to-high voicing order.
  // Held notes are sorted by MIDI low-to-high; their *unique* pcs in that
  // order must equal expected. Doublings (e.g. an extra octave of the root)
  // are tolerated. Doesn't fire until the right number of distinct pcs are
  // held in the correct order.
  if (m.mode === 'pitchClassOrdered') {
    const held = midiState.heldNotes;
    if (held.size > 0) {
      const heldArr = Array.from(held).sort((a, b) => a - b);
      const uniqueOrderedPcs = [];
      for (const n of heldArr) {
        const pc = ((n % 12) + 12) % 12;
        if (!uniqueOrderedPcs.includes(pc)) uniqueOrderedPcs.push(pc);
      }
      if (uniqueOrderedPcs.length === m.expected.length &&
          uniqueOrderedPcs.every((pc, i) => pc === m.expected[i])) {
        fireCorrect();
        return;
      }
    }
    if (latestNote != null) {
      const pc = ((latestNote % 12) + 12) % 12;
      if (!m.expected.includes(pc)) fireWrong();
    }
    return;
  }

  // Ordered note-on sequence, octave-insensitive.
  // expected: array of pitch classes in playback order.
  if (m.mode === 'pitchClassSequence') {
    const expected = m.expected;
    const seq = midiState.sequence;
    if (seq.length >= expected.length) {
      const tailPcs = seq.slice(seq.length - expected.length)
                         .map(n => ((n % 12) + 12) % 12);
      if (tailPcs.every((pc, i) => pc === expected[i])) {
        fireCorrect();
        return;
      }
    }
    if (latestNote != null) {
      const pc = ((latestNote % 12) + 12) % 12;
      if (!expected.includes(pc)) fireWrong();
    }
    return;
  }

  // Octave-insensitive chord matching with bass-note constraint.
  // expected: array of pitch classes (3 for a triad). bassPc: required pc of
  // the lowest held note. Allows note doublings (e.g. doubled root).
  if (m.mode === 'pitchClassSet') {
    const held = midiState.heldNotes;
    if (held.size > 0) {
      const heldPcs = new Set();
      let lowest = Infinity;
      for (const n of held) {
        heldPcs.add(((n % 12) + 12) % 12);
        if (n < lowest) lowest = n;
      }
      const expectedSet = m.expected;
      const allInExpected = Array.from(heldPcs).every(pc => expectedSet.includes(pc));
      const allExpectedPresent = expectedSet.every(pc => heldPcs.has(pc));
      const bassOk = (((lowest % 12) + 12) % 12) === m.bassPc;
      if (allInExpected && allExpectedPresent && bassOk) {
        fireCorrect();
        return;
      }
    }
    if (latestNote != null) {
      const pc = ((latestNote % 12) + 12) % 12;
      if (!m.expected.includes(pc)) fireWrong();
    }
    return;
  }
}

function fireCorrect() {
  const m = midiState.matcher;
  if (!m) return;
  midiState.matcher = null; // consume so duplicate notes don't refire
  flashContainer(m.container, 'midi-correct');
  if (typeof m.onCorrect === 'function') m.onCorrect();
}

function fireWrong() {
  const m = midiState.matcher;
  if (!m) return;
  flashContainer(m.container, 'midi-wrong');
  if (typeof m.onWrong === 'function') m.onWrong();
}

function flashContainer(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  // Force reflow so re-adding the class restarts the animation
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), cls === 'midi-correct' ? 650 : 320);
}

// ============================================================
// Per-card matcher setup. Called from renderCard once the card
// is rendered and any expected pitches are stamped on it.
// ============================================================
function setupMidiForCard(card) {
  clearMidiMatcher();
  if (!card) return;
  // No connected device → don't bother arming the matcher.
  if (midiState.inputs.size === 0) return;

  const container = document.getElementById('card-notation');
  const ns = state.notation;

  if (card.drill === 'interval') {
    const articulation = card.renderedArticulation || resolveArticulation(ns.articulation);
    const ignoreOct = !!ns.midiIgnoreOctaves;
    const lo = pitchToMidi(card.lowPitch);
    const hi = pitchToMidi(card.highPitch);
    if (articulation === 'block') {
      if (ignoreOct) {
        const pcs = [lo, hi].map(n => ((n % 12) + 12) % 12);
        setMidiMatcher({
          mode: 'pitchClassOrdered', expected: pcs, container,
          onCorrect: () => onMidiCardCorrect(card)
        });
      } else {
        setMidiMatcher({
          mode: 'set', expected: [lo, hi], container,
          onCorrect: () => onMidiCardCorrect(card)
        });
      }
    } else {
      const direction = card.direction || 'up';
      const seq = direction === 'down' ? [hi, lo] : [lo, hi];
      if (ignoreOct) {
        const pcSeq = seq.map(n => ((n % 12) + 12) % 12);
        setMidiMatcher({
          mode: 'pitchClassSequence', expected: pcSeq, container,
          onCorrect: () => onMidiCardCorrect(card)
        });
      } else {
        setMidiMatcher({
          mode: 'sequence', expected: seq, container,
          onCorrect: () => onMidiCardCorrect(card)
        });
      }
    }
    return;
  }

  if (card.drill === 'degree') {
    if (card.answered) return;
    const targetPc = ((pitchToMidi(card.tonePitch) % 12) + 12) % 12;
    setMidiMatcher({
      mode: 'pitchClass', expected: targetPc, container,
      onCorrect: () => onMidiCardCorrect(card)
    });
    return;
  }

  if (card.drill === 'phrase') {
    if (card.answered) return;
    // Aural recall, free time — track the pitch-class sequence of every
    // sounding note in the phrase. The existing pitchClassSequence matcher
    // is a sliding window: it fires when the *tail* of the user's note-ons
    // equals the expected sequence, which is exactly the karaoke behaviour
    // we want (wrong notes don't reset; the user can keep trying).
    if (card.interaction === 'aural-free') {
      const rootMidi = pitchToMidi(card.rootPitch);
      const seqMidis = card.phrase.events
        .filter(e => e.kind === 'note')
        .map(e => rootMidi + e.semitone + 12 * (e.octaveOffset || 0));
      const pcSeq = seqMidis.map(n => ((n % 12) + 12) % 12);
      setMidiMatcher({
        mode: 'pitchClassSequence', expected: pcSeq, container,
        onCorrect: () => onMidiCardCorrect(card)
      });
      return;
    }
    // Other phrase interaction modes (in-time / sing / id-degrees) are
    // wired in later stages.
    return;
  }

  // Chord drill. Notation mode → exact voicing match. Text mode → pitch-class
  // match with bass-note (inversion) constraint.
  if (ns.format === 'notation') {
    if (!card.expectedPitches || !card.expectedPitches.length) return;
    const articulation = card.renderedArticulation || resolveArticulation(ns.articulation);
    const ignoreOct = !!ns.midiIgnoreOctaves;
    const midi = card.expectedPitches.map(pitchToMidi);
    if (articulation === 'block') {
      if (ignoreOct) {
        // Voicing order = low-to-high pitch classes (dedup doublings).
        const sortedPcs = [...midi].sort((a, b) => a - b)
                                    .map(n => ((n % 12) + 12) % 12);
        const orderedUnique = [];
        for (const pc of sortedPcs) if (!orderedUnique.includes(pc)) orderedUnique.push(pc);
        setMidiMatcher({
          mode: 'pitchClassOrdered', expected: orderedUnique, container,
          onCorrect: () => onMidiCardCorrect(card)
        });
      } else {
        setMidiMatcher({
          mode: 'set', expected: midi, container,
          onCorrect: () => onMidiCardCorrect(card)
        });
      }
    } else {
      const direction = card.renderedDirection || resolveDirection(ns.arpeggioDirection);
      const sorted = [...midi].sort((a, b) => a - b);
      const seq = direction === 'down' ? sorted.reverse() : sorted;
      if (ignoreOct) {
        const pcSeq = seq.map(n => ((n % 12) + 12) % 12);
        setMidiMatcher({
          mode: 'pitchClassSequence', expected: pcSeq, container,
          onCorrect: () => onMidiCardCorrect(card)
        });
      } else {
        setMidiMatcher({
          mode: 'sequence', expected: seq, container,
          onCorrect: () => onMidiCardCorrect(card)
        });
      }
    }
    return;
  }

  // Text mode: derive pitch classes and the required bass pc from the card.
  const tones = chordTones(card.spelling, card.quality);
  if (!tones || tones.length === 0) return;
  const pcs = tones.map(t => (((LETTER_SEMI[t.letter] + t.accidental) % 12) + 12) % 12);
  let bassPc = pcs[0];
  if (card.inversion === '1st') bassPc = pcs[1];
  else if (card.inversion === '2nd') bassPc = pcs[2];
  setMidiMatcher({
    mode: 'pitchClassSet', expected: pcs, bassPc, container,
    onCorrect: () => onMidiCardCorrect(card)
  });
}

function onMidiCardCorrect(card) {
  if (!state.session || state.session.lastCard !== card) return;
  if (card.drill === 'degree') {
    // If the user already answered via chip-tap, that flow handles advance.
    if (card.answered) return;
    card.answered = true;
    card.correct = true;
    state.session.degreeStats = state.session.degreeStats || { right: 0, total: 0, mistakes: 0 };
    state.session.degreeStats.total++;
    state.session.degreeStats.right++;
  }
  if (card.drill === 'phrase') {
    if (card.answered) return;
    card.answered = true;
    card.correct = true;
    // Reveal the staff on a successful recall so the user can compare.
    if (typeof revealPhraseCard === 'function') revealPhraseCard(card);
  }
  // Brief beat so the user registers the green flash before the card flips.
  setTimeout(() => {
    if (state.session && state.session.lastCard === card) nextCard();
  }, 620);
}

function updateMidiIndicator() {
  const el = document.getElementById('midi-indicator');
  if (!el) return;
  el.classList.remove('hidden');
  if (midiState.unsupported) {
    el.classList.remove('connected');
    el.classList.add('unsupported');
    el.textContent = 'MIDI unsupported';
    el.title = 'This browser does not expose Web MIDI.';
    return;
  }
  const names = connectedDeviceNames();
  if (names.length === 0) {
    el.classList.remove('connected', 'unsupported');
    el.textContent = '◌ No MIDI device';
    el.title = 'Plug in a MIDI keyboard and it will appear here.';
    return;
  }
  el.classList.remove('unsupported');
  el.classList.add('connected');
  const primary = names[0];
  const extra = names.length > 1 ? ` +${names.length - 1}` : '';
  el.textContent = `● ${primary}${extra}`;
  el.title = names.join('\n');
}
