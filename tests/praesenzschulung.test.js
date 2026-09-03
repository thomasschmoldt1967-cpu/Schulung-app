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
  test(`${file}: verlinkt Präsenznachweise in Mitarbeiterhistorie und Objektansicht`, () => {
    assert.match(source, /praesenzTeilnahmen/);
    assert.match(source, /praesenzHistorieBlock/);
    assert.match(source, /praesenzObjektNachweiseOeffnen/);
    assert.match(source, /oeffnePdfSigniert/);
  });
  test(`${file}: Präsenzschulung nutzt freien Schulungsort und suchbare Mitarbeiterliste`, () => {
    assert.match(source, /id="praesenz-ort"/);
    assert.match(source, /praesenzMitarbeiterFiltern/);
    assert.match(source, /class="praesenz-ma-zeile"/);
    assert.match(source, /class="praesenz-ma-sprache"/);
    assert.match(source, /praesenzStandardspracheSetzen/);
    assert.match(source, /spracheNachUser/);
    assert.match(source, /sprache: spracheNachUser\[u.id\]/);
    assert.match(source, /inhalte_snapshot: praesenzInhalteSnapshot/);
    assert.match(source, /praesenzDurchfuehrungAnsicht/);
    assert.match(source, /praesenzNachleseOeffnen/);
    assert.doesNotMatch(source, /id="praesenz-objekt"/);
  });
}

test('Migration definiert unveränderbare Teilnehmer- und Objektleiter-Signaturen', () => {
  const sql = fs.readFileSync('supabase-migration-praesenzschulung.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS praesenzschulungen/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS praesenzschulung_teilnehmer/i);
  assert.match(sql, /praesenzschulung_signatur_schutz/i);
});
