# Phrase Max-Notes-Per-Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-bar sounding-note cap to the phrase drill, controlled by a dynamic-range "Max notes/bar" slider in the Phrase section.

**Architecture:** A pure helper `phraseDensityRange(allowedDurations, restsIncluded)` computes the slider's `{min, max}` from the selected rhythms (max = densest full-bar fill) and the rests toggle (min = 1 with rests, 2/4 without). The cap is enforced inside the generator's existing validate-and-retry loop (`generatePhrase` → `validatePhrase`), failing honestly when infeasible — no silent over-dense fallback. The value persists in `state.notation.phraseMaxNotesPerBar`.

**Tech Stack:** Vanilla JS, classic `<script>` tags sharing one global scope. No build, no DOM test runner. Pure generator logic is unit-tested with standalone Node scripts (`tests/*.test.js`) that read+eval the source files; UI/wiring is verified with `node --check` and a headless-Chrome boot.

**Testing note:** This repo has no test framework. Tasks 1–2 (pure logic) get real red→green Node tests committed under `tests/`. Tasks 3–8 (state/UI/wiring) have no DOM-level unit tests; their verification is `node --check` plus the headless boot + manual checklist in Task 9. This is a deliberate, honest accommodation to the codebase — not skipped testing.

---

### Task 1: `phraseDensityRange` helper (pure)

**Files:**
- Modify: `phrase-gen.js` (add function after `ALL_BEAT_GROUP_IDS`, ~line 51)
- Test: `tests/phrase-density.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/phrase-density.test.js`:

```javascript
// Run: node tests/phrase-density.test.js
// Evals the source in-scope so we can call functions from classic scripts.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'phrase-gen.js'), 'utf8');

const assertions = `
let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log('FAIL ' + label + ': got ' + a + ', want ' + e); }
  else { console.log('ok   ' + label); }
}
// max from rhythms; min from rests toggle
eq(phraseDensityRange(['quarter'], true),  {min:1, max:4},  'quarters, rests on');
eq(phraseDensityRange(['quarter'], false), {min:4, max:4},  'quarters, rests off (locked)');
eq(phraseDensityRange(['quarter','half','eighthPair'], true),  {min:1, max:8}, 'default set, rests on');
eq(phraseDensityRange(['quarter','half','eighthPair'], false), {min:2, max:8}, 'default set, rests off (half floors to 2)');
eq(phraseDensityRange(['tripletEighths','half'], true), {min:1, max:12}, 'triplet-eighths + half, rests on');
eq(phraseDensityRange(['tripletQuarters','quarter'], true), {min:1, max:6}, 'triplet-quarters, rests on');
eq(phraseDensityRange([], true), {min:1, max:1}, 'empty selection guard');
if (failed) { console.log('\\n' + failed + ' FAILED'); process.exit(1); }
console.log('\\nall passed');
`;
eval(src + assertions);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/phrase-density.test.js`
Expected: FAIL — `ReferenceError: phraseDensityRange is not defined` (thrown from the eval).

- [ ] **Step 3: Implement the helper**

In `phrase-gen.js`, immediately after the line `const ALL_BEAT_GROUP_IDS = Object.keys(BEAT_GROUPS);`, add:

```javascript
// Dynamic note-density bounds for the phrase "max notes/bar" slider.
//   max = densest all-sounding fill of a 4-beat bar (rhythm-only; rests can
//         never raise the ceiling).
//   min = 1 when rests are allowed (rest away all but one note), otherwise the
//         sparsest all-sounding fill (2 with half-notes, else 4 for quarters).
function phraseDensityRange(allowedDurations, restsIncluded) {
  const allowed = (allowedDurations || []).filter(id => BEAT_GROUPS[id]);
  if (allowed.length === 0) return { min: 1, max: 1 };
  let maxEventsPerBeat = 0;   // densest group → ceiling
  let maxBeatsPerNote = 0;    // sparsest group → rests-off floor
  for (const id of allowed) {
    const g = BEAT_GROUPS[id];
    const eventsPerBeat = g.events.length / g.beats;
    const beatsPerNote = g.beats / g.events.length;
    if (eventsPerBeat > maxEventsPerBeat) maxEventsPerBeat = eventsPerBeat;
    if (beatsPerNote > maxBeatsPerNote) maxBeatsPerNote = beatsPerNote;
  }
  const max = Math.round(4 * maxEventsPerBeat);
  const min = restsIncluded ? 1 : Math.round(4 / maxBeatsPerNote);
  return { min, max };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/phrase-density.test.js`
