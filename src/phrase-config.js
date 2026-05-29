// Sanity-check the phrase config before running the generator. Returns
// a human-readable issue string, or null if the config is fine.
function validatePhraseConfig(anchor) {
  if (!anchor) return 'Phrase config is missing — try reloading the page.';
  if (!anchor.allowedDurations || anchor.allowedDurations.length === 0) {
    return 'You haven’t selected any rhythms. Tap at least one rhythm chip (Half or Quarter at minimum — phrases need a cadential note to end on).';
  }
  const hasCadential = anchor.allowedDurations.includes('quarter') ||
                       anchor.allowedDurations.includes('half');
  if (!hasCadential) {
    return 'Your rhythm selection has no Quarter or Half note — phrases need at least one of those to end the bar on a cadential note.';
  }
  if (!anchor.context.available || anchor.context.available.length === 0) {
    return 'You haven’t selected any scale degrees. Tap at least one degree chip in the Key & chord panel.';
  }
  return null;
}

function renderPhraseRhythmChips() {
  const c = $('phrase-rhythm-chips');
  if (!c) return;
  c.replaceChildren();
  const sel = new Set(state.notation.phraseAllowedDurations || ['quarter','half','eighthPair']);
  for (const choice of PHRASE_RHYTHM_CHOICES) {
    const b = document.createElement('button');
    b.className = 'chip phrase-rhythm-chip' + (sel.has(choice.id) ? ' active' : '');
    b.dataset.rhythm = choice.id;
    b.title = choice.title || choice.id;
    // Note glyph as an inline SVG built from a hardcoded source. Parse
    // through an HTML doc so the SVG namespace lands correctly when
    // imported into the HTML chip element.
    const svgSrc = PHRASE_RHYTHM_SVG[choice.svg];
    if (svgSrc) {
      const wrap = document.createElement('span');
      wrap.className = 'phrase-rhythm-glyph';
      const doc = new DOMParser().parseFromString(
        `<!doctype html><body>${svgSrc}</body>`, 'text/html'
      );
      const svgEl = doc.body.querySelector('svg');
      if (svgEl) wrap.appendChild(document.importNode(svgEl, true));
      b.appendChild(wrap);
    } else {
      b.textContent = choice.id;
    }
    b.onclick = () => {
      const prevMax = phraseDensityRange(
        state.notation.phraseAllowedDurations, state.notation.phraseRestsIncluded !== false
      ).max;
      const next = new Set(state.notation.phraseAllowedDurations || []);
      if (next.has(choice.id)) next.delete(choice.id); else next.add(choice.id);
      // Always keep at least one cadential group (quarter or half).
      if (!next.has('quarter') && !next.has('half')) next.add('quarter');
      state.notation.phraseAllowedDurations = Array.from(next);
      syncPhraseMaxNotesSlider(prevMax);   // recompute bounds + clamp/track value
      saveNotationSettings();
      renderPhraseRhythmChips();
    };
    c.appendChild(b);
  }
}

// Sync the Max-notes/bar slider to the current rhythm + rests config.
// prevMax = the max under the PREVIOUS config (pass it when the config just
// changed) so a value sitting at the old ceiling tracks up to the new max
// instead of silently becoming a cap.
function syncPhraseMaxNotesSlider(prevMax = null) {
  const ns = state.notation;
  const { min, max } = phraseDensityRange(
    ns.phraseAllowedDurations, ns.phraseRestsIncluded !== false
  );
  let v = ns.phraseMaxNotesPerBar;
  if (v == null) v = max;                              // unset → no effective cap
  else if (prevMax != null && v >= prevMax) v = max;   // was at ceiling → track up
  v = Math.max(min, Math.min(max, v));                 // clamp into range
  ns.phraseMaxNotesPerBar = v;

  const slider = $('phrase-maxnotes-slider');
  if (slider) {
    slider.min = String(min);
    slider.max = String(max);
    slider.value = String(v);
    slider.disabled = (min === max);
  }
  const label = $('phrase-maxnotes-value');
  if (label) label.textContent = String(v);
}

$('phrase-maxnotes-slider').addEventListener('input', (e) => {
  state.notation.phraseMaxNotesPerBar = parseInt(e.target.value, 10);
  const label = $('phrase-maxnotes-value');
  if (label) label.textContent = e.target.value;
  saveNotationSettings();
});

