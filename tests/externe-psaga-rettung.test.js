const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ROOT = process.cwd();

for (const file of ['app.src.js', 'app.js']) {
  test(`${file}: eingebaute DGUV-Vorlagen bleiben in der Adminansicht als Module erkennbar`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /const eingebautMeta = new Map\(\[\[HUB_VORLAGE_ID,\{_eingebaut:true\}\],\[BP_VORLAGE_ID,\{_eingebaut:true,_bpModul:true\}\]\]\)/);
    assert.match(source, /return Object\.assign\(\{/);
    assert.match(source, /hubAdminVorschau\(\)/);
    assert.match(source, /bpAdminVorschau\(\)/);
  });

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

  test(`${file}: Firmenstammdaten und neue Schulung sind getrennt`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /externePsagaFirmen/);
    assert.match(source, /externePsagaFirmaAuswaehlen/);
    assert.match(source, /externePsagaNeueFirma/);
    assert.match(source, /externe_psaga_firmen/);
    assert.match(source, /firma_id/);
    assert.match(source, /externePsagaSchulungSpeichern/);
  });

  test('index.html: externe Firmenliste bietet eigene Suche und Trefferanzeige', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.match(html, /id="eps-firmen-suche"/);
    assert.match(html, /externePsagaFirmenRendern\(\)/);
    assert.match(html, /id="eps-firmen-anzahl"/);
  });

  test(`${file}: Firmenauswahl filtert die Schulungsliste zentral`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /externePsagaSchulungPasstZuAktiverFirma/);
    assert.match(source, /externePsagaSchulungen\.filter\(externePsagaSchulungPasstZuAktiverFirma\)/);
    assert.doesNotMatch(source, /externePsagaUebersichtEinrichten|externePsagaUebersichtFiltern|eps-suche-toolbar|id=\\?['"]eps-suche/);
  });

  test(`${file}: Zertifikat nennt Schulungsleiter und praktische Rettungsgrundlage`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /doc\.text\(trainerName, ML\+8, y\+25\)/);
    assert.match(source, /DGUV Regel 112-198.*DGUV Regel 112-199.*praktische Rettungsübungen durchgeführt/);
    assert.match(source, /modulUntertitelZeilen/);
    assert.match(source, /365 TAGE GÜLTIG BIS/);
  });

  test(`${file}: externes Zertifikat enthält Ort, Anschrift, Logos und beide DGUV-Regeln`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /ort:s\.ort/);
    assert.match(source, /SCHULUNGSORT/);
    assert.match(source, /Petermax-Müller-Str\. 3, 30880 Laatzen/);
    assert.match(source, /DGUV 112-198 \+ 112-199/);
    assert.match(source, /cscLogoDataUrl/);
    assert.match(source, /csc-logo-transparent\.png/);
    assert.match(source, /doc\.addImage\(FISAT_LOGO_B64, 'PNG'/);
    assert.match(source, /FISAT MITGLIED/);
    assert.match(source, /CSC GmbH\s+·\s+Petermax-Müller-Str\. 3, 30880 Laatzen/);
    assert.match(source, /sibeLogoTransparent/);
  });

  test(`${file}: langer externer Schulungstitel wird mehrzeilig dargestellt`, () => {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /modulTitelZeilen/);
    assert.match(source, /modulUntertitelZeilen/);
    assert.match(source, /modulBoxH/);
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


test('Externe-PSAgA-Migration enthält Firmenstammdaten und Schulungszuordnung', () => {
  const sql = fs.readFileSync('supabase-migration-externe-psaga.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS externe_psaga_firmen/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS firma_id/);
  assert.match(sql, /DROP POLICY IF EXISTS externe_psaga_firmen_lesen/);
});
