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
  // Phrase pitches are relative to the tonic (semi 0 = root). The
  // root pitch itself sits at octave 4 by default; in-time and
  // aural-recall modes will use this as the playback anchor.
  const rootPitch = { letter: key[0], accidental: key.includes('#') ? 1 : (key[1] === 'b' ? -1 : 0), octave: 4 };
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
    interaction: ns.phraseInteraction || 'aural-free'
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
      maxAttempts: 200
    });
  } catch (e) {
    console.warn('[phrases] generation failed:', e.message);
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

function renderPhraseCard(card) {
  $('card-notation').replaceChildren();
  $('card-answer-chips').replaceChildren();
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
}

function revealPhraseCard(card) {
  if (card.revealed) return;
  card.revealed = true;
  renderPhrase(card.phrase, card.rootPitch, $('card-notation'));
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
  await playPhrase(card.phrase, card.rootPitch, bpm);
}

// Sing-back: play the phrase, give the user bars*4 beats of silence to
// sing it, then play the phrase again as the "answer." Self-evaluated —
// the user taps the card to advance (handled by handlePhraseCardTap).
async function runSingBackForCard(card) {
  const bpm = (state.metronome && state.metronome.bpm) || 80;
  const beatSec = 60 / Math.max(30, bpm);
  await playPhrase(card.phrase, card.rootPitch, bpm);
  // Pause for the user to sing back.
  const silenceSec = card.bars * 4 * beatSec;
  await new Promise(r => setTimeout(r, silenceSec * 1000));
  // Bail out if the card changed (e.g. user skipped).
  if (!state.session || state.session.lastCard !== card) return;
  await playPhrase(card.phrase, card.rootPitch, bpm);
  // After the answer-play, reveal the staff so the user can compare.
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
      revealPhraseCard(card);
      if (!success) {
        if (typeof showToast === 'function') showToast(`Skipped — captured ${info.capturedCount}/${info.totalSlots} after ${info.iterations} loops`);
      }
      setTimeout(() => {
        if (state.session && state.session.lastCard === card) nextCard();
      }, success ? 620 : 1200);
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
  await playPhrase(card.phrase, card.rootPitch, bpm);
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
    label.textContent = '✓';
    label.classList.add('correct');
    revealPhraseCard(card);
    setTimeout(() => {
      if (state.session && state.session.lastCard === card) nextCard();
    }, 700);
  }
}

// v1 stage 5 handler: tap reveals the staff; second tap advances.
function handlePhraseCardTap(card) {
  // In-time + ID-degrees are quiz-driven — only advance once answered.
  if (card.interaction === 'aural-intime' || card.interaction === 'id-degrees') {
    if (card.answered) nextCard();
    return;
  }
  if (!card.revealed) {
    revealPhraseCard(card);
    return;
  }
  nextCard();
}
