-- ============================================================
--  Manipulationsschutz für Schulungsnachweise — v44
--  Schulungsmanagement-App CSC GmbH
--  Erstellt: 2026-06-28
--
--  Schützt abgeschlossene Formulare und Audit-Einträge auf
--  Datenbankebene — unabhängig von der App-Logik.
-- ============================================================

-- ── 1. TRIGGER: Abgeschlossene Formulare dürfen nicht überschrieben werden ──
-- Sobald abgeschlossen=true gesetzt wurde, sind alle Kerndaten eingefroren.
-- Nur pdf_path und drive_link dürfen noch ergänzt werden (nachträglicher Upload).

CREATE OR REPLACE FUNCTION formulare_abschluss_schutz()
RETURNS TRIGGER AS $$
BEGIN
  -- Wenn Datensatz bereits abgeschlossen war und erneut geschrieben wird:
  IF OLD.abgeschlossen = true THEN
    -- Nur pdf_path und drive_link dürfen sich ändern (nachträglicher PDF-Upload)
    IF (NEW.felder         IS DISTINCT FROM OLD.felder         OR
        NEW.abgeschlossen  IS DISTINCT FROM OLD.abgeschlossen  OR
        NEW.abgeschlossen_am IS DISTINCT FROM OLD.abgeschlossen_am OR
        NEW.abgeschlossen_von IS DISTINCT FROM OLD.abgeschlossen_von OR
        NEW.mitarbeiter_name IS DISTINCT FROM OLD.mitarbeiter_name) THEN
      RAISE EXCEPTION 'MANIPULATIONSSCHUTZ: Abgeschlossene Schulungsnachweise dürfen nicht geändert werden. (Formular-ID: %)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_formulare_abschluss_schutz ON formulare;
CREATE TRIGGER trg_formulare_abschluss_schutz
  BEFORE UPDATE ON formulare
  FOR EACH ROW
  EXECUTE FUNCTION formulare_abschluss_schutz();


-- ── 2. TRIGGER: Abgeschlossene Formulare dürfen nicht gelöscht werden ──

CREATE OR REPLACE FUNCTION formulare_delete_schutz()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.abgeschlossen = true THEN
    RAISE EXCEPTION 'MANIPULATIONSSCHUTZ: Abgeschlossene Schulungsnachweise dürfen nicht gelöscht werden. (Formular-ID: %)', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_formulare_delete_schutz ON formulare;
CREATE TRIGGER trg_formulare_delete_schutz
  BEFORE DELETE ON formulare
  FOR EACH ROW
  EXECUTE FUNCTION formulare_delete_schutz();


-- ── 3. TRIGGER: Audit-Einträge dürfen nicht gelöscht werden (außer >2 Jahre) ──
-- Die App löscht automatisch Audit-Einträge >2 Jahre (DSGVO-Aufbewahrungsfrist).
-- Jüngere Einträge sind dauerhaft geschützt.

CREATE OR REPLACE FUNCTION audit_delete_schutz()
RETURNS TRIGGER AS $$
BEGIN
  -- Nur Einträge älter als 2 Jahre dürfen gelöscht werden
  IF OLD.ts > NOW() - INTERVAL '2 years' THEN
    RAISE EXCEPTION 'MANIPULATIONSSCHUTZ: Audit-Einträge jünger als 2 Jahre dürfen nicht gelöscht werden. (ID: %)', OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_delete_schutz ON audit;
CREATE TRIGGER trg_audit_delete_schutz
  BEFORE DELETE ON audit
  FOR EACH ROW
  EXECUTE FUNCTION audit_delete_schutz();


-- ── 4. TRIGGER: Audit-Einträge dürfen nie geändert werden ──

CREATE OR REPLACE FUNCTION audit_update_schutz()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'MANIPULATIONSSCHUTZ: Audit-Einträge sind unveränderlich. (ID: %)', OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_update_schutz ON audit;
CREATE TRIGGER trg_audit_update_schutz
  BEFORE UPDATE ON audit
  FOR EACH ROW
  EXECUTE FUNCTION audit_update_schutz();


-- ── 5. TRIGGER: Lernpfad-Unterschriften schützen (Erstunterzeichnung unveränderlich) ──

CREATE OR REPLACE FUNCTION lernpfad_unterschrift_schutz()
RETURNS TRIGGER AS $$
BEGIN
  -- unterzeichnet_am und vollname dürfen nach dem ersten Setzen nicht mehr geändert werden
  IF OLD.unterzeichnet_am IS NOT NULL THEN
    IF (NEW.vollname          IS DISTINCT FROM OLD.vollname OR
        NEW.unterzeichnet_am  IS DISTINCT FROM OLD.unterzeichnet_am OR
        NEW.user_id           IS DISTINCT FROM OLD.user_id) THEN
      RAISE EXCEPTION 'MANIPULATIONSSCHUTZ: Die Mitarbeiter-Unterschrift ist unveränderlich. (ID: %)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lp_unt_schutz ON lernpfad_unterschriften;
CREATE TRIGGER trg_lp_unt_schutz
  BEFORE UPDATE ON lernpfad_unterschriften
  FOR EACH ROW
  EXECUTE FUNCTION lernpfad_unterschrift_schutz();


-- ── 6. Verifizierung ──
-- Prüfen ob alle Trigger aktiv sind:
SELECT trigger_name, event_object_table, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;
