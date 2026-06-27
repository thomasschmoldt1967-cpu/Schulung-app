// ============================================================
//  data.js  —  Konfiguration: Benutzer, Schulungsvorlagen, Demo-Daten
//  ALLE Stammdaten hier — niemals in app.js hardcoden
// ============================================================

// ── BENUTZER ────────────────────────────────────────────────
// Passwort-Hashes erzeugen: python3 -c "import hashlib; print(hashlib.sha256(b'Passwort').hexdigest())"
// Demo-Passwörter stehen als Klartext in den Kommentaren — bitte vor Produktivbetrieb ändern!
const APP_USERS = [
  // ── Admin (Auftraggeber) ──
  {
    id: 'admin1',
    name: 'Admin CSC',
    email: 'admin@csc.de',
    // Passwort: Admin2024!
    hash: '1b7e0e4bdb8cf2f7a2c9e1f3a0d5b6c4e8f9a2d1c0b3e5f7a9c2d4e6f8b0a1c3',
    role: 'admin',
    tenantId: null
  },
  // ── Unternehmen A – Verantwortlicher ──
  {
    id: 'sub_a_v',
    name: 'Klaus Müller',
    email: 'mueller@reinigung-a.de',
    // Passwort: UnternehmenA2024!
    hash: '3c7f9a2d1b5e8c4f0a3d6b9e2f5c8a1d4b7e0c3f6a9d2b5e8c1f4a7d0b3e6c9f2',
    role: 'verantwortlicher',
    tenantId: 'tenant_a'
  },
  // ── Unternehmen A – Mitarbeiter ──
  {
    id: 'sub_a_m',
    name: 'Anna Schmidt',
    email: 'schmidt@reinigung-a.de',
    // Passwort: MitA2024!
    hash: '9f2a5c8d1e4b7f0c3a6d9b2e5f8c1a4d7b0e3f6c9a2d5b8e1f4c7a0d3b6e9f2c5',
    role: 'mitarbeiter',
    tenantId: 'tenant_a'
  },
  // ── Unternehmen B ──
  {
    id: 'sub_b_v',
    name: 'Peter Weber',
    email: 'weber@sicherheit-b.de',
    // Passwort: UnternehmenB2024!
    hash: '6a3d0b7e4f1c8a5d2b9f6c3a0d7e4b1f8c5a2d9b6f3c0a7d4b1e8f5c2a9d6b3f0',
    role: 'verantwortlicher',
    tenantId: 'tenant_b'
  },
  // ── Unternehmen C ──
  {
    id: 'sub_c_v',
    name: 'Maria Fischer',
    email: 'fischer@service-c.de',
    // Passwort: UnternehmenC2024!
    hash: '2d9f6c3a0b7e4f1d8c5a2b9f6e3c0d7a4b1f8e5c2a9d6b3f0c7a4d1b8e5f2c9a6',
    role: 'verantwortlicher',
    tenantId: 'tenant_c'
  }
];

// ── MANDANTEN (Unternehmen) ───────────────────────────────
const APP_TENANTS = [
  { id: 'tenant_a', name: 'Reinigung A GmbH',       kontakt: 'mueller@reinigung-a.de' },
  { id: 'tenant_b', name: 'Sicherheitsdienst B KG',  kontakt: 'weber@sicherheit-b.de' },
  { id: 'tenant_c', name: 'Service C e.K.',           kontakt: 'fischer@service-c.de' }
];