Expected: all lines `ok`, final `all passed`.

- [ ] **Step 5: Commit**

```bash
git add phrase-gen.js tests/phrase-density.test.js
git commit -m "feat(phrase): phraseDensityRange helper for note-density slider bounds"
```

---

### Task 2: Enforce the cap in the generator

**Files:**
- Modify: `phrase-gen.js` — `validatePhrase` (line 302) and `generatePhrase` (line 419)
- Test: `tests/phrase-cap.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/phrase-cap.test.js`:

```javascript
// Run: node tests/phrase-cap.test.js
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'phrase-context.js'), 'utf8')
          + '\n' + fs.readFileSync(path.join(__dirname, '..', 'phrase-gen.js'), 'utf8');

const assertions = `
let failed = 0;
const ctx = buildPhraseContext(['1','2','3','4','5','6','7'], 'major', { includesUpperTonic: true });

function maxNotesInAnyBar(phrase) {
  const counts = {};
  for (const e of phrase.events) {
    if (e.kind === 'note') counts[e.bar] = (counts[e.bar] || 0) + 1;
  }
  return Math.max(0, ...Object.values(counts));
}

// (a) cap is honored: generate many 1-bar phrases at cap=2, no bar exceeds 2.
let worst = 0;
for (let i = 0; i < 50; i++) {
  const r = generatePhrase({ context: ctx, bars: 1,
    allowedDurations: ['quarter','half','eighthPair'], maxNotesPerBar: 2,
    maxAttempts: 800, rng: Math.random });
  worst = Math.max(worst, maxNotesInAnyBar(r.phrase));
}
if (worst > 2) { failed++; console.log('FAIL cap honored: saw a bar with ' + worst + ' notes'); }
else console.log('ok   cap honored (worst bar = ' + worst + ' <= 2)');

// (b) no regression: with no cap, generation still succeeds.
try {
  generatePhrase({ context: ctx, bars: 1,
    allowedDurations: ['quarter','half','eighthPair'], maxAttempts: 200, rng: Math.random });
  console.log('ok   no-cap generation still works');
} catch (e) { failed++; console.log('FAIL no-cap generation threw: ' + e.message); }

// (c) infeasible cap fails honestly (throws), not a silent over-dense phrase.
const ctxNoRests = buildPhraseContext(['1','2','3','4','5'], 'major',
  { restPolicy: { targetSilenceFraction: 0, maxSilenceFraction: 0 } });
let threw = false;
try {
  generatePhrase({ context: ctxNoRests, bars: 1, allowedDurations: ['quarter'],
    maxNotesPerBar: 2, maxAttempts: 100, rng: Math.random });
} catch (e) { threw = true; }
if (!threw) { failed++; console.log('FAIL infeasible cap should throw (quarters-only, rests off, cap 2)'); }
else console.log('ok   infeasible cap throws honestly');

if (failed) { console.log('\\n' + failed + ' FAILED'); process.exit(1); }
console.log('\\nall passed');
`;
eval(src + assertions);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/phrase-cap.test.js`
Expected: FAIL on check (a) — `maxNotesPerBar` is currently ignored, so 1-bar phrases routinely exceed 2 notes.

- [ ] **Step 3: Add the cap parameter to `generatePhrase`**

In `phrase-gen.js`, change the `generatePhrase` signature (line 419-421) from:

```javascript
function generatePhrase({ context, bars = 1,
                          allowedDurations = ['half', 'quarter', 'eighthPair'],
                          maxAttempts = 200, rng = Math.random }) {
```

to:

```javascript
function generatePhrase({ context, bars = 1,
                          allowedDurations = ['half', 'quarter', 'eighthPair'],
                          maxNotesPerBar = Infinity,
                          maxAttempts = 200, rng = Math.random }) {
```

And change the validate call (line 432) from:

```javascript
    const err = validatePhrase(assignments, context, bars);
```

to:

```javascript
    const err = validatePhrase(assignments, context, bars, maxNotesPerBar);
```

- [ ] **Step 4: Add the per-bar check to `validatePhrase`**

In `phrase-gen.js`, change the `validatePhrase` signature (line 302) from:

```javascript
function validatePhrase(assignments, context, bars) {
```

to:

```javascript
function validatePhrase(assignments, context, bars, maxNotesPerBar = Infinity) {
```

Then, immediately after the "Every bar must have at least one sounding pitch" loop (the block ending at line 388 with `if (!barHas) return { code: 'barWithoutSoundingPitch', bar: b };` and its closing `}`), add:

```javascript
  // Per-bar sounding-note cap (note-density slider). Counts only notes, not
  // rests. Reuses the retry loop: an over-cap candidate is rejected and the
  // composer tries again; if no candidate fits, generatePhrase throws.
  if (maxNotesPerBar !== Infinity) {
    for (let b = 1; b <= bars; b++) {
      const n = assignments.filter(a => a.slot.bar === b && a.kind === 'note').length;
      if (n > maxNotesPerBar) return { code: 'tooManyNotesInBar', bar: b, count: n, max: maxNotesPerBar };
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/phrase-cap.test.js`
Expected: all `ok`, final `all passed`.

- [ ] **Step 6: Re-run the density test (guard against accidental breakage)**

Run: `node tests/phrase-density.test.js`
Expected: `all passed`.

- [ ] **Step 7: Commit**

```bash
git add phrase-gen.js tests/phrase-cap.test.js
git commit -m "feat(phrase): enforce per-bar sounding-note cap in generator (validate+retry)"
```

---

### Task 3: State default

**Files:**
- Modify: `src/state.js` (phrase block, ~line 41)

- [ ] **Step 1: Add the field**

In `src/state.js`, after the line `phraseRestsIncluded: true    // mirrors CET's allowRests boolean`, add a trailing comma to that line and a new line:

```javascript
    phraseRestsIncluded: true,   // mirrors CET's allowRests boolean
    phraseMaxNotesPerBar: null   // per-bar sounding-note cap; null = no cap (resolves to current max on load)
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/state.js`
Expected: no output (valid).

- [ ] **Step 3: Commit**

```bash
git add src/state.js
git commit -m "feat(phrase): add phraseMaxNotesPerBar state field (null = uncapped)"
```

---

### Task 4: Thread the cap through `phrases.js`

**Files:**
- Modify: `phrases.js` — anchor builder (~line 138-145) and `buildPhraseCard` (~line 154-159)

- [ ] **Step 1: Add `maxNotesPerBar` to the anchor**

In `phrases.js`, in the anchor `return { ... }` object (line 138-145), after the `interaction:` line add `maxNotesPerBar:`. The block becomes:

```javascript
  return {
    key, quality, rootPitch, context,
    bars: ns.phraseBars || 1,
    allowedDurations: (ns.phraseAllowedDurations && ns.phraseAllowedDurations.length)
                       ? ns.phraseAllowedDurations
                       : PHRASE_ALLOWED_DEFAULT,
    interaction: ns.phraseInteraction || 'aural-free',
    maxNotesPerBar: (typeof ns.phraseMaxNotesPerBar === 'number') ? ns.phraseMaxNotesPerBar : Infinity
  };
```

- [ ] **Step 2: Pass it into `generatePhrase`**

In `buildPhraseCard` (line 154-159), add `maxNotesPerBar` to the `generatePhrase` call:

```javascript
    res = generatePhrase({
      context: anchor.context,
      bars: anchor.bars,
      allowedDurations: anchor.allowedDurations,
      maxNotesPerBar: anchor.maxNotesPerBar,
      maxAttempts: 200
    });
```

- [ ] **Step 3: Verify syntax**

Run: `node --check phrases.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add phrases.js
git commit -m "feat(phrase): pass maxNotesPerBar from state through to generator"
```

---

### Task 5: Slider markup + styling

**Files:**
- Modify: `index.html` (Phrase section, between lines 139 and 140)
- Modify: `styles.css` (append a small rule)

- [ ] **Step 1: Insert the slider row**

In `index.html`, between the Rhythm `form-row` (closes at line 139 `</div>`) and the Rests `form-row` (opens at line 140), insert:

```html
      <div class="form-row">
        <label>Max notes/bar</label>
        <div class="maxnotes-control">
          <input type="range" id="phrase-maxnotes-slider" class="ios-slider" min="1" max="8" step="1" value="8">
          <span id="phrase-maxnotes-value" class="maxnotes-value">8</span>
        </div>
      </div>
```

(The `min`/`max`/`value` here are placeholders; `syncPhraseMaxNotesSlider` sets them at runtime.)

- [ ] **Step 2: Add layout CSS**

Append to `styles.css`:

```css
/* Phrase note-density slider */
.maxnotes-control { display: flex; align-items: center; gap: 12px; flex: 1; }
.maxnotes-control .ios-slider { flex: 1; }
.maxnotes-value { min-width: 2ch; text-align: right; font-variant-numeric: tabular-nums; color: var(--text); }
.ios-slider:disabled { opacity: 0.5; }
```

- [ ] **Step 3: Verify the element exists**

Run: `grep -c 'phrase-maxnotes-slider' index.html`
Expected: `1`.

- [ ] **Step 4: Commit**

```bash
git add index.html styles.css
git commit -m "feat(phrase): add max-notes/bar slider markup + styling"
```

---

### Task 6: Slider sync + wiring in `phrase-config.js`

**Files:**
- Modify: `src/phrase-config.js` — add `syncPhraseMaxNotesSlider`, an `input` listener, and update the rhythm-chip `onclick` (line 45-53)

- [ ] **Step 1: Add the sync function**

In `src/phrase-config.js`, immediately after the `renderPhraseRhythmChips` function (after its closing `}` at line 56), add:

```javascript
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
```

- [ ] **Step 2: Update the rhythm-chip onclick to recompute the range**

In `renderPhraseRhythmChips`, replace the `b.onclick = () => { ... };` block (lines 45-53) with:

```javascript
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
```

- [ ] **Step 3: Verify syntax**

Run: `node --check src/phrase-config.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/phrase-config.js
git commit -m "feat(phrase): slider sync + recompute bounds on rhythm change"
```

---

### Task 7: Recompute on the Rests toggle (`drill-config.js`)

**Files:**
- Modify: `src/drill-config.js` — `phrase-rests-switch` handler (line 289-293)

- [ ] **Step 1: Update the rests-switch handler**

In `src/drill-config.js`, replace the `$('phrase-rests-switch').addEventListener(...)` block (lines 289-293) with:

```javascript
$('phrase-rests-switch').addEventListener('click', () => {
  const prevMax = phraseDensityRange(
    state.notation.phraseAllowedDurations, state.notation.phraseRestsIncluded !== false
  ).max;
  state.notation.phraseRestsIncluded = state.notation.phraseRestsIncluded === false;
  $('phrase-rests-switch').classList.toggle('on', state.notation.phraseRestsIncluded);
  syncPhraseMaxNotesSlider(prevMax);   // rests toggle moves the min; re-clamp
  saveNotationSettings();
});
```