// Card-level "play note" button — degree drill only.
$('phrase-reveal-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const c = state.session && state.session.lastCard;
  if (c && c.drill === 'phrase') togglePhraseReveal(c);
});
$('phrase-reset-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const c = state.session && state.session.lastCard;
  if (c && c.drill === 'phrase') resetPhraseAttempt(c);
});
$('card-tone-replay').addEventListener('click', async (e) => {
  e.stopPropagation(); // don't bubble to .flash-card (which would advance for chord drill)
  if (!state.session || !state.session.lastCard) return;
  const card = state.session.lastCard;
  if (card.drill !== 'degree') return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  await playDegreeTone(card);
});
$('articulation-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.articulation = seg.dataset.articulation;
  setActiveSegment('articulation-segment', 'articulation', state.notation.articulation);
  updateNotationRowVisibility();
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('arp-dir-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.arpeggioDirection = seg.dataset.direction;
  setActiveSegment('arp-dir-segment', 'direction', state.notation.arpeggioDirection);
  rerenderCurrentCard();
  saveNotationSettings();
});
$('accidentals-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.accidentals = seg.dataset.accidentals;
  setActiveSegment('accidentals-segment', 'accidentals', state.notation.accidentals);
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('clef-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  const clef = seg.dataset.clef;
  state.notation.clef = clef;
  // Reset range to sensible defaults for the chosen clef.
  const d = defaultRangeForClef(clef);
  state.notation.rangeLow = d.low;
  state.notation.rangeHigh = d.high;
  updateRangeCurrentLabel();
  // Force a fresh clef pick on next render for Both mode.
  if (state.session && state.session.lastCard) delete state.session.lastCard.chordClef;
  setActiveSegment('clef-segment', 'clef', clef);
  updateNotationRowVisibility();
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('double-root-switch').addEventListener('click', () => {
  state.notation.doubleRootInBass = !state.notation.doubleRootInBass;
  $('double-root-switch').classList.toggle('on', state.notation.doubleRootInBass);
  rerenderCurrentCard();
  saveNotationSettings();
});
$('voicing-segment').addEventListener('click', (e) => {
  const seg = e.target.closest('.segment');
  if (!seg) return;
  state.notation.voicing = seg.dataset.voicing;
  // Voicing changed: invalidate any cached per-card resolutions so the new
  // voicing applies and Mixed re-rolls.
  if (state.session && state.session.lastCard) {
    delete state.session.lastCard.chordClef;
    delete state.session.lastCard.voicingResolved;
  }
  setActiveSegment('voicing-segment', 'voicing', state.notation.voicing);
  updateNotationRowVisibility();
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('unconventional-switch').addEventListener('click', () => {
  state.notation.unconventionalSpellings = !state.notation.unconventionalSpellings;
  $('unconventional-switch').classList.toggle('on', state.notation.unconventionalSpellings);
  rerenderCurrentCard();
  saveNotationSettings();
  markCustomIfActive();
});
$('play-sound-switch').addEventListener('click', () => {
  state.notation.playSound = !state.notation.playSound;
  $('play-sound-switch').classList.toggle('on', state.notation.playSound);
  if (state.notation.playSound) prefetchPianoEngine();
  updateNotationRowVisibility();
  saveNotationSettings();
});
$('midi-thru-switch').addEventListener('click', () => {
  state.notation.midiThru = state.notation.midiThru === false;
  $('midi-thru-switch').classList.toggle('on', state.notation.midiThru);
  if (state.notation.midiThru) prefetchPianoEngine();
  saveNotationSettings();
});
$('midi-ignore-octaves-switch').addEventListener('click', () => {
  state.notation.midiIgnoreOctaves = !state.notation.midiIgnoreOctaves;
  $('midi-ignore-octaves-switch').classList.toggle('on', state.notation.midiIgnoreOctaves);
  saveNotationSettings();
  // Re-arm the current card's matcher with the new strictness.
  if (state.session && state.session.lastCard && typeof setupMidiForCard === 'function') {
    setupMidiForCard(state.session.lastCard);
  }
});
$('piano-preset-select').addEventListener('change', (e) => setPianoPreset(e.target.value));
$('eq-piano-select').addEventListener('change', (e) => setPianoPreset(e.target.value));
$('preview-block-btn').addEventListener('click', () => previewChord('block'));
$('preview-arp-btn').addEventListener('click', () => previewChord('arpeggio'));

