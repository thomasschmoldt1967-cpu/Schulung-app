-- Externe PSAgA-Präsenzschulungen
-- Nur für CSC-Admin-Verwaltung; Teilnehmer benötigen keinen App-Login.

CREATE TABLE IF NOT EXISTS externe_psaga_schulungen (
  id TEXT PRIMARY KEY,
  firmenname TEXT NOT NULL,
  ansprechpartner TEXT NOT NULL,
  telefon TEXT,
  email TEXT NOT NULL,
  ort TEXT NOT NULL,
  datum DATE NOT NULL,
  thema TEXT NOT NULL,
  schulungsleiter_vorname TEXT NOT NULL,
  schulungsleiter_nachname TEXT NOT NULL,
  erstellt_von TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS externe_psaga_teilnehmer (
  id TEXT PRIMARY KEY,
  schulung_id TEXT NOT NULL REFERENCES externe_psaga_schulungen(id) ON DELETE CASCADE,
  vorname TEXT NOT NULL,
  nachname TEXT NOT NULL,
  teilgenommen BOOLEAN NOT NULL DEFAULT true,
  bescheinigungs_nr TEXT,
  pdf_path TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS externe_psaga_versand (
  id TEXT PRIMARY KEY,
  schulung_id TEXT NOT NULL REFERENCES externe_psaga_schulungen(id) ON DELETE CASCADE,
  empfaenger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen',
  gesendet_am TIMESTAMPTZ,
  fehler TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE externe_psaga_schulungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE externe_psaga_teilnehmer ENABLE ROW LEVEL SECURITY;
ALTER TABLE externe_psaga_versand ENABLE ROW LEVEL SECURITY;

-- Die bestehende App verwendet eine eigene Login-Schicht. Der Bereich darf deshalb
-- nur über die Admin-Oberfläche genutzt werden; die UI blendet ihn für andere Rollen aus.
CREATE POLICY externe_psaga_schulungen_lesen ON externe_psaga_schulungen
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY externe_psaga_schulungen_schreiben ON externe_psaga_schulungen
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY externe_psaga_teilnehmer_lesen ON externe_psaga_teilnehmer
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY externe_psaga_teilnehmer_schreiben ON externe_psaga_teilnehmer
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY externe_psaga_versand_lesen ON externe_psaga_versand
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY externe_psaga_versand_schreiben ON externe_psaga_versand
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON externe_psaga_schulungen TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON externe_psaga_teilnehmer TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON externe_psaga_versand TO anon, authenticated;
