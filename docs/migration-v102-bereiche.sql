-- ============================================================
-- Migration v102: 4-Ebenen-Hierarchie — Bereichsleiter + Bereiche
-- CSC GmbH Schulungs-App
-- Ausführen im Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Neue Tabelle: bereiche
CREATE TABLE IF NOT EXISTS bereiche (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL,
  name        TEXT NOT NULL,
  ort         TEXT,
  objekt      TEXT,
  erstellt_am TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE bereiche ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bereiche_all" ON bereiche FOR ALL USING (true);
GRANT ALL ON TABLE bereiche TO anon;
GRANT ALL ON TABLE bereiche TO authenticated;

-- 2. users: neue Spalten
ALTER TABLE users ADD COLUMN IF NOT EXISTS bereich_id  TEXT REFERENCES bereiche(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS personalnummer TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sprache     TEXT DEFAULT 'de';

-- 3. zuweisungen: bereich_id
ALTER TABLE zuweisungen ADD COLUMN IF NOT EXISTS bereich_id TEXT REFERENCES bereiche(id);

-- 4. Rolle bereichsleiter erlauben
-- CHECK-Constraint erweitern (Supabase erlaubt kein ALTER CHECK direkt)
-- → Constraint droppen und neu anlegen:
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','firma','verantwortlicher','bereichsleiter','mitarbeiter'));

-- 5. Index für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_bereiche_tenant ON bereiche(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_bereich   ON users(bereich_id);

-- ============================================================
-- FERTIG — nach Ausführung den Dev informieren
-- ============================================================
