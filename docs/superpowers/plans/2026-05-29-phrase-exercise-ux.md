# Phrase Exercise UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the phrase drill flashcard — hide the stale chord placeholder, center the staff, add a deliberate Reveal/Hide button (no tap-to-reveal, no layout shift), advance via the forward arrow with a "ready" highlight on correct quiz answers, hold the revealed staff ~2s before auto-advancing, and give the intro chord a fixed ~2s sustain.

**Architecture:** Mostly CSS + small JS wiring in the phrase layer. The Reveal/Hide toggle and "ready" highlight reuse existing elements (`#card-notation`, `#forward-btn`) and the existing `renderPhrase`/`updateNavButtons` machinery. The intro-chord duration becomes a fixed `preludeSec` option on `playPhrase`.

**Tech Stack:** Vanilla JS, classic `<script>` tags, no build/test runner. Verified via `node --check`, a headless boot probe (placeholder hidden, button present, nav logic), and a manual smoke test for audio/visual behavior.

---

### Task 1: CSS — hide placeholder, center + reserve notation, button + ready styles

**Files:** Modify `styles.css`

- [ ] **Step 1: Hide the chord placeholder for phrase drills**

Find this rule (the interval/degree hide block, ends with `.card-name-overlay { display: none; }`):
```css
  .flash-card.drill-degrees   .card-root,
  .flash-card.drill-degrees   .card-quality,
  .flash-card.drill-degrees   .card-inversion,
  .flash-card.drill-degrees   .card-focus-badge,
  .flash-card.drill-degrees   .card-name-overlay { display: none; }
```
Replace it with the same block plus the phrase selectors:
```css
  .flash-card.drill-degrees   .card-root,
  .flash-card.drill-degrees   .card-quality,
  .flash-card.drill-degrees   .card-inversion,
  .flash-card.drill-degrees   .card-focus-badge,
  .flash-card.drill-degrees   .card-name-overlay,
  .flash-card.drill-phrases   .card-root,
  .flash-card.drill-phrases   .card-quality,
  .flash-card.drill-phrases   .card-inversion,
  .flash-card.drill-phrases   .card-focus-badge,
  .flash-card.drill-phrases   .card-name-overlay { display: none; }
```

- [ ] **Step 2: Append phrase notation centering/min-height + button + ready styles**

Append to the end of `styles.css`:
```css
/* Phrase drill: centered staff, reserved height (no layout shift), reveal button */
.flash-card.drill-phrases .card-notation { margin-left: auto; margin-right: auto; min-height: 220px; }
#phrase-reveal-btn {
  display: none;
  margin: 14px auto 0;
  padding: 8px 22px;
  font: inherit;
  font-size: 13px;
  color: var(--text);
  background: var(--surface, rgba(255,255,255,0.06));
  border: 1px solid var(--border, rgba(255,255,255,0.18));
  border-radius: 999px;
  cursor: pointer;
}
#phrase-reveal-btn:active { transform: scale(0.96); }
.nav-btn.ready {
  color: var(--accent, #6ea8fe);
  border-color: var(--accent, #6ea8fe);
  box-shadow: 0 0 0 2px var(--accent, #6ea8fe) inset;
}
```

- [ ] **Step 3: Verify** — `grep -c 'drill-phrases   .card-name-overlay' styles.css` → expect `1`; `grep -c 'phrase-reveal-btn' styles.css` → expect `2`.

- [ ] **Step 4: Commit**
```bash
git add styles.css
git commit -m "feat(phrase): hide placeholder, center staff, reveal-btn + ready styles"
```

---

### Task 2: Reveal/Hide button markup

**Files:** Modify `index.html`

- [ ] **Step 1: Add the button right after `#card-notation`**

Find:
```html
    <div class="card-notation" id="card-notation"></div>
    <div class="card-phrase-dots" id="card-phrase-dots" style="display:none;"></div>
```
Replace with:
```html
    <div class="card-notation" id="card-notation"></div>
    <button id="phrase-reveal-btn" type="button">Reveal</button>
    <div class="card-phrase-dots" id="card-phrase-dots" style="display:none;"></div>
```

- [ ] **Step 2: Verify** — `grep -c 'phrase-reveal-btn' index.html` → expect `1`.

- [ ] **Step 3: Commit**
```bash
git add index.html
git commit -m "feat(phrase): add Reveal/Hide button under the notation"
```

---

### Task 3: Reveal toggle + remove tap-to-reveal

**Files:** Modify `phrases.js`, `src/phrase-config.js`, `src/card.js`

- [ ] **Step 1: Add reveal-toggle helpers + button sync in `phrases.js`**

