const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

for (const file of ['app.src.js', 'app.js']) {
  test(`${file}: Dreibein-Rettungsübung ist Zertifikatsthema`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /Rettung aus beengten Räumen mit Dreibein nach DGUV Regel 113-004/);
  });

  test(`${file}: externe Themen-/Signaturspeicherung bleibt ohne unbekannte Spalte kompatibel`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /__schulungsleiter_unterschrift/);
    assert.match(source, /SB\.patch\('externe_psaga_schulungen',[\s\S]{0,900}\{inhalte:gespeicherteInhalte\}/);
    assert.match(source, /const gespeicherteInhalte=\[\.\.\.inhalte,\{id:EXTERNE_PSAGA_SIGNATUR_ID,titel:signatur\}\]/);
    assert.doesNotMatch(source, /SB\.patch\('externe_psaga_schulungen',[\s\S]{0,900}schulungsleiter_unterschrift:signatur/);
  });

  test(`${file}: Zertifikate können vor Versand als Vorschau erzeugt werden`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /externePsagaVersandVorschau/);
    assert.match(source, /externePsagaZertifikat\(schulungId,t\.id,false,false\)/);
    assert.match(source, /Zertifikat als PDF-Vorschau öffnen/);
    assert.match(source, /Verbindlich an Firma senden/);
  });

  test(`${file}: Teilnehmernamen können nachträglich korrigiert werden`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /externePsagaTeilnehmerBearbeiten/);
    assert.match(source, /SB\.patch\('externe_psaga_teilnehmer'/);
  });

  test(`${file}: unterschriebene Teilnehmerliste kann per Kamera geprüft und gespeichert werden`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /externePsagaTeilnehmerlisteFoto/);
    assert.match(source, /capture='environment'/);
    assert.match(source, /Unterschriebene Teilnehmerliste prüfen/);
    assert.match(source, /SB\.uploadFile\(blob,path,'image\/jpeg'\)/);
    assert.match(source, /teilnehmerliste_foto_path/);
  });

  test(`${file}: externe Schulungsliste bietet Suche und Akkordeon`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /externePsagaUebersichtEinrichten/);
    assert.match(source, /externePsagaUebersichtFiltern/);
    assert.match(source, /eps-suche/);
    assert.match(source, /epsAccordion/);
  });

  test(`${file}: Zertifikat nennt Schulungsleiter und praktische Rettungsgrundlage`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /doc\.text\(trainerName, ML\+8, y\+25\)/);
    assert.match(source, /DGUV Regel 112-198.*DGUV Regel 112-199.*praktische Rettungsübungen durchgeführt/);
    assert.match(source, /splitTextToSize\(modulUntertitel, CW - 22\)/);
    assert.match(source, /365 TAGE GÜLTIG BIS/);
  });
}

test('Storage-Migration erlaubt PDF und Teilnehmerlistenbilder', () => {
  const sql = fs.readFileSync('supabase-migration-schulung-pdfs-storage.sql', 'utf8');
  assert.match(sql, /schulung-pdfs/);
  assert.match(sql, /image\/jpeg/);
  assert.match(sql, /schulung_pdfs_anlegen/);
});

test('Externe-PSAgA-Migration enthält den Speicherpfad für Teilnehmerlistenfotos', () => {
  const sql = fs.readFileSync('supabase-migration-externe-psaga.sql', 'utf8');
  assert.match(sql, /teilnehmerliste_foto_path/);
});
