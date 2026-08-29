const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

for (const file of ['app.src.js', 'app.js']) {
  test(`${file}: Dreibein-Rettungsübung ist Zertifikatsthema`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /Rettung aus beengten Räumen mit Dreibein nach DGUV Regel 123-004/);
  });

  test(`${file}: externe Themen-/Signaturspeicherung bleibt ohne unbekannte Spalte kompatibel`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /__schulungsleiter_unterschrift/);
    assert.match(source, /SB\.patch\('externe_psaga_schulungen',[\s\S]{0,900}\{inhalte:gespeicherteInhalte\}/);
    assert.match(source, /const gespeicherteInhalte=\[\.\.\.inhalte,\{id:EXTERNE_PSAGA_SIGNATUR_ID,titel:signatur\}\]/);
    assert.doesNotMatch(source, /SB\.patch\('externe_psaga_schulungen',[\s\S]{0,900}schulungsleiter_unterschrift:signatur/);
  });
}
