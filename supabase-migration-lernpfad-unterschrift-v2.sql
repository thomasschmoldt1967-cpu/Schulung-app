-- ============================================================
--  Lernpfad-Unterschriften: Verantwortlichen-Spalten ergänzen
--  Schulungsmanagement-App CSC GmbH — v42 Erweiterung
--  Erstellt: 2026-06-28
-- ============================================================

-- Verantwortlichen-Unterschrift ergänzen (falls Spalten noch nicht existieren)
ALTER TABLE lernpfad_unterschriften
  ADD COLUMN IF NOT EXISTS verantwortlicher_id      TEXT,          -- user_id des Verantwortlichen
  ADD COLUMN IF NOT EXISTS verantwortlicher_name     TEXT,          -- Vollname des Verantwortlichen
  ADD COLUMN IF NOT EXISTS verantwortlicher_am       TIMESTAMPTZ;  -- Zeitstempel der V-Unterschrift

-- Kommentar aktualisieren
COMMENT ON TABLE lernpfad_unterschriften IS
  'Digitale Abschluss-Bestätigung nach 22-Kapitel Lernpfad. Mitarbeiter + Verantwortlicher unterzeichnen separat. Nachweis für BGBau/Gewerbeamt-Kontrollen.';

-- Verifizieren:
-- SELECT id, vollname, unterzeichnet_am, verantwortlicher_name, verantwortlicher_am FROM lernpfad_unterschriften;
