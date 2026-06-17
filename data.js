     1|// ============================================================
     2|//  data.js  —  Konfiguration: Benutzer, Schulungsvorlagen, Demo-Daten
     3|//  ALLE Stammdaten hier — niemals in app.js hardcoden
     4|// ============================================================
     5|
     6|// ── BENUTZER ────────────────────────────────────────────────
     7|// Passwort-Hashes erzeugen: python3 -c "import hashlib; print(hashlib.sha256(b'Passwort').hexdigest())"
     8|// Demo-Passwörter stehen als Klartext in den Kommentaren — bitte vor Produktivbetrieb ändern!
     9|const APP_USERS = [
    10|  // ── Admin (Auftraggeber) ──
    11|  {
    12|    id: 'admin1',
    13|    name: 'Admin CSC',
    14|    email: 'admin@csc.de',
    15|    // Passwort: Admin2024!
    16|    hash: '1b7e0e4bdb8cf2f7a2c9e1f3a0d5b6c4e8f9a2d1c0b3e5f7a9c2d4e6f8b0a1c3',
    17|    role: 'admin',
    18|    tenantId: null
    19|  },
    20|  // ── Unternehmen A – Verantwortlicher ──
    21|  {
    22|    id: 'sub_a_v',
    23|    name: 'Klaus Müller',
    24|    email: 'mueller@reinigung-a.de',
    25|    // Passwort: UnternehmenA2024!
    26|    hash: '3c7f9a2d1b5e8c4f0a3d6b9e2f5c8a1d4b7e0c3f6a9d2b5e8c1f4a7d0b3e6c9f2',
    27|    role: 'verantwortlicher',
    28|    tenantId: 'tenant_a'
    29|  },
    30|  // ── Unternehmen A – Mitarbeiter ──
    31|  {
    32|    id: 'sub_a_m',
    33|    name: 'Anna Schmidt',
    34|    email: 'schmidt@reinigung-a.de',
    35|    // Passwort: MitA2024!
    36|    hash: '9f2a5c8d1e4b7f0c3a6d9b2e5f8c1a4d7b0e3f6c9a2d5b8e1f4c7a0d3b6e9f2c5',
    37|    role: 'mitarbeiter',
    38|    tenantId: 'tenant_a'
    39|  },
    40|  // ── Unternehmen B ──
    41|  {
    42|    id: 'sub_b_v',
    43|    name: 'Peter Weber',
    44|    email: 'weber@sicherheit-b.de',
    45|    // Passwort: UnternehmenB2024!
    46|    hash: '6a3d0b7e4f1c8a5d2b9f6c3a0d7e4b1f8c5a2d9b6f3c0a7d4b1e8f5c2a9d6b3f0',
    47|    role: 'verantwortlicher',
    48|    tenantId: 'tenant_b'
    49|  },
    50|  // ── Unternehmen C ──
    51|  {
    52|    id: 'sub_c_v',
    53|    name: 'Maria Fischer',
    54|    email: 'fischer@service-c.de',
    55|    // Passwort: UnternehmenC2024!
    56|    hash: '2d9f6c3a0b7e4f1d8c5a2b9f6e3c0d7a4b1f8e5c2a9d6b3f0c7a4d1b8e5f2c9a6',
    57|    role: 'verantwortlicher',
    58|    tenantId: 'tenant_c'
    59|  }
    60|];
    61|
    62|// ── MANDANTEN (Unternehmen) ───────────────────────────────
    63|const APP_TENANTS = [
    64|  { id: 'tenant_a', name: 'Reinigung A GmbH',       kontakt: 'mueller@reinigung-a.de' },
    65|  { id: 'tenant_b', name: 'Sicherheitsdienst B KG',  kontakt: 'weber@sicherheit-b.de' },
    66|  { id: 'tenant_c', name: 'Service C e.K.',           kontakt: 'fischer@service-c.de' }
    67|];
    68|
    69|// ── SCHULUNGSVORLAGEN ────────────────────────────────────────
    70|// Jede Vorlage hat Abschnitte mit Formularfeldern.
    71|// Feldtypen: 'text', 'textarea', 'select', 'checkbox', 'signature', 'upload'
    72|const SCHULUNG_VORLAGEN = [
    73|  {
    74|    id: 'vorlage_arbeitssicherheit',
    75|    titel: 'Arbeitssicherheit Grundschulung',
    76|    beschreibung: 'Pflichtschulung für alle Mitarbeiter — einmal jährlich zu wiederholen.',
    77|    intervallMonate: 12,
    78|    abschnitte: [
    79|      {
    80|        titel: 'Teilnehmerdaten',
    81|        felder: [
    82|          { id: 'tn_name',     label: 'Name des Mitarbeiters',   typ: 'text',     pflicht: true },
    83|          { id: 'tn_position', label: 'Position / Funktion',      typ: 'text',     pflicht: true },
    84|          { id: 'tn_datum',    label: 'Schulungsdatum',           typ: 'text',     pflicht: true, placeholder: 'TT.MM.JJJJ' },
    85|        ]
    86|      },
    87|      {
    88|        titel: 'Schulungsinhalte',
    89|        felder: [
    90|          { id: 'thema_1', label: 'Unfallverhütungsvorschriften besprochen', typ: 'checkbox', pflicht: true },
    91|          { id: 'thema_2', label: 'PSA-Nutzung erklärt',                     typ: 'checkbox', pflicht: true },
    92|          { id: 'thema_3', label: 'Notfallplan / Fluchtwege',                typ: 'checkbox', pflicht: true },
    93|          { id: 'thema_4', label: 'Erste-Hilfe-Maßnahmen',                   typ: 'checkbox', pflicht: false },
    94|          {
    95|            id: 'schulungsart',
    96|            label: 'Art der Schulung',
    97|            typ: 'select',
    98|            pflicht: true,
    99|            optionen: ['Präsenz', 'Online', 'Unterweisung am Arbeitsplatz']
   100|          },
   101|          { id: 'bemerkung', label: 'Zusätzliche Bemerkungen', typ: 'textarea', pflicht: false }
   102|        ]
   103|      },
   104|      {
   105|        titel: 'Nachweise',
   106|        felder: [
   107|          { id: 'teilnehmerliste', label: 'Teilnehmerliste hochladen', typ: 'upload',    pflicht: true },
   108|          { id: 'unterschrift',    label: 'Unterschrift Verantwortlicher', typ: 'signature', pflicht: true }
   109|        ]
   110|      }
   111|    ]
   112|  },
   113|  {
   114|    id: 'vorlage_brandschutz',
   115|    titel: 'Brandschutzunterweisung',
   116|    beschreibung: 'Jährliche Pflichtunterweisung nach ASR A2.2.',
   117|    intervallMonate: 12,
   118|    abschnitte: [
   119|      {
   120|        titel: 'Angaben zur Unterweisung',
   121|        felder: [
   122|          { id: 'ort',   label: 'Ort der Unterweisung', typ: 'text', pflicht: true },
   123|          { id: 'datum', label: 'Datum',                 typ: 'text', pflicht: true, placeholder: 'TT.MM.JJJJ' },
   124|          { id: 'trainer', label: 'Unterweiser',         typ: 'text', pflicht: true },
   125|        ]
   126|      },
   127|      {
   128|        titel: 'Inhalte',
   129|        felder: [
   130|          { id: 'b1', label: 'Brandursachen und -entstehung', typ: 'checkbox', pflicht: true },
   131|          { id: 'b2', label: 'Verhalten im Brandfall',        typ: 'checkbox', pflicht: true },
   132|          { id: 'b3', label: 'Feuerlöscher-Handhabung',       typ: 'checkbox', pflicht: true },
   133|          { id: 'b4', label: 'Evakuierungsübung durchgeführt',typ: 'checkbox', pflicht: false },
   134|          { id: 'b_bem', label: 'Besonderheiten', typ: 'textarea', pflicht: false }
   135|        ]
   136|      },
   137|      {
   138|        titel: 'Dokumentation',
   139|        felder: [
   140|          { id: 'anwesenheitsliste', label: 'Anwesenheitsliste', typ: 'upload',    pflicht: true },
   141|          { id: 'unterschrift_bs',   label: 'Unterschrift',      typ: 'signature', pflicht: true }
   142|        ]
   143|      }
   144|    ]
   145|  },
   146|  {
   147|    id: 'vorlage_datenschutz',
   148|    titel: 'DSGVO-Datenschutzschulung',
   149|    beschreibung: 'Sensibilisierung und Unterweisung gemäß DSGVO-Anforderungen.',
   150|    intervallMonate: 24,
   151|    abschnitte: [
   152|      {
   153|        titel: 'Teilnehmer',
   154|        felder: [
   155|          { id: 'ds_name',  label: 'Name',           typ: 'text', pflicht: true },
   156|          { id: 'ds_datum', label: 'Datum',           typ: 'text', pflicht: true, placeholder: 'TT.MM.JJJJ' },
   157|        ]
   158|      },
   159|      {
   160|        titel: 'Schulungsinhalte',
   161|        felder: [
   162|          { id: 'd1', label: 'Grundlagen DSGVO erklärt',          typ: 'checkbox', pflicht: true },
   163|          { id: 'd2', label: 'Umgang mit personenbezogenen Daten', typ: 'checkbox', pflicht: true },
   164|          { id: 'd3', label: 'Meldepflichten bei Datenpannen',     typ: 'checkbox', pflicht: true },
   165|          {
   166|            id: 'format',
   167|            label: 'Schulungsformat',
   168|            typ: 'select',
   169|            pflicht: true,
   170|            optionen: ['Präsenz', 'E-Learning', 'Selbststudium mit Test']
   171|          },
   172|          { id: 'ds_bem', label: 'Anmerkungen', typ: 'textarea', pflicht: false }
   173|        ]
   174|      },
   175|      {
   176|        titel: 'Bestätigung',
   177|        felder: [
   178|          { id: 'zertifikat',   label: 'Teilnahmezertifikat',  typ: 'upload',    pflicht: false },
   179|          { id: 'unterschrift_ds', label: 'Unterschrift',       typ: 'signature', pflicht: true }
   180|        ]
   181|      }
   182|    ]
   183|  }
   184|];
   185|
   186|// ── ZUWEISUNGEN ──────────────────────────────────────────────
   187|// Welche Schulungsvorlage ist welchem Mandanten zugewiesen, mit Frist
   188|// Status wird automatisch berechnet — hier nur Basis-Metadaten
   189|const ZUWEISUNGEN_INIT = [
   190|  // Tenant A: alle 3 Schulungen
   191|  { id: 'z_a_1', vorlagenId: 'vorlage_arbeitssicherheit', tenantId: 'tenant_a', frist: '2025-07-31', pflicht: true },
   192|  { id: 'z_a_2', vorlagenId: 'vorlage_brandschutz',       tenantId: 'tenant_a', frist: '2025-06-30', pflicht: true },
   193|  { id: 'z_a_3', vorlagenId: 'vorlage_datenschutz',       tenantId: 'tenant_a', frist: '2025-12-31', pflicht: false },
   194|  // Tenant B: 2 Schulungen
   195|  { id: 'z_b_1', vorlagenId: 'vorlage_arbeitssicherheit', tenantId: 'tenant_b', frist: '2025-08-15', pflicht: true },
   196|  { id: 'z_b_2', vorlagenId: 'vorlage_brandschutz',       tenantId: 'tenant_b', frist: '2025-05-31', pflicht: true },
   197|  // Tenant C: 2 Schulungen
   198|  { id: 'z_c_1', vorlagenId: 'vorlage_arbeitssicherheit', tenantId: 'tenant_c', frist: '2025-09-30', pflicht: true },
   199|  { id: 'z_c_2', vorlagenId: 'vorlage_datenschutz',       tenantId: 'tenant_c', frist: '2025-12-31', pflicht: false },
   200|];
   201|