// ── SCHULUNGSVORLAGEN ────────────────────────────────────────
// Jede Vorlage hat Abschnitte mit Formularfeldern.
// Feldtypen: 'text', 'textarea', 'select', 'checkbox', 'signature', 'upload'
const SCHULUNG_VORLAGEN = [
  {
    id: 'vorlage_arbeitssicherheit',
    titel: 'Arbeitssicherheit Grundschulung',
    beschreibung: 'Pflichtschulung für alle Mitarbeiter — einmal jährlich zu wiederholen.',
    intervallMonate: 12,
    abschnitte: [
      {
        titel: 'Teilnehmerdaten',
        felder: [
          { id: 'tn_name',     label: 'Name des Mitarbeiters',   typ: 'text',     pflicht: true },
          { id: 'tn_position', label: 'Position / Funktion',      typ: 'text',     pflicht: true },
          { id: 'tn_datum',    label: 'Schulungsdatum',           typ: 'text',     pflicht: true, placeholder: 'TT.MM.JJJJ' },
        ]
      },
      {
        titel: 'Schulungsinhalte',
        felder: [
          { id: 'thema_1', label: 'Unfallverhütungsvorschriften besprochen', typ: 'checkbox', pflicht: true },
          { id: 'thema_2', label: 'PSA-Nutzung erklärt',                     typ: 'checkbox', pflicht: true },
          { id: 'thema_3', label: 'Notfallplan / Fluchtwege',                typ: 'checkbox', pflicht: true },
          { id: 'thema_4', label: 'Erste-Hilfe-Maßnahmen',                   typ: 'checkbox', pflicht: false },
          {
            id: 'schulungsart',
            label: 'Art der Schulung',
            typ: 'select',
            pflicht: true,
            optionen: ['Präsenz', 'Online', 'Unterweisung am Arbeitsplatz']
          },
          { id: 'bemerkung', label: 'Zusätzliche Bemerkungen', typ: 'textarea', pflicht: false }
        ]
      },
      {
        titel: 'Nachweise',
        felder: [
          { id: 'teilnehmerliste', label: 'Teilnehmerliste hochladen', typ: 'upload',    pflicht: true },
          { id: 'unterschrift',    label: 'Unterschrift Verantwortlicher', typ: 'signature', pflicht: true }
        ]
      }
    ]
  },
  {
    id: 'vorlage_brandschutz',
    titel: 'Brandschutzunterweisung',
    beschreibung: 'Jährliche Pflichtunterweisung nach ASR A2.2.',
    intervallMonate: 12,
    abschnitte: [
      {
        titel: 'Angaben zur Unterweisung',
        felder: [
          { id: 'ort',   label: 'Ort der Unterweisung', typ: 'text', pflicht: true },
          { id: 'datum', label: 'Datum',                 typ: 'text', pflicht: true, placeholder: 'TT.MM.JJJJ' },
          { id: 'trainer', label: 'Unterweiser',         typ: 'text', pflicht: true },
        ]
      },
      {
        titel: 'Inhalte',
        felder: [
          { id: 'b1', label: 'Brandursachen und -entstehung', typ: 'checkbox', pflicht: true },
          { id: 'b2', label: 'Verhalten im Brandfall',        typ: 'checkbox', pflicht: true },
          { id: 'b3', label: 'Feuerlöscher-Handhabung',       typ: 'checkbox', pflicht: true },
          { id: 'b4', label: 'Evakuierungsübung durchgeführt',typ: 'checkbox', pflicht: false },
          { id: 'b_bem', label: 'Besonderheiten', typ: 'textarea', pflicht: false }
        ]
      },
      {
        titel: 'Dokumentation',
        felder: [
          { id: 'anwesenheitsliste', label: 'Anwesenheitsliste', typ: 'upload',    pflicht: true },
          { id: 'unterschrift_bs',   label: 'Unterschrift',      typ: 'signature', pflicht: true }
        ]
      }
    ]
  },
  {
    id: 'vorlage_datenschutz',
    titel: 'DSGVO-Datenschutzschulung',
    beschreibung: 'Sensibilisierung und Unterweisung gemäß DSGVO-Anforderungen.',
    intervallMonate: 24,
    abschnitte: [
      {
        titel: 'Teilnehmer',
        felder: [
          { id: 'ds_name',  label: 'Name',           typ: 'text', pflicht: true },
          { id: 'ds_datum', label: 'Datum',           typ: 'text', pflicht: true, placeholder: 'TT.MM.JJJJ' },
        ]
      },
      {
        titel: 'Schulungsinhalte',
        felder: [
          { id: 'd1', label: 'Grundlagen DSGVO erklärt',          typ: 'checkbox', pflicht: true },
          { id: 'd2', label: 'Umgang mit personenbezogenen Daten', typ: 'checkbox', pflicht: true },
          { id: 'd3', label: 'Meldepflichten bei Datenpannen',     typ: 'checkbox', pflicht: true },
          {
            id: 'format',
            label: 'Schulungsformat',
            typ: 'select',
            pflicht: true,
            optionen: ['Präsenz', 'E-Learning', 'Selbststudium mit Test']
          },
          { id: 'ds_bem', label: 'Anmerkungen', typ: 'textarea', pflicht: false }
        ]
      },
      {
        titel: 'Bestätigung',
        felder: [
          { id: 'zertifikat',   label: 'Teilnahmezertifikat',  typ: 'upload',    pflicht: false },
          { id: 'unterschrift_ds', label: 'Unterschrift',       typ: 'signature', pflicht: true }
        ]
      }
    ]
  }
];

