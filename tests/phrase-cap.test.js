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
