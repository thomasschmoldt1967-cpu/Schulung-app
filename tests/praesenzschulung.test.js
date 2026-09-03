const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

for (const file of ['app.src.js', 'app.js']) {
  const source = fs.readFileSync(file, 'utf8');
  test(`${file}: enthält Präsenzschulungsdatenmodell und Signaturreihenfolge`, () => {
    assert.match(source, /praesenzschulungen/);
    assert.match(source, /praesenzschulung_teilnehmer/);
    assert.match(source, /praesenzObjektleiterUnterzeichnen/);
    assert.match(source, /praesenzschulungAbschlussPruefen/);
  });
}

test('Migration definiert unveränderbare Teilnehmer- und Objektleiter-Signaturen', () => {
  const sql = fs.readFileSync('supabase-migration-praesenzschulung.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS praesenzschulungen/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS praesenzschulung_teilnehmer/i);
  assert.match(sql, /praesenzschulung_signatur_schutz/i);
});