In `phrases.js`, immediately AFTER the `revealPhraseCard` function (it ends with `}` after the `renderPhrase(...)` line), add:
```javascript
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
```

- [ ] **Step 2: Sync the button on every phrase render**

In `phrases.js`, at the END of `renderPhraseCard` (after the `label.classList.remove('correct', 'wrong');` line, before the closing `}`), add:
```javascript
  updatePhraseRevealBtn(card);
```

- [ ] **Step 3: Make the card-body tap inert for phrases**

In `phrases.js`, replace the body of `handlePhraseCardTap` so it no longer reveals or advances on a body tap:
```javascript
// Card-body taps are inert for phrases — reveal is the dedicated button,
// advance is the forward arrow (or auto-advance on correct / on the clock).
function handlePhraseCardTap(card) {
  return;
}
```

- [ ] **Step 4: Wire the button click in `src/phrase-config.js`**

In `src/phrase-config.js`, find the existing card-tone-replay listener:
```javascript
$('card-tone-replay').addEventListener('click', async (e) => {
```
Immediately BEFORE that line, add:
```javascript
$('phrase-reveal-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const c = state.session && state.session.lastCard;
  if (c && c.drill === 'phrase') togglePhraseReveal(c);
});
```

- [ ] **Step 5: Verify** — `node --check phrases.js && node --check src/phrase-config.js` → no output.

- [ ] **Step 6: Commit**
```bash
git add phrases.js src/phrase-config.js
git commit -m "feat(phrase): dedicated Reveal/Hide toggle; card tap no longer reveals"
```

---

### Task 4: Forward arrow — aural-free always enabled + ready highlight

**Files:** Modify `src/deck.js`

- [ ] **Step 1: Update `cardIsSolved` so aural-free/sing advance any time**

In `src/deck.js`, replace the `cardIsSolved` function body's phrase branch. Find:
```javascript
function cardIsSolved(card) {
  if (!card) return false;
  if (card.drill === 'degree' || card.drill === 'phrase') {
    return !!card.answered;
  }
  return true;
}
```
Replace with:
```javascript
function cardIsSolved(card) {
  if (!card) return false;
  if (card.drill === 'degree') return !!card.answered;
  if (card.drill === 'phrase') {
    // Quiz modes gate the forward arrow on a correct answer; aural-free and
    // sing-back can be advanced any time (solved on view).
    if (card.interaction === 'aural-intime' || card.interaction === 'id-degrees') {
      return !!card.answered;
    }
    return true;
  }
  return true;
}
```

- [ ] **Step 2: Add the `ready` highlight to `updateNavButtons`**

In `src/deck.js`, find the end of `updateNavButtons`:
```javascript
  const hasFuture = s.historyIdx < s.history.length - 1;
  fwdBtn.disabled = !(hasFuture || cardIsSolved(s.lastCard));
}
```
Replace with:
```javascript
  const hasFuture = s.historyIdx < s.history.length - 1;
  fwdBtn.disabled = !(hasFuture || cardIsSolved(s.lastCard));
  // "Ready" highlight: a correctly-answered proceed-on-correct phrase card.
  const lc = s.lastCard;
  const ready = !!(lc && lc.drill === 'phrase' &&
    (lc.interaction === 'aural-intime' || lc.interaction === 'id-degrees') &&
    lc.answered && lc.correct !== false);
  fwdBtn.classList.toggle('ready', ready);
}
```

- [ ] **Step 3: Verify** — `node --check src/deck.js` → no output.

- [ ] **Step 4: Commit**
```bash
git add src/deck.js
git commit -m "feat(phrase): aural-free arrow always enabled; ready highlight on correct"
```

---

### Task 5: Hold ~2s before auto-advancing

**Files:** Modify `phrases.js`

- [ ] **Step 1: In-time recall hold**

In `phrases.js`, in `startInTimeForCard`'s `onComplete`, find:
```javascript
      setTimeout(() => {
        if (state.session && state.session.lastCard === card) nextCard();
      }, success ? 620 : 1200);
```
Replace with:
```javascript
      setTimeout(() => {
        if (state.session && state.session.lastCard === card) nextCard();
      }, 2000);
```

- [ ] **Step 2: ID-degrees hold**

In `phrases.js`, in `_handlePhraseIdDegreeTap`'s completion branch, find:
```javascript
    setTimeout(() => {
      if (state.session && state.session.lastCard === card) nextCard();
    }, 700);
```
Replace with:
```javascript
    setTimeout(() => {
      if (state.session && state.session.lastCard === card) nextCard();
    }, 2000);
```

- [ ] **Step 3: Verify** — `node --check phrases.js` → no output.

- [ ] **Step 4: Commit**
```bash
git add phrases.js
git commit -m "feat(phrase): hold revealed staff ~2s before auto-advancing"
```

