// ============================================================
// phrase-gen.js — rhythm composer + phrase generator + validator.
//
// Port of CET's RhythmComposer / PhraseGenerator / PhraseValidator
// (Swift) to JS, with one rhythm extension over CET: tripletQuarters
// (three quarter-note heads spanning two beats).
//
// Pure: no DOM access, no audio. Inputs:
//   - PitchContext: { available, chordTones, avoidNotes, resolvesTo,
//                     restPolicy, includesUpperTonic }
//   - bars: 1 / 2 / 4
//   - allowedDurations: subset of BEAT_GROUPS
//   - rng (function -> [0,1)) for seedable runs; defaults to Math.random
//
// Output: { phrase, templateId, attempts } or throws on exhausted
// attempts. `phrase.events` is a flat list of:
//   { kind: 'note'|'rest', semitone, octaveOffset, duration, bar,
//     beat, onset, isTriplet, tripletGroupId }
// where `semitone` is the integer semitone offset from the tonic
// (0..11 typically; 12 for the upper tonic).
// ============================================================

// ---------- Beat groups ----------

// Each entry: { id, beats, events: [duration, withinBeatStrength[]],
//               isCadential, shortCode }
const BEAT_GROUPS = {
  half:            { beats: 2, events: [{ duration: 'half',          strength: 1.0 }],
                     isCadential: true,  shortCode: 'h' },
  quarter:         { beats: 1, events: [{ duration: 'quarter',       strength: 1.0 }],
                     isCadential: true,  shortCode: 'q' },
  eighthPair:      { beats: 1, events: [
                       { duration: 'eighth', strength: 1.0 },
                       { duration: 'eighth', strength: 0.5 }
                     ],
                     isCadential: false, shortCode: 'ee' },
  tripletEighths:  { beats: 1, events: [
                       { duration: 'tripletEighth', strength: 1.0 },
                       { duration: 'tripletEighth', strength: 0.5 },
                       { duration: 'tripletEighth', strength: 0.5 }
                     ],
                     isCadential: false, shortCode: 'ttt', isTriplet: true },
  tripletQuarters: { beats: 2, events: [
                       { duration: 'tripletQuarter', strength: 1.0 },
                       { duration: 'tripletQuarter', strength: 0.5 },
                       { duration: 'tripletQuarter', strength: 0.5 }
                     ],
                     isCadential: false, shortCode: 'tqq', isTriplet: true }
};
const ALL_BEAT_GROUP_IDS = Object.keys(BEAT_GROUPS);

// Beat strengths in 4/4. Index = beat-1 (0..3). 1 > 3 > 2 = 4.
const METER_STRENGTH_4_4 = [1.0, 0.4, 0.7, 0.4];

// ---------- RNG ----------

// xorshift64* — same shape as CET's SeededRandomGenerator. Returns a
// function() -> [0, 1).
function makeSeededRng(seed) {
  // Avoid the all-zero state.
  let stateLo = (seed >>> 0) || 0xCAFEF00D;
  let stateHi = ((seed / 0x100000000) >>> 0) || 0xDEADBEEF;
  // 53-bit float from two uint32s.
  return function next() {
    let lo = stateLo, hi = stateHi;
    // x ^= x >> 12
    lo = (lo ^ (lo >>> 12 | (hi & 0xFFF) << 20)) >>> 0;
    hi = (hi ^ (hi >>> 12)) >>> 0;
    // x ^= x << 25
    let newLo = (lo << 25) >>> 0;
    let newHi = ((hi << 25) | (lo >>> 7)) >>> 0;
    lo = (lo ^ newLo) >>> 0;
    hi = (hi ^ newHi) >>> 0;
    // x ^= x >> 27
    lo = (lo ^ ((lo >>> 27) | (hi & 0x7FFFFFF) << 5)) >>> 0;
    hi = (hi ^ (hi >>> 27)) >>> 0;
    stateLo = lo; stateHi = hi;
    // Cheap mix → uniform float in [0, 1).
    const mixed = (hi * 0x100000 + (lo >>> 12));
    return mixed / 0x10000000000000;
  };
}

