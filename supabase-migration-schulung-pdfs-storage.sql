-- Storage für Schulungs-PDFs / externe PSAgA-Zertifikate
-- Im Supabase Dashboard unter SQL Editor ausführen.
-- Idempotent: kann mehrfach ausgeführt werden.

-- Privater Bucket: PDFs werden über signierte URLs geöffnet.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'schulung-pdfs',
  'schulung-pdfs',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Die App verwendet eine eigene Login-Schicht und sendet daher den anon-Key.
-- Die Mandantentrennung erfolgt in der App über den Pfad und die eigene Admin-Oberfläche.
DROP POLICY IF EXISTS schulung_pdfs_lesen ON storage.objects;
CREATE POLICY schulung_pdfs_lesen
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'schulung-pdfs');

DROP POLICY IF EXISTS schulung_pdfs_anlegen ON storage.objects;
CREATE POLICY schulung_pdfs_anlegen
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'schulung-pdfs');

DROP POLICY IF EXISTS schulung_pdfs_aktualisieren ON storage.objects;
CREATE POLICY schulung_pdfs_aktualisieren
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'schulung-pdfs')
  WITH CHECK (bucket_id = 'schulung-pdfs');

GRANT SELECT, INSERT, UPDATE ON storage.objects TO anon, authenticated;