---

### Task 6: Intro reference chord = fixed ~2s

**Files:** Modify `phrase-play.js`, `phrases.js`

- [ ] **Step 1: Support a fixed `preludeSec` in `playPhrase`**

In `phrase-play.js`, find:
```javascript
    const preludeBars = opts.chord.preludeBars || 0;
    const chordDur = preludeBars > 0
      ? preludeBars * 4 * beatSec        // solo prelude — stop when melody starts
      : phraseDurSec + 0.2;              // legacy: pad under the whole phrase
```
Replace with:
```javascript
    const preludeBars = opts.chord.preludeBars || 0;
    const fixedPrelude = opts.chord.preludeSec || 0;   // fixed seconds; overrides bars
    const chordDur = fixedPrelude > 0
      ? fixedPrelude                     // fixed solo prelude (tempo-independent)
      : preludeBars > 0
      ? preludeBars * 4 * beatSec        // solo prelude — stop when melody starts
      : phraseDurSec + 0.2;              // legacy: pad under the whole phrase
```
Then, a few lines below, find:
```javascript
    preludeSec = preludeBars > 0 ? preludeBars * 4 * beatSec : 0;
```
Replace with:
```javascript
    preludeSec = fixedPrelude > 0 ? fixedPrelude
               : preludeBars > 0 ? preludeBars * 4 * beatSec
               : 0;
```

- [ ] **Step 2: Have `_phraseChordOpts` request the fixed ~2s prelude**

In `phrases.js`, in `_phraseChordOpts`, find:
```javascript
  return { tones, octaveOffset: -1, volume: 0.6, preludeBars: 1 };
```
Replace with:
```javascript
  return { tones, octaveOffset: -1, volume: 0.6, preludeSec: 2.0 };
```

- [ ] **Step 3: Verify** — `node --check phrase-play.js && node --check phrases.js` → no output.

- [ ] **Step 4: Commit**
```bash
git add phrase-play.js phrases.js
git commit -m "feat(phrase): intro reference chord fixed ~2s prelude"
```

---

### Task 7: Verification

**Files:** none

- [ ] **Step 1: Syntax**
```bash
for f in phrases.js phrase-play.js src/deck.js src/phrase-config.js src/card.js; do node --check "$f" || echo "FAIL $f"; done && echo SYNTAXOK
```
Expected: `SYNTAXOK`.

- [ ] **Step 2: Headless boot probe**
```bash
python3 -m http.server 8781 >/tmp/s.log 2>&1 &
SRV=$!; sleep 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -rf /tmp/cpU
"$CHROME" --headless --disable-gpu --no-sandbox --user-data-dir=/tmp/cpU \
  --virtual-time-budget=5000 --dump-dom "http://localhost:8781/index.html" >/tmp/u.html 2>/tmp/u.log
kill $SRV 2>/dev/null
echo "errors:"; grep -iE "uncaught|is not defined|referenceerror" /tmp/u.log | grep -viE "GPU|gl_|swiftshader|vulkan|dawn|MESA|EGL|MIDI|usb|bluetooth|Permission" | head
echo "reveal btn present: $(grep -c phrase-reveal-btn /tmp/u.html)"
```
Expected: no error lines; `reveal btn present: 1`.

- [ ] **Step 3: Manual smoke test (audio/visual the probe can't drive)**

Open `index.html`, run a **Phrases / aural-free** session:
- No giant "C major root position" — the card shows the mode tag + a centered staff area; the **Reveal** button sits under the notation.
- The intro reference chord sustains ~2 seconds before the melody.
- Tapping the card body does **nothing** (no reveal).
- Clicking **Reveal** shows the centered staff and the button reads **Hide**; clicking **Hide** clears it — and the button does **not** move (no layout shift).
- The `›` forward arrow is enabled; clicking it advances.
- Switch to **ID-degrees** (or in-time): on a correct answer the forward arrow gets the accent **ready** highlight, the staff reveals, and it auto-advances after ~2s.

- [ ] **Step 4: Final commit (if manual fixes were needed)**
```bash
git add -A && git commit -m "test(phrase): verify phrase UX polish" || echo "nothing to commit"
```

---

## Notes
- Load order is safe: `togglePhraseReveal`/`updatePhraseRevealBtn` live in `phrases.js` (loaded before `src/`); the `#phrase-reveal-btn` listener in `src/phrase-config.js` and the `ready` toggle in `src/deck.js` both run at runtime against already-defined globals.
- `#phrase-reveal-btn` defaults to `display:none` in CSS; `updatePhraseRevealBtn` shows it (`block`) only for aural-free, so it never appears in other drills/modes.
