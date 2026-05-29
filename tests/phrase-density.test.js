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