// Weighted pick: returns an index in [0, weights.length).
function weightedIndex(weights, rng) {
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return 0;
  let pick = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    pick -= weights[i];
    if (pick < 0) return i;
  }
  return weights.length - 1;
}

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

// ---------- Rhythm composer ----------

function composeRhythm(bars, allowedDurations, rng) {
  const target = bars * 4;
  const allowed = allowedDurations.filter(id => BEAT_GROUPS[id]);
  if (allowed.length === 0) throw new Error('no allowed beat-groups');
  if (!allowed.some(id => BEAT_GROUPS[id].isCadential)) {
    throw new Error('no cadential group in allowed durations');
  }

  const groups = [];
  let cursor = 0;
  while (cursor < target) {
    const remaining = target - cursor;
    const candidates = allowed.filter(id => {
      const g = BEAT_GROUPS[id];
      if (g.beats > remaining) return false;
      // If this group exactly fills the rest of the bar, it must be cadential.
      // (Across multi-bar phrases this only triggers at the last group.)
      const fillsExactly = Math.abs(g.beats - remaining) < 1e-9;
      if (fillsExactly && !g.isCadential) return false;
      return true;
    });
    let pick;
    if (candidates.length > 0) {
      pick = pickRandom(candidates, rng);
    } else if (allowed.includes('quarter')) {
      pick = 'quarter';
    } else {
      throw new Error('no candidate group fits — composer dead-end');
    }
    groups.push(pick);
    cursor += BEAT_GROUPS[pick].beats;
  }

  return buildTemplateFromGroups(groups);
}

// ---------- Rhythm template (slots) ----------

function buildTemplateFromGroups(groups) {
  const slots = [];
  let onset = 0;
  let tripletCounter = 0;

  for (const id of groups) {
    const g = BEAT_GROUPS[id];
    const beatIndex = Math.floor(onset);
    const bar = Math.floor(beatIndex / 4) + 1;
    const beatInBar = (beatIndex % 4) + 1;
    const beatStrength = METER_STRENGTH_4_4[beatIndex % 4];

    const tripletGroupId = g.isTriplet ? tripletCounter++ : null;
    const eventsCount = g.events.length;
    // Per-event onset offsets within the beat group:
    //   - eighthPair: 0, 0.5
    //   - tripletEighths: 0, 1/3, 2/3
    //   - tripletQuarters: 0, 2/3, 4/3 (each event is 2/3 of a beat)
    //   - quarter / half: 0
    let offsets;
    if (id === 'eighthPair')      offsets = [0, 0.5];
    else if (id === 'tripletEighths')  offsets = [0, 1/3, 2/3];
    else if (id === 'tripletQuarters') offsets = [0, 2/3, 4/3];
    else                                offsets = [0];

    for (let i = 0; i < eventsCount; i++) {
      slots.push({
        duration:        g.events[i].duration,
        bar, beat: beatInBar,
        onset:           onset + offsets[i],
        metricWeight:    beatStrength * g.events[i].strength,
        isTriplet:       !!g.isTriplet,
        tripletGroupId
      });
    }
    onset += g.beats;
  }

  const totalBeats = groups.reduce((s, id) => s + BEAT_GROUPS[id].beats, 0);
  const bars = Math.max(1, Math.round(totalBeats / 4));
  const id = 'composed_' + groups.map(g => BEAT_GROUPS[g].shortCode).join('');
  return { id, bars, slots };
}

// ---------- Pitch sampling ----------

