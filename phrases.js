// ============================================================
// phrases.js — card lifecycle for the phrase drill.
//
// Mirrors degrees.js: the session has a single rooted context
// (key + chord + scale); each card is a fresh phrase generated
// against that context. v1 plays the phrase and reveals the
// staff on tap — answer-collection (free / in-time / sing /
// id-degrees) lands in subsequent stages.
//
// Depends on globals: state, $, parseSpelling, preferredSpellingFor,
//   buildPhraseContext, generatePhrase, formatPhrase, renderPhrase,
//   playPhrase, stopPhrase, nextCard.
// ============================================================

// Rhythm options. Ordered by per-note value: longest first
// (half = 2 beats, eighth-triplet = 1/3 beat). The Unicode music
// symbols (𝅘𝅥 etc.) live outside the BMP and don't render in the
// system font stack; we draw small inline SVG glyphs instead.
const PHRASE_RHYTHM_CHOICES = [
  { id: 'half',            beats: 2,   svg: 'half',           title: 'Half note' },
  { id: 'quarter',         beats: 1,   svg: 'quarter',        title: 'Quarter note' },
  { id: 'tripletQuarters', beats: 2/3, svg: 'tripletQuarters', title: 'Quarter triplet (3 in 2 beats)' },
  { id: 'eighthPair',      beats: 0.5, svg: 'eighthPair',     title: 'Two eighths' },
  { id: 'tripletEighths',  beats: 1/3, svg: 'tripletEighths', title: 'Eighth triplet (3 in 1 beat)' }
];

const PHRASE_RHYTHM_SVG = {
  half: `<svg viewBox="0 0 22 30" width="22" height="30" aria-hidden="true">
    <ellipse cx="7" cy="24" rx="5.5" ry="3.5" fill="none" stroke="currentColor" stroke-width="1.6" transform="rotate(-18 7 24)"/>
    <line x1="12.5" y1="23" x2="12.5" y2="3" stroke="currentColor" stroke-width="1.4"/>
  </svg>`,
  quarter: `<svg viewBox="0 0 22 30" width="22" height="30" aria-hidden="true">
    <ellipse cx="7" cy="24" rx="5.5" ry="3.5" fill="currentColor" transform="rotate(-18 7 24)"/>
    <line x1="12.5" y1="23" x2="12.5" y2="3" stroke="currentColor" stroke-width="1.4"/>
  </svg>`,
  eighthPair: `<svg viewBox="0 0 40 30" width="40" height="30" aria-hidden="true">
    <ellipse cx="6" cy="24" rx="5" ry="3.3" fill="currentColor" transform="rotate(-18 6 24)"/>
    <ellipse cx="26" cy="24" rx="5" ry="3.3" fill="currentColor" transform="rotate(-18 26 24)"/>
    <line x1="11" y1="23" x2="11" y2="5" stroke="currentColor" stroke-width="1.4"/>
    <line x1="31" y1="23" x2="31" y2="5" stroke="currentColor" stroke-width="1.4"/>
    <line x1="10.3" y1="5" x2="31.7" y2="5" stroke="currentColor" stroke-width="3"/>
  </svg>`,
  tripletEighths: `<svg viewBox="0 0 52 36" width="52" height="36" aria-hidden="true">
    <ellipse cx="6" cy="30" rx="4.5" ry="3" fill="currentColor" transform="rotate(-18 6 30)"/>
    <ellipse cx="22" cy="30" rx="4.5" ry="3" fill="currentColor" transform="rotate(-18 22 30)"/>
    <ellipse cx="38" cy="30" rx="4.5" ry="3" fill="currentColor" transform="rotate(-18 38 30)"/>
    <line x1="10.5" y1="29" x2="10.5" y2="12" stroke="currentColor" stroke-width="1.4"/>
    <line x1="26.5" y1="29" x2="26.5" y2="12" stroke="currentColor" stroke-width="1.4"/>
    <line x1="42.5" y1="29" x2="42.5" y2="12" stroke="currentColor" stroke-width="1.4"/>
    <line x1="9.8" y1="12" x2="43.2" y2="12" stroke="currentColor" stroke-width="2.6"/>
    <text x="26.5" y="8" font-family="serif" font-size="10" font-style="italic" fill="currentColor" text-anchor="middle">3</text>
  </svg>`,
  tripletQuarters: `<svg viewBox="0 0 60 36" width="60" height="36" aria-hidden="true">
    <ellipse cx="6" cy="30" rx="4.5" ry="3" fill="currentColor" transform="rotate(-18 6 30)"/>
    <ellipse cx="26" cy="30" rx="4.5" ry="3" fill="currentColor" transform="rotate(-18 26 30)"/>
    <ellipse cx="46" cy="30" rx="4.5" ry="3" fill="currentColor" transform="rotate(-18 46 30)"/>
    <line x1="10.5" y1="29" x2="10.5" y2="12" stroke="currentColor" stroke-width="1.4"/>
    <line x1="30.5" y1="29" x2="30.5" y2="12" stroke="currentColor" stroke-width="1.4"/>
    <line x1="50.5" y1="29" x2="50.5" y2="12" stroke="currentColor" stroke-width="1.4"/>
    <line x1="10.5" y1="12" x2="22.5" y2="9" stroke="currentColor" stroke-width="0.9"/>
    <line x1="34.5" y1="9" x2="50.5" y2="12" stroke="currentColor" stroke-width="0.9"/>
    <line x1="10.5" y1="12" x2="10.5" y2="14" stroke="currentColor" stroke-width="0.9"/>
    <line x1="50.5" y1="12" x2="50.5" y2="14" stroke="currentColor" stroke-width="0.9"/>
    <text x="28.5" y="12" font-family="serif" font-size="10" font-style="italic" fill="currentColor" text-anchor="middle">3</text>
  </svg>`
};

