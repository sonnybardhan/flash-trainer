# Live Metronome Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user toggle the metronome on/off mid-session from the in-session header, for all drill types.

**Architecture:** Approach A — the `#metro-indicator` becomes always-visible during a session (dimmed `off` class when not running), and an on/off switch added to the top of its `#metro-panel` drives `startMetronome`/`stopMetronome` live and mirrors the preference to the config-screen control. When advance mode is beats/bars (which need the beat clock), the switch is locked on.

**Tech Stack:** Vanilla JS, classic `<script>` tags, no build/test runner. Verified via `node --check` + a headless-Chrome boot + a manual smoke checklist (DOM event behavior has no unit harness).

---

### Task 1: Switch markup + CSS

**Files:** Modify `index.html` (`#metro-panel`, ~lines 499-508); Modify `styles.css` (append)

- [ ] **Step 1: Add the Metronome row + hint to the panel**

In `index.html`, find:
```html
      <div class="metro-panel" id="metro-panel">
        <div class="metro-panel-row">
          <label>BPM</label>
          <div class="stepper" id="live-bpm-stepper" data-min="30" data-max="240" data-step="2"></div>
        </div>
```
Insert the Metronome row + hint as the first children of `#metro-panel` (before the BPM row):
```html
      <div class="metro-panel" id="metro-panel">
        <div class="metro-panel-row">
          <label>Metronome</label>
          <div class="switch" id="live-metro-switch"></div>
        </div>
        <div class="metro-panel-hint" id="live-metro-hint" style="display:none;">Needed for beat/bar advance</div>
        <div class="metro-panel-row">
          <label>BPM</label>
          <div class="stepper" id="live-bpm-stepper" data-min="30" data-max="240" data-step="2"></div>
        </div>
```

- [ ] **Step 2: Add CSS**

Append to `styles.css`:
```css
/* Live metronome toggle */
.metronome-indicator.off { opacity: 0.55; }
.metronome-indicator.off .pulse-dot { opacity: 0.3; animation: none; }
.switch.locked { opacity: 0.5; pointer-events: none; }
.metro-panel-hint { font-size: 11px; color: var(--muted, #888); padding: 0 0 6px; }
```

- [ ] **Step 3: Verify** — `grep -c 'live-metro-switch' index.html` → expect `1`.

- [ ] **Step 4: Commit**
```bash
git add index.html styles.css
git commit -m "feat(metronome): add live metronome switch markup + states"
```

---

### Task 2: `startMetronome`/`stopMetronome` toggle the `off` class (not display)

**Files:** Modify `src/metronome.js`

- [ ] **Step 1: Update startMetronome**

In `src/metronome.js`, in `startMetronome`, change:
```javascript
  $('metro-indicator').style.display = 'flex';
```
to:
```javascript
  $('metro-indicator').classList.remove('off');
```

- [ ] **Step 2: Update stopMetronome**

In `stopMetronome`, change:
```javascript
  $('metro-indicator').style.display = 'none';
```
to:
```javascript
  $('metro-indicator').classList.add('off');
```
(Leave the rest of `stopMetronome` — clearing the scheduler, `metro-panel` close, pulse-dot reset — unchanged.)

- [ ] **Step 3: Verify** — `node --check src/metronome.js` → no output.

- [ ] **Step 4: Commit**
```bash
git add src/metronome.js
git commit -m "feat(metronome): indicator uses off-class instead of hiding"
```

---

### Task 3: Show indicator at session start + drive switch state in `updateLiveAdvanceUI`

**Files:** Modify `src/session-run.js`

- [ ] **Step 1: Show the indicator at session start with the correct on/off state**

In `src/session-run.js`, find (near the end of the start handler):
```javascript
  startTimer();
  if (effectiveAdvance === 'seconds') startAutoAdvance();
  if (state.metronome.enabled) startMetronome();
```
Replace with:
```javascript
  startTimer();
  if (effectiveAdvance === 'seconds') startAutoAdvance();
  // The metronome indicator is visible for the whole session; the live switch
  // in its panel toggles it. startMetronome() clears the 'off' class.
  $('metro-indicator').style.display = 'flex';
  if (state.metronome.enabled) startMetronome();
  else $('metro-indicator').classList.add('off');
```

- [ ] **Step 2: Reflect the switch + lock state in `updateLiveAdvanceUI`**