function samplePitches(template, context, rng) {
  // Pool entries: { semitone, octaveOffset }. Append upper tonic if opted in.
  const pool = context.available.map(s => ({ semitone: s, octaveOffset: 0 }));
  if (context.includesUpperTonic) {
    pool.push({ semitone: context.tonic, octaveOffset: 1 });
  }

  const out = [];
  let prev = null;
  for (const slot of template.slots) {
    const weights = pitchWeights(slot, prev, pool, context);
    const idx = weightedIndex(weights, rng);
    const entry = pool[idx];
    out.push({ slot, kind: 'note', semitone: entry.semitone, octaveOffset: entry.octaveOffset });
    prev = entry;
  }
  return out;
}

function pitchWeights(slot, prev, pool, context) {
  const isStrong = slot.metricWeight >= 0.7;
  const chordSet = new Set(context.chordTones);
  const avoidSet = new Set(context.avoidNotes);
  const weights = [];
  for (let i = 0; i < pool.length; i++) {
    const entry = pool[i];
    const isChord = chordSet.has(entry.semitone);
    const isAvoid = avoidSet.has(entry.semitone);
    let w;
    if (isStrong) {
      w = isChord ? 8.0 : 1.0;
      if (isAvoid) w = 0.1;
    } else {
      w = isChord ? 3.0 : 2.5;
      if (isAvoid) w = 1.5;
    }
    // Near-veto on exact repeats (same semitone AND same octave).
    if (prev && prev.semitone === entry.semitone && prev.octaveOffset === entry.octaveOffset) {
      w *= 0.03;
    }
    // Step bias: +50% if this entry is adjacent to the previous one in the pool.
    if (prev) {
      const prevIdx = pool.findIndex(e => e.semitone === prev.semitone && e.octaveOffset === prev.octaveOffset);
      if (prevIdx >= 0 && Math.abs(prevIdx - i) === 1) w *= 1.5;
    }
    weights.push(w);
  }
  return weights;
}

// ---------- Rest insertion ----------

function insertRests(assignments, context, bars, rng) {
  const policy = context.restPolicy || { targetSilenceFraction: 0, maxSilenceFraction: 0 };
  if (policy.targetSilenceFraction <= 0) return assignments;

  const out = assignments.map(a => ({ ...a }));
  const totalBeats = out.reduce((s, a) => s + durationBeats(a.slot.duration), 0);
  const targetSilent = totalBeats * policy.targetSilenceFraction;

  const eligible = restEligibleIndices(out, bars);
  if (eligible.length === 0) return out;

  let indicesPool = [...eligible];
  let weights = indicesPool.map(i => restPositionWeight(out[i].slot, bars));
  let silentBeats = 0;

  while (silentBeats < targetSilent && indicesPool.length > 0) {
    const pickIdx = weightedIndex(weights, rng);
    const slotIdx = indicesPool[pickIdx];
    out[slotIdx] = { ...out[slotIdx], kind: 'rest', semitone: null, octaveOffset: 0 };
    silentBeats += durationBeats(out[slotIdx].slot.duration);
    indicesPool.splice(pickIdx, 1);
    weights.splice(pickIdx, 1);
  }
  return out;
}

function restEligibleIndices(assignments, bars) {
  const out = [];
  for (let i = 0; i < assignments.length; i++) {
    if (i === 0 || i === assignments.length - 1) continue;            // never first/last
    if (assignments[i].slot.isTriplet) continue;                       // triplets are atomic
    const s = assignments[i].slot;
    // Anchor beats: bar 2/3/4's beat 1 must sound (multi-bar phrases).
    if (bars > 1 && s.bar > 1 && s.beat === 1 && Math.abs(s.onset - (s.bar - 1) * 4) < 1e-9) continue;
    out.push(i);
  }
  return out;
}

function restPositionWeight(slot, bars) {
  let w = 1.0;
  if (slot.beat === 3) w *= 2.5;
  if (bars >= 2 && slot.bar === 1 && slot.beat === 4) w *= 2.0;
  if (slot.metricWeight < 0.7) w *= 1.3;
  return w;
}