// Default allowed durations — quarter / half / eighth-pair, matching
// the spec's v1 baseline. The user can opt in to triplets via the
// rhythm chips.
const PHRASE_ALLOWED_DEFAULT = ['quarter', 'half', 'eighthPair'];
const PHRASE_INTERACTIONS = ['aural-free', 'aural-intime', 'sing', 'id-degrees'];

// Pick the root pitch's octave so the phrase sits inside the user's
// active range. Both modes honour the existing degreeRangeMode
// setting from the degree drill (Auto = P4 below root → octave + M3
// above; Custom = the global rangeLow/rangeHigh).
function pickPhraseRootOctave(key, quality) {
  const ns = state.notation;
  const root = parseSpelling(key);
  const LETTER_SEMI_LOCAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // Try octaves 2..6 and pick the one whose root + octave+M3 above fits
  // best in the active range. Defaults to 4 if everything fits or
  // nothing fits cleanly.
  let lowSemi, highSemi;
  if ((ns.degreeRangeMode || 'auto') === 'custom' && typeof parsePitchName === 'function') {
    lowSemi  = pitchSemitones(parsePitchName(ns.rangeLow  || 'C3'));
    highSemi = pitchSemitones(parsePitchName(ns.rangeHigh || 'C6'));
  } else {
    // Auto: leave the choice fully open across 2..6; the phrase's pool
    // only spans an octave + maybe-upper-tonic, so any of those octaves
    // works. Pick 4 as the friendly default.
    return { letter: root.letter, accidental: root.accidental, octave: 4 };
  }
  for (const oct of [4, 3, 5, 2, 6]) {
    const rootSemi = oct * 12 + LETTER_SEMI_LOCAL[root.letter] + root.accidental;
    // Phrase pitches span from root (semi 0 above root) up through the
    // upper tonic (semi 12 above root). So the playable extent is
    // [rootSemi, rootSemi + 12].
    if (rootSemi >= lowSemi && rootSemi + 12 <= highSemi) {
      return { letter: root.letter, accidental: root.accidental, octave: oct };
    }
  }
  return { letter: root.letter, accidental: root.accidental, octave: 4 };
}

