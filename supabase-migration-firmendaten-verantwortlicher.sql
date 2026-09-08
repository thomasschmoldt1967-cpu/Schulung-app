-- Firmendaten werden beim Verantwortlichen des Lizenznehmers gepflegt.
-- Bestehende Werte bleiben erhalten; alle neuen Spalten sind bewusst nullable.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS strasse text,
  ADD COLUMN IF NOT EXISTS hausnummer text,
  ADD COLUMN IF NOT EXISTS plz text,
  ADD COLUMN IF NOT EXISTS ort text,
  ADD COLUMN IF NOT EXISTS land text DEFAULT 'Deutschland',
  ADD COLUMN IF NOT EXISTS ansprechpartner text,
  ADD COLUMN IF NOT EXISTS kontakt_email text,
  ADD COLUMN IF NOT EXISTS telefon text,
  ADD COLUMN IF NOT EXISTS website text;

-- Bestehende Kontaktangaben als E-Mail übernehmen, sofern vorhanden.
UPDATE public.tenants
SET kontakt_email = kontakt
WHERE kontakt_email IS NULL AND kontakt IS NOT NULL AND kontakt LIKE '%@%';

COMMENT ON COLUMN public.tenants.ansprechpartner IS 'Hauptansprechpartner des Lizenznehmers; wird durch Rolle verantwortlicher gepflegt';
COMMENT ON COLUMN public.tenants.kontakt_email IS 'Zentrale Kontakt-/Rechnungs-E-Mail des Lizenznehmers';