function durationBeats(duration) {
  switch (duration) {
    case 'half':           return 2;
    case 'quarter':        return 1;
    case 'eighth':         return 0.5;
    case 'tripletEighth':  return 1/3;
    case 'tripletQuarter': return 2/3;
    case 'sixteenth':      return 0.25;
    default: return 1;
  }
}

// ---------- Validator ----------

const VALIDATION_OK = null;

function validatePhrase(assignments, context, bars) {
  if (assignments.length === 0) return { code: 'empty' };

  const final = assignments[assignments.length - 1];
  if (final.kind !== 'note') return { code: 'finalIsRest' };
  if (!new Set(context.chordTones).has(final.semitone)) {
    return { code: 'finalNotChordTone', semitone: final.semitone };
  }
  if (durationBeats(final.slot.duration) < 1) {
    return { code: 'finalTooShort', duration: final.slot.duration };
  }
  // Final on strong beat (beat 1 or 3 in 4/4).
  if (final.slot.beat !== 1 && final.slot.beat !== 3) {
    return { code: 'finalOnWeakBeat', beat: final.slot.beat };
  }

  if (assignments[0].kind !== 'note') return { code: 'firstSlotIsRest' };

  // Avoid notes: must resolve down by step within the next sounding event;
  // can't be sustained longer than an eighth.
  const avoidSet = new Set(context.avoidNotes);
  const chordSet = new Set(context.chordTones);
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (a.kind !== 'note' || !avoidSet.has(a.semitone)) continue;
    if (i === assignments.length - 1) return { code: 'avoidNoteAtPhraseEnd', semitone: a.semitone };
    if (durationBeats(a.slot.duration) > 0.5) {
      return { code: 'avoidNoteSustained', semitone: a.semitone, duration: a.slot.duration };
    }
    const next = nextSounding(assignments, i);
    const resolves = (context.resolvesTo[a.semitone] || []).some(t => t === next?.semitone);
    if (!next || !resolves) {
      return { code: 'avoidNoteUnresolved', semitone: a.semitone, next: next?.semitone };
    }
  }

  // Non-chord tones on strong beats must resolve by step into a chord tone
  // on the next sounding event.
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    if (a.kind !== 'note') continue;
    if (a.slot.metricWeight < 0.7) continue;
    if (chordSet.has(a.semitone)) continue;
    if (avoidSet.has(a.semitone)) continue;  // already handled above
    const next = nextSounding(assignments, i);
    if (!next) continue;  // last note is checked separately
    const semDist = Math.abs((next.semitone + 12 * next.octaveOffset) -
                              (a.semitone + 12 * a.octaveOffset));
    if (!chordSet.has(next.semitone) || semDist > 2) {
      return { code: 'nonChordToneStrongBeatUnresolved', semitone: a.semitone, beat: a.slot.beat };
    }
  }

  // Contour check: not monotonic (all ascending or all descending) for length >= 4.
  const sounding = assignments.filter(a => a.kind === 'note');
  if (sounding.length >= 4) {
    let allAsc = true, allDesc = true;
    for (let i = 1; i < sounding.length; i++) {
      const prev = sounding[i - 1].semitone + 12 * sounding[i - 1].octaveOffset;
      const curr = sounding[i].semitone + 12 * sounding[i].octaveOffset;
      if (curr <= prev) allAsc = false;
      if (curr >= prev) allDesc = false;
    }
    if (allAsc || allDesc) return { code: 'monotonicContour' };
  }

  // No three consecutive identical sounding pitches.
  for (let i = 2; i < sounding.length; i++) {
    if (sounding[i].semitone === sounding[i - 1].semitone &&
        sounding[i].semitone === sounding[i - 2].semitone &&
        sounding[i].octaveOffset === sounding[i - 1].octaveOffset &&
        sounding[i].octaveOffset === sounding[i - 2].octaveOffset) {
      return { code: 'threeConsecutiveSame', semitone: sounding[i].semitone };
    }
  }

  // Rest rules.
  // Every bar must have at least one sounding pitch.
  for (let b = 1; b <= bars; b++) {
    const barHas = assignments.some(a => a.slot.bar === b && a.kind === 'note');
    if (!barHas) return { code: 'barWithoutSoundingPitch', bar: b };
  }
  // No rests inside triplet groups.
  const tripletGroups = new Map();
  for (const a of assignments) {
    if (a.slot.tripletGroupId == null) continue;
    if (!tripletGroups.has(a.slot.tripletGroupId)) tripletGroups.set(a.slot.tripletGroupId, []);
    tripletGroups.get(a.slot.tripletGroupId).push(a);
  }
  for (const group of tripletGroups.values()) {
    if (group.some(a => a.kind === 'rest')) return { code: 'restInsideTriplet' };
  }
  // Silence fraction cap.
  const totalBeats = assignments.reduce((s, a) => s + durationBeats(a.slot.duration), 0);
  const silentBeats = assignments.filter(a => a.kind === 'rest')
                                  .reduce((s, a) => s + durationBeats(a.slot.duration), 0);
  const silentFrac = silentBeats / totalBeats;
  const maxFrac = context.restPolicy?.maxSilenceFraction ?? 0.25;
  if (silentFrac > maxFrac) return { code: 'silenceFractionExceeded', observed: silentFrac, max: maxFrac };

  return VALIDATION_OK;
}

