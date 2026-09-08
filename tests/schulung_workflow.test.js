const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('app.js', 'utf8');

test('Mitarbeiterformular übernimmt Stammdaten automatisch', () => {
  assert.match(source, /const AUTO_SCHULUNGSFELDER = new Set/);
  assert.match(source, /schulungsAutoFelder\(zuw\)/);
  assert.match(source, /Automatisch aus Stammdaten/);
  assert.match(source, /AUTO_AUSBLENDEN/);
});

test('Mitarbeiter muss keine BL-/Unterweisenden-Signatur leisten', () => {
  assert.match(source, /const BL_SIGNATUR_FELDER = new Set\(\['lt_sig_uw','lt_sig_bl'\]\)/);
  assert.match(source, /BL_SIGNATUR_FELDER\.has\(feld\.id\) && currentUser\?\.role === 'mitarbeiter'/);
  assert.match(source, /Die BL-Signatur wird bewusst erst im Bereichsleiter-Workflow gesetzt/);
});

test('Bereichsleiter hat separaten Prüf- und Signaturworkflow', () => {
  assert.match(source, /function blLeiternPruefungOeffnen\(/);
  assert.match(source, /function blLeiternPruefungSpeichern\(/);
  assert.match(source, /BL_PRUEFUNG_LEITERN_TRITTE/);
  assert.match(source, /lt_sig_bl: signatur/);
  assert.match(source, /Prüfung durch BL/);
});

test('Keine Browser-Dialoge im neuen Prüfworkflow', () => {
  const start = source.indexOf('function blLeiternPruefungOeffnen');
  const end = source.indexOf('async function blMitarbeiterMobilSpeichern', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source.slice(start, end), /\b(alert|confirm|prompt)\s*\(/);
});