// Build the session anchor: snapshot the context + chosen root pitch
// so settings changes mid-session don't shift the generation pool.
function buildPhraseSessionAnchor() {
  const ns = state.notation;
  const quality = ns.degreeChordQuality || 'major';
  const rawKey = ns.degreeKey || 'C';
  const key = (typeof preferredSpellingFor === 'function')
    ? preferredSpellingFor(rawKey, quality) : rawKey;
  if (key !== rawKey) {
    ns.degreeKey = key;
    const sel = $('degree-key-select');
    if (sel) sel.value = key;
  }
  // Anchor the root in an octave that fits the user's range. Reuses
  // the same Auto/Custom logic as the degree drill: Auto picks an
  // octave whose pitches sit comfortably within the auto-range; Custom
  // honours ns.rangeLow/rangeHigh.
  const rootPitch = pickPhraseRootOctave(key, quality);
  const degreeIds = (ns.degreeScaleDegrees && ns.degreeScaleDegrees.length)
    ? ns.degreeScaleDegrees
    : ['1','2','3','4','5','6','7'];
  // Mirror CET's allowRests boolean: when off, swap in the no-rests
  // policy so the generator never inserts a rest into the phrase.
  const restPolicy = ns.phraseRestsIncluded === false
    ? { targetSilenceFraction: 0, maxSilenceFraction: 0 }
    : undefined; // let buildPhraseContext pick the standard default
  const context = buildPhraseContext(degreeIds, quality, {
    includesUpperTonic: true,
    restPolicy
  });

  return {
    key, quality, rootPitch, context,
    bars: ns.phraseBars || 1,
    allowedDurations: (ns.phraseAllowedDurations && ns.phraseAllowedDurations.length)
                       ? ns.phraseAllowedDurations
                       : PHRASE_ALLOWED_DEFAULT,
    interaction: ns.phraseInteraction || 'aural-free',
    maxNotesPerBar: (typeof ns.phraseMaxNotesPerBar === 'number') ? ns.phraseMaxNotesPerBar : Infinity
  };
}

// Build one phrase card. Mirrors buildDegreeCard.
function buildPhraseCard() {
  const anchor = state.session && state.session.phraseAnchor;
  if (!anchor) return null;
  let res;
  try {
    res = generatePhrase({
      context: anchor.context,
      bars: anchor.bars,
      allowedDurations: anchor.allowedDurations,
      maxNotesPerBar: anchor.maxNotesPerBar,
      maxAttempts: 200
    });
  } catch (e) {
    // Dump the full anchor so we can diagnose what state actually
    // tripped the generator — not just the final validator code.
    console.warn('[phrases] generation failed:', e.message, {
      key: anchor.key, quality: anchor.quality, bars: anchor.bars,
      durations: anchor.allowedDurations, context: anchor.context
    });
    return null;
  }
  return {
    drill: 'phrase',
    key: anchor.key,
    quality: anchor.quality,
    rootPitch: anchor.rootPitch,
    interaction: anchor.interaction,
    bars: anchor.bars,
    phrase: res.phrase,
    templateId: res.templateId,
    revealed: false,
    answered: false
  };
}

// ============================================================
// Per-note progress dots (aural-recall modes).
// ============================================================
function renderPhraseDots(count) {
  const dock = $('card-phrase-dots');
  if (!dock) return;
  dock.replaceChildren();
  dock.style.display = count > 0 ? 'flex' : 'none';
  for (let i = 0; i < count; i++) {
    const d = document.createElement('div');
    d.className = 'phrase-dot' + (i === 0 ? ' next' : '');
    d.dataset.idx = String(i);
    dock.appendChild(d);
  }
}
function markPhraseDot(idx, statusClass, total) {
  const dock = $('card-phrase-dots');
  if (!dock) return;
  const dot = dock.querySelector(`.phrase-dot[data-idx="${idx}"]`);
  if (!dot) return;
  dot.classList.remove('next');
  dot.classList.add(statusClass);
  // Highlight the next pending dot.
  if (typeof total === 'number' && idx + 1 < total) {
    const next = dock.querySelector(`.phrase-dot[data-idx="${idx + 1}"]`);
    if (next && !next.classList.contains('captured') && !next.classList.contains('wrong')) {
      next.classList.add('next');
    }
  }
}
function hidePhraseDots() {
  const dock = $('card-phrase-dots');
  if (dock) { dock.replaceChildren(); dock.style.display = 'none'; }
}

function renderPhraseCard(card) {
  $('card-notation').replaceChildren();
  $('card-answer-chips').replaceChildren();
  hidePhraseDots();
  const tag = $('card-mode-tag');
  const interactionLabel = {
    'aural-free':   'Aural recall · free',
    'aural-intime': 'Aural recall · in time',
    'sing':         'Sing back',
    'id-degrees':   'ID degrees'
  }[card.interaction] || card.interaction;
  tag.textContent = `${card.key} ${card.quality} · ${interactionLabel} · ${card.bars} bar${card.bars > 1 ? 's' : ''}`;
  const label = $('card-reveal-label');
  label.textContent = '';
  label.classList.add('hidden');
  label.classList.remove('correct', 'wrong');
  updatePhraseRevealBtn(card);
}

