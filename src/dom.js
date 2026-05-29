// ============================================================
// DOM helpers
// ============================================================
const $ = (id) => document.getElementById(id);

// Safe localStorage read — corrupt JSON (interrupted write, tampering, a
// browser that throws on storage access) must never brick boot, so fall
// back instead of throwing.
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) {
    console.warn(`[storage] corrupt value for "${key}", ignoring`, e);
    return fallback;
  }
}

// Restart a CSS transition on an element: remove the class, force a reflow
// so the browser registers the removal, then re-add it.
function retriggerTransition(el) {
  el.classList.remove('transition');
  void el.offsetWidth;
  el.classList.add('transition');
}

function formatSpellingHTML(id) {
  if (id.includes('#')) return id[0] + '<span style="margin-left:1px;">♯</span>';
  if (id.length > 1 && id[1] === 'b') return id[0] + '<span style="margin-left:1px;">♭</span>';
  return id;
}

function formatSpellingDisplay(id) {
  if (id.includes('#')) return id[0] + '<span class="accidental">♯</span>';
  if (id.length > 1 && id[1] === 'b') return id[0] + '<span class="accidental">♭</span>';
  return id;
}

function formatInversion(i) {
  if (i === 'root') return 'root';
  return i + ' inv';
}



// ============================================================
// Stepper component
// ============================================================
function buildStepper(elId, value, onChange) {
  const el = $(elId);
  const min = +el.dataset.min;
  const max = +el.dataset.max;
  const step = +el.dataset.step;

  el.innerHTML = `
    <button class="stepper-minus">−</button>
    <div class="stepper-value">${value}</div>
    <button class="stepper-plus">+</button>
  `;

  const valueEl = el.querySelector('.stepper-value');
  const minusBtn = el.querySelector('.stepper-minus');
  const plusBtn = el.querySelector('.stepper-plus');

  let current = value;
  let holdTimer = null;
  let holdInterval = null;

  const update = (newVal) => {
    newVal = Math.max(min, Math.min(max, newVal));
    if (newVal === current) return;
    current = newVal;
    const cur = el.querySelector('.stepper-value');
    if (cur) cur.textContent = current;
    onChange(current);
    minusBtn.disabled = current <= min;
    plusBtn.disabled = current >= max;
  };

  const startHold = (direction) => {
    update(current + direction * step);
    holdTimer = setTimeout(() => {
      holdInterval = setInterval(() => update(current + direction * step), 80);
    }, 350);
  };
  const stopHold = () => {
    clearTimeout(holdTimer);
    clearInterval(holdInterval);
    holdTimer = null;
    holdInterval = null;
  };

  minusBtn.addEventListener('mousedown', () => startHold(-1));
  minusBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(-1); });
  plusBtn.addEventListener('mousedown', () => startHold(1));
  plusBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startHold(1); });
  ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(evt => {
    minusBtn.addEventListener(evt, stopHold);
    plusBtn.addEventListener(evt, stopHold);
  });

  const attachValueClick = (node) => {
    node.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = current;
      input.min = min;
      input.max = max;
      node.replaceWith(input);
      input.focus();
      input.select();

      const commit = () => {
        const v = parseInt(input.value);
        const newVal = isNaN(v) ? current : Math.max(min, Math.min(max, v));
        const newValueEl = document.createElement('div');
        newValueEl.className = 'stepper-value';
        newValueEl.textContent = newVal;
        attachValueClick(newValueEl);
        input.replaceWith(newValueEl);
        current = newVal;
        onChange(current);
        minusBtn.disabled = current <= min;
        plusBtn.disabled = current >= max;
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  };
  attachValueClick(valueEl);

  minusBtn.disabled = current <= min;
  plusBtn.disabled = current >= max;

  return { setValue: (v) => update(v), getValue: () => current };
}

