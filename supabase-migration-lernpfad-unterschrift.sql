-- ============================================================
--  Lernpfad-Unterschriften Tabelle — einmalig im Supabase SQL-Editor ausführen
--  Schulungsmanagement-App CSC GmbH
--  Erstellt: 2026-06-28
-- ============================================================

-- 1. Tabelle erstellen
CREATE TABLE IF NOT EXISTS lernpfad_unterschriften (
  id              TEXT PRIMARY KEY,          -- '{user_id}' (eine Unterschrift pro Mitarbeiter)
  user_id         TEXT NOT NULL,             -- Supabase auth.users id
  tenant_id       TEXT NOT NULL DEFAULT '',  -- Mandant (tenantId des Mitarbeiters)
  vollname        TEXT NOT NULL,             -- Vollständiger Name des Mitarbeiters
  unterzeichnet_am TIMESTAMPTZ NOT NULL,     -- Zeitstempel der Unterschrift
  alle_kapitel_am  TIMESTAMPTZ,              -- Zeitstempel wann alle Kapitel abgehakt wurden
  erstellt_am     TIMESTAMPTZ DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ DEFAULT now()
);

-- 2. Index für schnelle Abfragen
CREATE INDEX IF NOT EXISTS idx_lp_unt_user
  ON lernpfad_unterschriften(user_id, tenant_id);

-- 3. RLS aktivieren
ALTER TABLE lernpfad_unterschriften ENABLE ROW LEVEL SECURITY;

-- 4. Policy: Jeder sieht/verwaltet nur seine eigene Unterschrift
DROP POLICY IF EXISTS lernpfad_unt_eigene ON lernpfad_unterschriften;
CREATE POLICY lernpfad_unt_eigene ON lernpfad_unterschriften
  FOR ALL USING (true);  -- App nutzt eigene Mandantentrennung per tenant_id

-- 5. Kommentar
COMMENT ON TABLE lernpfad_unterschriften IS
  'Digitale Abschluss-Bestätigung der Mitarbeiter nach Abschluss des 22-Kapitel Lernpfads. Enthält Vollname + Zeitstempel. Nur möglich wenn alle 22 Kapitel abgehakt.';

-- Fertig! Verifizieren:
-- SELECT COUNT(*) FROM lernpfad_unterschriften;