function revealPhraseCard(card) {
  if (card.revealed) return;
  card.revealed = true;
  renderPhrase(card.phrase, card.rootPitch, $('card-notation'));
}

// Show/hide the staff for an aural-free card via the dedicated button.
// Other interactions reveal on their own and don't show the button.
function updatePhraseRevealBtn(card) {
  const btn = $('phrase-reveal-btn');
  if (!btn) return;
  if (!card || card.drill !== 'phrase' || card.interaction !== 'aural-free') {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'block';
  btn.textContent = card.revealed ? 'Hide' : 'Reveal';
}

function togglePhraseReveal(card) {
  if (!card || card.drill !== 'phrase' || card.interaction !== 'aural-free') return;
  if (card.revealed) {
    card.revealed = false;
    $('card-notation').replaceChildren();
  } else {
    card.revealed = true;
    renderPhrase(card.phrase, card.rootPitch, $('card-notation'));
  }
  updatePhraseRevealBtn(card);
}

// Chord pad options for a card's playback. Returns null UNLESS this
// is the first playback of the session — the chord is an intro, not
// a per-card loop. After it fires once, subsequent cards play
// melody-only. Users who want to hear the chord again use the ♪ Ref
// button.
function _phraseChordOpts(card) {
  if (!card || !card.phrase) return null;
  if (!state.session || state.session.phraseChordIntroPlayed) return null;
  const anchor = state.session.phraseAnchor;
  const tones = anchor && anchor.context && anchor.context.chordTones;
  if (!tones || tones.length === 0) return null;
  // Consume the flag immediately so retry calls (e.g. sing-back's second
  // play) don't double-up the chord.
  state.session.phraseChordIntroPlayed = true;
  // preludeBars: chord plays SOLO for this many bars, then the melody
  // starts. Mirrors the degree drill's chord-then-tone intro.
  return { tones, octaveOffset: -1, volume: 0.6, preludeSec: 2.0 };
}

async function playPhraseCard(card) {
  if (card.interaction === 'aural-intime') {
    startInTimeForCard(card);
    return;
  }
  if (card.interaction === 'sing') {
    runSingBackForCard(card);
    return;
  }
  if (card.interaction === 'id-degrees') {
    startIdDegreesForCard(card);
    return;
  }
  const bpm = (state.metronome && state.metronome.bpm) || 80;
  await playPhrase(card.phrase, card.rootPitch, bpm, { chord: _phraseChordOpts(card) });
}

// Sing-back: play the phrase, give the user bars*4 beats of silence to
// sing it, then play the phrase again as the "answer." Self-evaluated —
// the user taps the card to advance (handled by handlePhraseCardTap).
async function runSingBackForCard(card) {
  const bpm = (state.metronome && state.metronome.bpm) || 80;
  const beatSec = 60 / Math.max(30, bpm);
  // First play uses the intro chord if it hasn't fired yet; the
  // answer play that follows is always melody-only.
  await playPhrase(card.phrase, card.rootPitch, bpm, { chord: _phraseChordOpts(card) });
  const silenceSec = card.bars * 4 * beatSec;
  await new Promise(r => setTimeout(r, silenceSec * 1000));
  if (!state.session || state.session.lastCard !== card) return;
  await playPhrase(card.phrase, card.rootPitch, bpm);
  revealPhraseCard(card);
}

function startInTimeForCard(card) {
  runInTimeRecall(card, {
    onIteration: (iter, info) => {
      // Brief on-screen progress: card-mode-tag gets a "iter N" suffix.
      const baseTag = `${card.key} ${card.quality} · Aural recall · in time · ${card.bars} bar${card.bars > 1 ? 's' : ''}`;
      $('card-mode-tag').textContent = `${baseTag} · iter ${iter} (${info.capturedCount}/${info.totalSlots})`;
    },
    onComplete: (success, info) => {
      card.answered = true;
      card.correct = success;
      if (typeof updateNavButtons === 'function') updateNavButtons();
      revealPhraseCard(card);
      if (!success) {
        if (typeof showToast === 'function') showToast(`Skipped — captured ${info.capturedCount}/${info.totalSlots} after ${info.iterations} loops`);
      }
      setTimeout(() => {
        if (state.session && state.session.lastCard === card) nextCard();
      }, 2000);
    }
  });
}

// Map a semitone (0..11+) to a degree id, using pitch-class equivalence
// so the upper tonic (semitone 12) collapses to '1'.
const PHRASE_SEMI_TO_DEGREE = {
  0:'1', 1:'b2', 2:'2', 3:'b3', 4:'3', 5:'4',
  6:'#4', 7:'5', 8:'b6', 9:'6', 10:'b7', 11:'7'
};
function _phraseEventToDegreeId(ev) {
  const semi = ev.semitone + 12 * (ev.octaveOffset || 0);
  return PHRASE_SEMI_TO_DEGREE[((semi % 12) + 12) % 12];
}

// ID-degrees: play the phrase, then ask the user to tap the degree
// chips in the order heard. Chips are restricted to the user's
// available scale degrees (same as the degree drill's chip set).
async function startIdDegreesForCard(card) {
  const bpm = (state.metronome && state.metronome.bpm) || 80;
  await playPhrase(card.phrase, card.rootPitch, bpm, { chord: _phraseChordOpts(card) });
  if (!state.session || state.session.lastCard !== card) return;
  const expectedDegrees = card.phrase.events
    .filter(e => e.kind === 'note')
    .map(_phraseEventToDegreeId);
  card.expectedDegrees = expectedDegrees;
  card.degreeIndex = 0;
  card.wrongDegreeTaps = 0;
  _renderPhraseIdDegreeChips(card);
}

function _renderPhraseIdDegreeChips(card) {
  const c = $('card-answer-chips');
  c.replaceChildren();
  const available = (state.notation.degreeScaleDegrees && state.notation.degreeScaleDegrees.length)
    ? state.notation.degreeScaleDegrees
    : ['1','2','3','4','5','6','7'];
  // Visual order — chromatic so the layout stays stable across scales.
  const VISUAL = ['1','b2','2','b3','3','4','#4','5','b6','6','b7','7'];
  const ordered = VISUAL.filter(d => available.includes(d));
  for (const id of ordered) {
    const b = document.createElement('button');
    b.className = 'answer-chip';
    b.dataset.degreeId = id;
    b.textContent = (typeof DEGREE_DEFS !== 'undefined' && DEGREE_DEFS[id]) ? DEGREE_DEFS[id].label : id;
    b.onclick = () => _handlePhraseIdDegreeTap(card, id);
    c.appendChild(b);
  }
  const label = $('card-reveal-label');
  label.textContent = `Tap each note's degree in order  (1 / ${card.expectedDegrees.length})`;
  label.classList.remove('hidden', 'wrong', 'correct');
}

function _handlePhraseIdDegreeTap(card, pickedId) {
  if (card.answered) return;
  const expected = card.expectedDegrees[card.degreeIndex];
  const chip = $('card-answer-chips').querySelector(`.answer-chip[data-degree-id="${pickedId}"]`);
  if (pickedId !== expected) {
    card.wrongDegreeTaps++;
    if (chip) {
      chip.classList.add('wrong');
      setTimeout(() => chip.classList.remove('wrong'), 350);
    }
    return;
  }
  // Correct — advance index, flash green, update label.
  card.degreeIndex++;
  if (chip) {
    chip.classList.add('correct');
    setTimeout(() => chip.classList.remove('correct'), 250);
  }
  const remaining = card.expectedDegrees.length - card.degreeIndex;
  const label = $('card-reveal-label');
  if (remaining > 0) {
    label.textContent = `${card.degreeIndex + 1} / ${card.expectedDegrees.length}`;
  } else {
    card.answered = true;
    card.correct = true;
    if (typeof updateNavButtons === 'function') updateNavButtons();
    label.textContent = '✓';
    label.classList.add('correct');
    revealPhraseCard(card);
    setTimeout(() => {
      if (state.session && state.session.lastCard === card) nextCard();
    }, 2000);
  }
}

// Card-body taps are inert for phrases — reveal is the dedicated button,
// advance is the forward arrow (or auto-advance on correct / on the clock).
function handlePhraseCardTap(card) {
  return;
}
