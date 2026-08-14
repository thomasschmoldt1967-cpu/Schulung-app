-- ============================================================
--  Hubarbeitsbühnen DGUV 308-008 — Migration v2 (Fahrauftrag)
--  Schulungsmanagement-App CSC GmbH — v116
--  Erstellt: 2026-08-08
-- ============================================================

-- hub_unterschriften um Fahrauftrag-Felder erweitern
ALTER TABLE hub_unterschriften
  ADD COLUMN IF NOT EXISTS buehnentyp_a        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS buehnentyp_b        BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS fahrauftrag_von     TEXT,     -- Datum von (ISO)
  ADD COLUMN IF NOT EXISTS fahrauftrag_bis     TEXT,     -- Datum bis (ISO, +364 Tage)
  ADD COLUMN IF NOT EXISTS unt_ma_data_url     TEXT,     -- Canvas-Unterschrift MA (Base64)
  ADD COLUMN IF NOT EXISTS unt_vera_data_url   TEXT,     -- Canvas-Unterschrift Vera (Base64)
  ADD COLUMN IF NOT EXISTS fahrauftrag_pdf_url TEXT;     -- Kombiniertes PDF

-- Verifikation
SELECT column_name FROM information_schema.columns
WHERE table_name = 'hub_unterschriften'
ORDER BY ordinal_position;