// ── LERNPFAD: 21 KAPITEL (Gebäudereinigung & Höhentechnologie) ────────────
// Didaktisches Konzept nach BG BAU — 3 Säulen
// Stufe 1: Checklisten-System mit Verantwortlichen-Bestätigung
// Stufe 2+3: Interaktive Tests + Mehrsprachigkeit (geplant, siehe Skill schulungsmodul-lms-stufen-2-3)
const LERNPFAD_KAPITEL = [
  // ── Säule A: Gesetzliche Basis-Unterweisungen (§ 12 ArbSchG) ──────────
  { id:'kap_01', nr:1,  saeule:'A', titel:'Verhalten im Kundenobjekt & Unfallmeldung',           rechtsgrundlage:'§ 12 ArbSchG, DGUV V1' },
  { id:'kap_02', nr:2,  saeule:'A', titel:'Stolper-, Rutsch- und Sturzgefahren',                 rechtsgrundlage:'§ 12 ArbSchG, DGUV R 108-003' },
  { id:'kap_03', nr:3,  saeule:'A', titel:'Brandschutz und Fluchtwege',                          rechtsgrundlage:'§ 12 ArbSchG, ASR A2.2' },
  { id:'kap_04', nr:4,  saeule:'A', titel:'Erste Hilfe',                                         rechtsgrundlage:'§ 12 ArbSchG, DGUV R 100-001' },
  { id:'kap_05', nr:5,  saeule:'A', titel:'Hautschutz- und Hygienepläne (Feuchtarbeit)',         rechtsgrundlage:'§ 12 ArbSchG, TRGS 401' },
  { id:'kap_06', nr:6,  saeule:'A', titel:'Richtiges Händewaschen und Pflegen',                  rechtsgrundlage:'§ 12 ArbSchG, TRGS 401' },
  { id:'kap_07', nr:7,  saeule:'A', titel:'Dokumentationspflichten und Unfallmeldung',           rechtsgrundlage:'§ 24 SGB VII, DGUV V1 §24' },
  // ── Säule B: Reinigungstechnologie & Chemie (§ 14 GefStoffV) ──────────
  { id:'kap_08', nr:8,  saeule:'B', titel:'Richtige Dosierung von Reinigungsmitteln',            rechtsgrundlage:'§ 14 GefStoffV, TRGS 555' },
  { id:'kap_09', nr:9,  saeule:'B', titel:'Betriebsanweisungen lesen und verstehen',             rechtsgrundlage:'§ 14 GefStoffV, TRGS 555' },
  { id:'kap_10', nr:10, saeule:'B', titel:'Gefahrensymbole und GHS-Kennzeichnung',               rechtsgrundlage:'§ 14 GefStoffV, CLP-Verordnung' },
  { id:'kap_11', nr:11, saeule:'B', titel:'Mischverbot (Chlor + Sanitärreiniger u.a.)',          rechtsgrundlage:'§ 14 GefStoffV, TRGS 555' },
  { id:'kap_12', nr:12, saeule:'B', titel:'Oberflächenkunde (Böden, Stein, Holz, Textil)',       rechtsgrundlage:'Fachkunde Gebäudereiniger' },
  { id:'kap_13', nr:13, saeule:'B', titel:'Maschinenkunde — Scheuersaugmaschinen',               rechtsgrundlage:'§ 12 ArbSchG, BetrSichV' },
  { id:'kap_14', nr:14, saeule:'B', titel:'Tägliche Wartung und Pflege von Maschinen',           rechtsgrundlage:'BetrSichV §4, DGUV R 100-500' },
  // ── Säule C: Höhentechnologie & PSAgA ─────────────────────────────────
  { id:'kap_15', nr:15, saeule:'C', titel:'Leitern und Tritte — sicherer Umgang',                rechtsgrundlage:'DGUV Information 208-016' },
  { id:'kap_16', nr:16, saeule:'C', titel:'Fahrgerüste — Aufbau und Sicherheit',                 rechtsgrundlage:'DGUV Information 201-011' },
  { id:'kap_17', nr:17, saeule:'C', titel:'Einführung PSAgA — Schutzausrüstung gegen Absturz',  rechtsgrundlage:'PSA-BV, DGUV R 112-198' },
  { id:'kap_18', nr:18, saeule:'C', titel:'Sichtprüfung: Ausrangierkriterien Gurte & Seile',    rechtsgrundlage:'DGUV R 112-198, EN 361' },
  { id:'kap_19', nr:19, saeule:'C', titel:'Anschlagpunkte im und am Gebäude',                    rechtsgrundlage:'DGUV R 112-198, EN 795' },
  { id:'kap_20', nr:20, saeule:'C', titel:'Notfall- und Rettungsplanung',                        rechtsgrundlage:'DGUV R 112-198, § 10 ArbSchG' },
  { id:'kap_21', nr:21, saeule:'C', titel:'Hängetrauma — Erkennen und Verhindern',              rechtsgrundlage:'DGUV Information 212-139' },
];

