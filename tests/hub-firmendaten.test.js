const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('app.js', 'utf8');
const hubPdf = source.slice(source.indexOf('async function hubBescheinigungErstellen()'), source.indexOf('let _hubFaGegenzCanvas'));

test('Hubarbeitsbühnen-Nachweis übernimmt den Verantwortlichen des Lizenznehmers', () => {
  assert.match(source, /function tenantVerantwortlicher\(/);
  assert.match(hubPdf, /const verantwortlicher = tenantVerantwortlicher\(tenantId\)/);
  assert.match(hubPdf, /tenant\?\.ansprechpartner \|\| verantwortlicher\?\.name/);
  assert.doesNotMatch(hubPdf, /gez\. Thomas Schmoldt/);
});

test('Hubarbeitsbühnen-Nachweis übernimmt die Firmendaten', () => {
  assert.match(hubPdf, /const firmaAdresse = \[/);
  assert.match(hubPdf, /tenant\.strasse/);
  assert.match(hubPdf, /tenant\.plz/);
  assert.match(hubPdf, /tenant\.ort/);
  assert.match(hubPdf, /verantwortlicherName/);
});
