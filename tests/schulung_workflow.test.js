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

test('Mandatory completion documentation is universal and immutable', () => {
  assert.match(source, /UNIVERSAL_SCHULUNGSFELDER/);
  assert.match(source, /employee_signature/);
  assert.match(source, /training_date/);
  assert.match(source, /completion_acknowledgement/);
  assert.match(source, /readOnly.*form\.abgeschlossen/);
});

test('Training start shows mandatory checkbox notice and completion enforces acknowledgement', () => {
  assert.match(source, /Alle erforderlichen Kontrollkästchen müssen aktiviert werden/);
  assert.match(source, /formular-acknowledgement/);
  assert.match(source, /Pflichtbestätigung.*gelesen/);
});

test('BL counter-signatures are available for every completed training and append-only', () => {
  assert.match(source, /blSignaturFuerSchulungOeffnen/);
  assert.match(source, /schulung_bl_counter_signatures/);
  assert.match(source, /append-only/);
});

test('PDF backup uses immutable unique paths and visible primary-backup errors', () => {
  assert.doesNotMatch(source, /'x-upsert':\s*'true'/);
  assert.match(source, /immutablePdfPath/);
  assert.match(source, /Primär-Backup fehlgeschlagen/);
});

test('Neue Schulungsthemen erben den zentralen Pflichtnachweis automatisch', () => {
  assert.match(source, /VERBINDLICHER_SCHULUNGSNACHWEIS/);
  assert.match(source, /verbindlichenSchulungsnachweisPruefen/);
  assert.match(source, /fehler\.push\(\.\.\.verbindlichenSchulungsnachweisPruefen/);
  assert.match(source, /universalHtml.*VERBINDLICHER_SCHULUNGSNACHWEIS\.hinweis/);
});
test('Keine Browser-Dialoge im neuen Prüfworkflow', () => {
  const start = source.indexOf('function blLeiternPruefungOeffnen');
  const end = source.indexOf('async function blMitarbeiterMobilSpeichern', start);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(source.slice(start, end), /\b(alert|confirm|prompt)\s*\(/);
});
