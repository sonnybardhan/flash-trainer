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

const PHRASE_RHYTHM_CHOICES = [
  { id: 'quarter',         label: '𝅘𝅥' },
  { id: 'half',            label: '𝅗𝅥' },
  { id: 'eighthPair',      label: '𝅘𝅥𝅮𝅘𝅥𝅮' },
  { id: 'tripletEighths',  label: '³𝅘𝅥𝅮' },
  { id: 'tripletQuarters', label: '³𝅘𝅥' }
];

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
  const context = buildPhraseContext(degreeIds, quality, { includesUpperTonic: true });

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
  const bpm = (state.metronome && state.metronome.bpm) || 80;
  // Always replays cleanly — the playback module cancels any prior tail.
  await playPhrase(card.phrase, card.rootPitch, bpm);
}

// v1 stage 5 handler: tap reveals the staff; second tap advances.
function handlePhraseCardTap(card) {
  if (!card.revealed) {
    revealPhraseCard(card);
    return;
  }
  nextCard();
}
