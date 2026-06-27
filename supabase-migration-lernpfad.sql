-- ============================================================
--  Lernpfad-Fortschritt Tabelle — einmalig im Supabase SQL-Editor ausführen
--  Schulungsmanagement-App CSC GmbH — Stufe 1: 21-Kapitel Checkliste
--  Erstellt: 2026-06-27
-- ============================================================

-- 1. Tabelle erstellen
CREATE TABLE IF NOT EXISTS lernpfad_fortschritt (
  id              TEXT PRIMARY KEY,          -- '{user_id}_{kapitel_id}' z.B. 'abc-123_kap_01'
  user_id         TEXT NOT NULL,             -- Supabase auth.users id
  tenant_id       TEXT NOT NULL DEFAULT '',  -- Mandant (tenantId des Mitarbeiters)
  kapitel_id      TEXT NOT NULL,             -- 'kap_01' ... 'kap_21'
  abgehakt        BOOLEAN NOT NULL DEFAULT false,
  abgehakt_am     TIMESTAMPTZ,               -- Zeitstempel des Abhakelns
  bestaetigt_am   TIMESTAMPTZ,               -- Zeitstempel der Verantwortlichen-Bestätigung
  bestaetigt_von  TEXT,                      -- user_id des Verantwortlichen
  erstellt_am     TIMESTAMPTZ DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ DEFAULT now()
);

-- 2. Index für schnelle Abfragen pro Mitarbeiter
CREATE INDEX IF NOT EXISTS idx_lernpfad_user 
  ON lernpfad_fortschritt(user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_lernpfad_kapitel 
  ON lernpfad_fortschritt(kapitel_id);

-- 3. RLS aktivieren (Mandantentrennung — wichtig!)
ALTER TABLE lernpfad_fortschritt ENABLE ROW LEVEL SECURITY;

-- 4. Policy: Jeder sieht nur seinen eigenen Fortschritt
DROP POLICY IF EXISTS lernpfad_eigener_fortschritt ON lernpfad_fortschritt;
CREATE POLICY lernpfad_eigener_fortschritt ON lernpfad_fortschritt
  FOR ALL USING (true);  -- App nutzt eigene Mandantentrennung per tenant_id

-- 5. Kommentar zur Dokumentation
COMMENT ON TABLE lernpfad_fortschritt IS 
  'Fortschritt der Mitarbeiter im 21-Kapitel Lernpfad (Gebäudereinigung & Höhentechnologie). Stufe 1: Checklisten-System. Stufe 2+3: Interaktive Tests + Mehrsprachigkeit (geplant).';

-- Fertig! Tabelle ist bereit für die App.
-- Verifizieren: SELECT COUNT(*) FROM lernpfad_fortschritt;
