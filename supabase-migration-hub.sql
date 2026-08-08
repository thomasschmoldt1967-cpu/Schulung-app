-- ============================================================
--  Hubarbeitsbühnen DGUV 308-008 — Supabase Migration
--  Schulungsmanagement-App CSC GmbH — v113
--  Erstellt: 2026-08-08
-- ============================================================

-- 1. Fortschritts-Tabelle (Kapitel-Tracking)
CREATE TABLE IF NOT EXISTS hub_fortschritt (
  id              TEXT PRIMARY KEY,          -- '{user_id}_{kapitel_id}'
  user_id         TEXT NOT NULL,
  tenant_id       TEXT NOT NULL DEFAULT '',
  kapitel_id      TEXT NOT NULL,             -- 'hub-01' ... 'hub-14'
  abgehakt        BOOLEAN NOT NULL DEFAULT false,
  abgehakt_am     TIMESTAMPTZ,
  erstellt_am     TIMESTAMPTZ DEFAULT now(),
  aktualisiert_am TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_fortschritt_user
  ON hub_fortschritt(user_id, tenant_id);

ALTER TABLE hub_fortschritt ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hub_fortschritt_policy ON hub_fortschritt;
CREATE POLICY hub_fortschritt_policy ON hub_fortschritt
  FOR ALL USING (true);

-- 2. Quiz-Ergebnis & Bescheinigung
CREATE TABLE IF NOT EXISTS hub_unterschriften (
  id                  TEXT PRIMARY KEY,      -- '{user_id}_{tenant_id}'
  user_id             TEXT NOT NULL,
  user_name           TEXT,
  tenant_id           TEXT NOT NULL DEFAULT '',
  vollname            TEXT,
  quiz_punkte         INTEGER,
  quiz_gesamt         INTEGER,
  unterzeichnet_am    TIMESTAMPTZ,           -- Zeitpunkt Quiz bestanden
  verantwortlicher_id TEXT,
  verantwortlicher_name TEXT,
  verantwortlicher_am TIMESTAMPTZ,
  ausstellungsdatum   TEXT,                  -- ISO-Datum der Bescheinigung
  pdf_url             TEXT,
  erstellt_am         TIMESTAMPTZ DEFAULT now(),
  aktualisiert_am     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hub_unterschriften_tenant
  ON hub_unterschriften(tenant_id, unterzeichnet_am);

ALTER TABLE hub_unterschriften ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hub_unterschriften_policy ON hub_unterschriften;
CREATE POLICY hub_unterschriften_policy ON hub_unterschriften
  FOR ALL USING (true);

COMMENT ON TABLE hub_fortschritt IS
  'Fortschritt der Mitarbeiter im Hubarbeitsbühnen-Schulungsmodul (14 Kapitel, DGUV 308-008).';

COMMENT ON TABLE hub_unterschriften IS
  'Quiz-Ergebnisse und Teilnahmebescheinigungen für Hubarbeitsbühnen DGUV 308-008.';

-- Verifikation
SELECT 'hub_fortschritt:    ' || COUNT(*) || ' Zeilen' AS info FROM hub_fortschritt
UNION ALL
SELECT 'hub_unterschriften: ' || COUNT(*) || ' Zeilen' FROM hub_unterschriften;