In `src/session-run.js`, find the end of `updateLiveAdvanceUI` (the last two lines before its closing `}`):
```javascript
  // Mirror MIDI-option visibility from the home select onto the live one.
  $('live-advance-option-midi').hidden = $('advance-option-midi').hidden;
}
```
Replace with:
```javascript
  // Mirror MIDI-option visibility from the home select onto the live one.
  $('live-advance-option-midi').hidden = $('advance-option-midi').hidden;
  // Live metronome switch: reflects enabled; locked on when advance needs the
  // beat clock (beats/bars drive card advancement).
  const metroLocked = (a === 'beats' || a === 'bars');
  $('live-metro-switch').classList.toggle('on', state.metronome.enabled);
  $('live-metro-switch').classList.toggle('locked', metroLocked);
  $('live-metro-hint').style.display = metroLocked ? '' : 'none';
}
```
(`a` is `state.session.advance`, already declared at the top of `updateLiveAdvanceUI`.)

- [ ] **Step 3: Verify** — `node --check src/session-run.js` → no output.

- [ ] **Step 4: Commit**
```bash
git add src/session-run.js
git commit -m "feat(metronome): show indicator all session + sync live switch/lock"
```

---

### Task 4: The `#live-metro-switch` click handler

**Files:** Modify `src/metronome.js`

- [ ] **Step 1: Add the handler**

In `src/metronome.js`, find the existing live-control handler block, specifically:
```javascript
$('session-display-tap').addEventListener('click', (e) => {
  e.stopPropagation();
  $('session-panel').classList.toggle('open');
});
```
Immediately AFTER that block, add:
```javascript
$('live-metro-switch').addEventListener('click', (e) => {
  e.stopPropagation();
  // Locked on while beats/bars advance drives the clock.
  if ($('live-metro-switch').classList.contains('locked')) return;
  state.metronome.enabled = !state.metronome.enabled;
  if (state.metronome.enabled) startMetronome(); else stopMetronome();
  $('live-metro-switch').classList.toggle('on', state.metronome.enabled);
  // Mirror to the config-screen control so the choice persists past the session.
  $('metro-switch').classList.toggle('on', state.metronome.enabled);
  $('bpm-row').style.display = state.metronome.enabled ? 'flex' : 'none';
  $('meter-row').style.display = state.metronome.enabled ? 'flex' : 'none';
  $('accent-row').style.display = state.metronome.enabled ? 'flex' : 'none';
  updateCollapseMeta();
});
```

- [ ] **Step 2: Verify** — `node --check src/metronome.js` → no output.

- [ ] **Step 3: Commit**
```bash
git add src/metronome.js
git commit -m "feat(metronome): live on/off switch handler with beats/bars lock"
```

---

### Task 5: Verification

**Files:** none

- [ ] **Step 1: Syntax + boot**

Run:
```bash
node --check src/metronome.js && node --check src/session-run.js && echo SYNTAXOK
python3 -m http.server 8771 >/tmp/s.log 2>&1 &
SRV=$!; sleep 1
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rm -rf /tmp/cpM
"$CHROME" --headless --disable-gpu --no-sandbox --user-data-dir=/tmp/cpM \
  --virtual-time-budget=5000 --dump-dom "http://localhost:8771/index.html" >/tmp/m.html 2>/tmp/m.log
kill $SRV 2>/dev/null
echo "errors:"; grep -iE "uncaught|is not defined|referenceerror" /tmp/m.log | grep -viE "GPU|gl_|swiftshader|vulkan|dawn|MESA|EGL|MIDI|usb|bluetooth|Permission" | head
echo "switch in dom: $(grep -c live-metro-switch /tmp/m.html)"
echo "hint in dom: $(grep -c live-metro-hint /tmp/m.html)"
```
Expected: `SYNTAXOK`, no error lines, `switch in dom: 1`, `hint in dom: 1`.

- [ ] **Step 2: Manual smoke test (behavior headless can't drive)**

Open `index.html`, start a session with the metronome **off**:
- The metronome indicator is visible but dimmed; tapping it opens the panel; the Metronome switch is off.
- Flip the switch on → the metronome starts ticking, the indicator un-dims and pulses; the config-screen metronome switch is also on after the session.
- Flip it off → ticking stops, indicator dims.
- Set advance to **Every N beats** (in the Advance panel): the metronome auto-starts, and the Metronome switch shows on + locked (dimmed, non-clickable) with the "Needed for beat/bar advance" hint. Switching advance back to **Tap card** unlocks the switch (metronome stays on; can now be turned off).
- Repeat the on/off check in a non-phrase drill (e.g. Chords) to confirm it's available for all drills.

- [ ] **Step 3: Final commit (if manual fixes were needed)**
```bash
git add -A && git commit -m "test(metronome): verify live toggle" || echo "nothing to commit"
```

---

## Notes
- Load order is safe: the `#live-metro-switch` handler and `updateLiveAdvanceUI` both live in already-loaded files and run at runtime; the switch element exists in static HTML before the handler binds.
- `startMetronome` is async; calling it un-awaited from the handler matches the existing pattern (e.g. the live-advance handler).
