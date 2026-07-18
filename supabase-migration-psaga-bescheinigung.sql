-- PSAgA Teilnahmebescheinigungen Tabelle
-- Ausführen in: https://supabase.com/dashboard/project/vziankbxuiqwekdbjewg/sql/new

CREATE TABLE IF NOT EXISTS psaga_bescheinigungen (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  user_name         TEXT,
  tenant_id         TEXT,
  datum             DATE NOT NULL,
  ablauf            DATE,
  bescheinigungs_nr TEXT,
  pdf_url           TEXT,
  erstellt_am       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE psaga_bescheinigungen ENABLE ROW LEVEL SECURITY;

CREATE POLICY psaga_bescheinigungen_lesen ON psaga_bescheinigungen
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY psaga_bescheinigungen_schreiben ON psaga_bescheinigungen
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT SELECT, INSERT ON psaga_bescheinigungen TO anon, authenticated;