// ── ZUWEISUNGEN ──────────────────────────────────────────────
// Welche Schulungsvorlage ist welchem Mandanten zugewiesen, mit Frist
// Status wird automatisch berechnet — hier nur Basis-Metadaten
const ZUWEISUNGEN_INIT = [
  // Tenant A: alle 3 Schulungen
  { id: 'z_a_1', vorlagenId: 'vorlage_arbeitssicherheit', tenantId: 'tenant_a', frist: '2025-07-31', pflicht: true },
  { id: 'z_a_2', vorlagenId: 'vorlage_brandschutz',       tenantId: 'tenant_a', frist: '2025-06-30', pflicht: true },
  { id: 'z_a_3', vorlagenId: 'vorlage_datenschutz',       tenantId: 'tenant_a', frist: '2025-12-31', pflicht: false },
  // Tenant B: 2 Schulungen
  { id: 'z_b_1', vorlagenId: 'vorlage_arbeitssicherheit', tenantId: 'tenant_b', frist: '2025-08-15', pflicht: true },
  { id: 'z_b_2', vorlagenId: 'vorlage_brandschutz',       tenantId: 'tenant_b', frist: '2025-05-31', pflicht: true },
  // Tenant C: 2 Schulungen
  { id: 'z_c_1', vorlagenId: 'vorlage_arbeitssicherheit', tenantId: 'tenant_c', frist: '2025-09-30', pflicht: true },
  { id: 'z_c_2', vorlagenId: 'vorlage_datenschutz',       tenantId: 'tenant_c', frist: '2025-12-31', pflicht: false },
];