(Toggling rests doesn't change the max, so `prevMax === newMax`; the track-up branch is a no-op and only the min-clamp applies — exactly what we want.)

- [ ] **Step 2: Verify syntax**

Run: `node --check src/drill-config.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/drill-config.js
git commit -m "feat(phrase): recompute note-density bounds when rests toggle changes"
```

---

### Task 8: Initialize the slider on load (`notation-settings.js`)

**Files:**
- Modify: `src/notation-settings.js` — `applyNotationSettingsToUI` (after line 62)

- [ ] **Step 1: Call sync after the phrase controls are applied**

In `src/notation-settings.js`, in `applyNotationSettingsToUI`, after the line:

```javascript
  $('phrase-rests-switch').classList.toggle('on', ns.phraseRestsIncluded !== false);
```

add:

```javascript
  syncPhraseMaxNotesSlider();   // resolve null→current max, set slider bounds/value
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/notation-settings.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/notation-settings.js
git commit -m "feat(phrase): initialize max-notes slider on settings load"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Syntax-check everything touched**

Run:
```bash
node --check phrase-gen.js && node --check phrases.js && \
for f in src/state.js src/phrase-config.js src/drill-config.js src/notation-settings.js; do node --check "$f" || break; done && echo ALLOK
```
Expected: `ALLOK`.

- [ ] **Step 2: Re-run the logic tests**

Run: `node tests/phrase-density.test.js && node tests/phrase-cap.test.js`
Expected: both end `all passed`.

- [ ] **Step 3: Headless boot — no console errors, slider present**

Run:
```bash
python3 -m http.server 8751 >/tmp/srv.log 2>&1 &
SRV=$!; sleep 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -rf /tmp/cpV
"$CHROME" --headless --disable-gpu --no-sandbox --user-data-dir=/tmp/cpV \
  --virtual-time-budget=5000 --dump-dom "http://localhost:8751/index.html" >/tmp/domV.html 2>/tmp/conV.log
kill $SRV 2>/dev/null
echo "errors:"; grep -iE "uncaught|is not defined|referenceerror" /tmp/conV.log | grep -viE "GPU|gl_|swiftshader|vulkan|dawn|MESA|EGL|MIDI|usb|bluetooth|Permission" | head
echo "slider in dom: $(grep -c phrase-maxnotes-slider /tmp/domV.html)"
```
Expected: no error lines; `slider in dom: 1`.

- [ ] **Step 4: Manual smoke test (the parts headless can't drive)**

Open `index.html`, select the **Phrases** drill, and confirm:
- The "Max notes/bar" slider appears under Rhythm; default sits at the max for the current rhythm set (8 for the default set).
- Adding **eighth-note triplets** raises the max to 12; the value tracks up to 12 (since it was at the old max).
- Removing triplets drops the max back to 8 and the value clamps down.
- Turning **Rests included OFF** with quarters-only locks the slider (disabled) at 4; turning it back ON restores min 1.
- Lowering the slider (e.g. to 2) then starting a session: phrases have ≤2 sounding notes/bar. Setting an infeasible combo (rests off, dense-only, very low cap) shows the existing "couldn't build a phrase" toast rather than an over-dense phrase.
- Reload the page: the slider value persists.

- [ ] **Step 5: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "test(phrase): verify max-notes-per-bar end to end" || echo "nothing to commit"
```

---

## Notes for the implementer

- **Load order is fine:** `phraseDensityRange` lives in `phrase-gen.js` (loaded before all `src/` files) and `syncPhraseMaxNotesSlider` lives in `src/phrase-config.js`. Every cross-file call (from `drill-config.js`, `notation-settings.js`) happens at runtime, by which point all scripts are loaded.
- **Default = null, not 8:** `phraseMaxNotesPerBar: null` resolves to the *current* max on first load (via `syncPhraseMaxNotesSlider`), so there's no effective cap for any rhythm set until the user moves the slider — a faithful refinement of the spec's "no effective cap until touched."
- **No silent fallback:** the cap rides the generator's existing exhaust→throw→null→toast path. Do not add a "best effort, return anyway" branch — that's the exact bug CET fixed.
