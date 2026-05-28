// ============================================================
// keyboard.js — minimal on-screen piano docked at the bottom of the
// flashcard view during phrase aural-recall sessions.
//
// Pointer-down on a key → simulateNoteOn(midi); pointer-up / -leave
// → simulateNoteOff(midi). Routes through the same code path as a
// real MIDI device, so the live matcher + MIDI-thru audio both work.
//
// v1 layout: 2 octaves centered on the phrase root. White + black keys.
// Fixed velocity (110). No sustain pedal, no programmatic volume.
// ============================================================

const KEYBOARD_OCTAVES = 2;

// White-key MIDI offsets within one octave (relative to C).
const _WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
// Black-key MIDI offsets — null where no black key follows this white.
// Indexed alongside _WHITE_OFFSETS: positions 0,1,3,4,5 have a black key after.
const _BLACK_OFFSETS = [1, 3, null, 6, 8, 10, null];

function renderOnScreenKeyboard(container, rootMidi) {
  container.replaceChildren();
  container.classList.add('osk');

  // Base C below the root, snapped to the nearest C at or below it.
  const baseC = rootMidi - (((rootMidi % 12) + 12) % 12);
  const startC = baseC - 12;  // start one octave below the root's C

  const grid = document.createElement('div');
  grid.className = 'osk-grid';
  container.appendChild(grid);

  for (let oct = 0; oct < KEYBOARD_OCTAVES + 1; oct++) {
    const octBase = startC + 12 * oct;
    for (let i = 0; i < _WHITE_OFFSETS.length; i++) {
      const whiteMidi = octBase + _WHITE_OFFSETS[i];
      grid.appendChild(_makeKey(whiteMidi, false));
      if (_BLACK_OFFSETS[i] != null) {
        const blackMidi = octBase + _BLACK_OFFSETS[i];
        const black = _makeKey(blackMidi, true);
        grid.appendChild(black);
      }
    }
  }
}

function _makeKey(midi, isBlack) {
  const key = document.createElement('button');
  key.className = 'osk-key' + (isBlack ? ' black' : ' white');
  key.dataset.midi = String(midi);
  // Label C4 / C5 etc. on white-key C's for visual orientation.
  if (!isBlack && (((midi % 12) + 12) % 12) === 0) {
    const octave = Math.floor(midi / 12) - 1;
    const lab = document.createElement('span');
    lab.className = 'osk-label';
    lab.textContent = `C${octave}`;
    key.appendChild(lab);
  }
  const pressOn = (e) => {
    e.preventDefault();
    key.classList.add('pressed');
    if (typeof simulateNoteOn === 'function') simulateNoteOn(midi, 110);
  };
  const pressOff = (e) => {
    if (!key.classList.contains('pressed')) return;
    key.classList.remove('pressed');
    if (typeof simulateNoteOff === 'function') simulateNoteOff(midi);
  };
  key.addEventListener('pointerdown', pressOn);
  key.addEventListener('pointerup', pressOff);
  key.addEventListener('pointerleave', pressOff);
  key.addEventListener('pointercancel', pressOff);
  return key;
}

function showOnScreenKeyboardFor(card) {
  const dock = document.getElementById('osk-dock');
  if (!dock) return;
  // Visible only for phrase drill aural-recall modes (free or in time).
  const shouldShow = card && card.drill === 'phrase' &&
    (card.interaction === 'aural-free' || card.interaction === 'aural-intime');
  if (!shouldShow) {
    dock.style.display = 'none';
    return;
  }
  dock.style.display = 'block';
  // Anchor on the card's root MIDI for natural placement.
  const LETTER_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const r = card.rootPitch;
  const rootMidi = (r.octave + 1) * 12 + LETTER_SEMI[r.letter] + r.accidental;
  renderOnScreenKeyboard(dock, rootMidi);
}

function hideOnScreenKeyboard() {
  const dock = document.getElementById('osk-dock');
  if (dock) dock.style.display = 'none';
}
