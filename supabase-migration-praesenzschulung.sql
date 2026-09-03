-- Präsenzschulungen vor Ort: individuelle Teilnehmer- und Objektleiter-Signaturen
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS praesenzschulungen (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  vorlage_id text NULL,
  inhalte_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  bereich_id text NULL REFERENCES bereiche(id) ON DELETE SET NULL,
  objekt_name text NOT NULL,
  titel text NOT NULL,
  sprache text NOT NULL DEFAULT 'de',
  datum date NOT NULL,
  beginn text NULL,
  ende text NULL,
  ort text NOT NULL,
  erstellt_von text NOT NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','teilnehmer_signieren','abgeschlossen','storniert')),
  objektleiter_id text NULL,
  objektleiter_name text NULL,
  objektleiter_unterschrift text NULL,
  objektleiter_unterschrieben_am timestamptz NULL,
  pdf_path text NULL,
  abgeschlossen_am timestamptz NULL,
  abgeschlossen_hash text NULL
);

CREATE TABLE IF NOT EXISTS praesenzschulung_teilnehmer (
  id text PRIMARY KEY,
  schulungs_id text NOT NULL REFERENCES praesenzschulungen(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  name_snapshot text NOT NULL,
  personalnummer_snapshot text NULL,
  bereich_snapshot text NULL,
  sprache text NOT NULL DEFAULT 'de',
  anwesend boolean NOT NULL DEFAULT true,
  teilnehmer_unterschrift text NULL,
  teilnehmer_unterschrieben_am timestamptz NULL,
  signatur_hash text NULL,
  erstellt_am timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schulungs_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_praesenz_tenant ON praesenzschulungen(tenant_id, datum DESC);
CREATE INDEX IF NOT EXISTS idx_praesenz_teilnehmer ON praesenzschulung_teilnehmer(schulungs_id);

-- Nachrüstung für bereits angelegte Installationen
ALTER TABLE praesenzschulungen ADD COLUMN IF NOT EXISTS vorlage_id text NULL;
ALTER TABLE praesenzschulungen ADD COLUMN IF NOT EXISTS inhalte_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Signaturen und abgeschlossene Nachweise dürfen nicht überschrieben werden.
CREATE OR REPLACE FUNCTION praesenzschulung_signatur_schutz() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'praesenzschulung_teilnehmer' AND OLD.teilnehmer_unterschrieben_am IS NOT NULL THEN
    IF NEW.teilnehmer_unterschrift IS DISTINCT FROM OLD.teilnehmer_unterschrift
       OR NEW.teilnehmer_unterschrieben_am IS DISTINCT FROM OLD.teilnehmer_unterschrieben_am
       OR NEW.signatur_hash IS DISTINCT FROM OLD.signatur_hash THEN
      RAISE EXCEPTION 'Teilnehmerunterschrift ist unveränderbar';
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'praesenzschulungen' AND OLD.objektleiter_unterschrieben_am IS NOT NULL THEN
    IF NEW.objektleiter_unterschrift IS DISTINCT FROM OLD.objektleiter_unterschrift
       OR NEW.objektleiter_unterschrieben_am IS DISTINCT FROM OLD.objektleiter_unterschrieben_am
       OR NEW.objektleiter_id IS DISTINCT FROM OLD.objektleiter_id THEN
      RAISE EXCEPTION 'Objektleiterunterschrift ist unveränderbar';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_praesenz_teilnehmer_schutz ON praesenzschulung_teilnehmer;
CREATE TRIGGER trg_praesenz_teilnehmer_schutz BEFORE UPDATE ON praesenzschulung_teilnehmer
FOR EACH ROW EXECUTE FUNCTION praesenzschulung_signatur_schutz();
DROP TRIGGER IF EXISTS trg_praesenz_schulung_schutz ON praesenzschulungen;
CREATE TRIGGER trg_praesenz_schulung_schutz BEFORE UPDATE ON praesenzschulungen
FOR EACH ROW EXECUTE FUNCTION praesenzschulung_signatur_schutz();

-- Die bestehende App verwendet eine eigene Login-Schicht; Mandantentrennung erfolgt zusätzlich in der UI.
ALTER TABLE praesenzschulungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE praesenzschulung_teilnehmer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS praesenzschulungen_appzugriff ON praesenzschulungen;
CREATE POLICY praesenzschulungen_appzugriff ON praesenzschulungen FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS praesenz_teilnehmer_appzugriff ON praesenzschulung_teilnehmer;
CREATE POLICY praesenz_teilnehmer_appzugriff ON praesenzschulung_teilnehmer FOR ALL USING (true) WITH CHECK (true);