function nextSounding(assignments, fromIdx) {
  for (let j = fromIdx + 1; j < assignments.length; j++) {
    if (assignments[j].kind === 'note') return assignments[j];
  }
  return null;
}

// ---------- Top-level generator ----------

function generatePhrase({ context, bars = 1,
                          allowedDurations = ['half', 'quarter', 'eighthPair'],
                          maxAttempts = 200, rng = Math.random }) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let template;
    try {
      template = composeRhythm(bars, allowedDurations, rng);
    } catch (e) {
      throw new Error(`composer failed: ${e.message}`);
    }
    let assignments = samplePitches(template, context, rng);
    assignments = insertRests(assignments, context, bars, rng);
    const err = validatePhrase(assignments, context, bars);
    if (err) { lastError = err; continue; }
    return {
      phrase: { templateId: template.id, bars, events: assignments.map(toEvent) },
      templateId: template.id,
      attempts: attempt
    };
  }
  const last = lastError ? `${lastError.code}` : 'unknown';
  throw new Error(`phrase generation exhausted after ${maxAttempts} attempts (last: ${last})`);
}

function toEvent(a) {
  return {
    kind: a.kind,
    semitone: a.kind === 'note' ? a.semitone : null,
    octaveOffset: a.kind === 'note' ? a.octaveOffset : 0,
    duration: a.slot.duration,
    bar: a.slot.bar,
    beat: a.slot.beat,
    onset: a.slot.onset,
    isTriplet: a.slot.isTriplet,
    tripletGroupId: a.slot.tripletGroupId
  };
}

// Compact text representation for debugging. "C q | D e E e | F h"
const DEGREE_LABEL_FROM_SEMI = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: '#4',
  7: '5', 8: 'b6', 9: '6', 10: 'b7', 11: '7'
};
const DURATION_SHORT = {
  half: 'h', quarter: 'q', eighth: 'e',
  tripletEighth: 'te', tripletQuarter: 'tq', sixteenth: 's'
};
function formatPhrase(phrase) {
  const bars = [];
  for (let b = 1; b <= phrase.bars; b++) {
    const evs = phrase.events.filter(e => e.bar === b);
    bars.push(evs.map(e => {
      const dur = DURATION_SHORT[e.duration] || e.duration;
      if (e.kind === 'rest') return `_${dur}`;
      let lab = DEGREE_LABEL_FROM_SEMI[((e.semitone % 12) + 12) % 12] || `${e.semitone}`;
      if (e.octaveOffset > 0) lab += '↑';
      return `${lab}${dur}`;
    }).join(' '));
  }
  return bars.join(' | ');
}
