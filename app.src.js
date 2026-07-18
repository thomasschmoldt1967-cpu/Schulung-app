// ============================================================
// © 2024–2026 CSC GmbH, Petermax-Müller-Straße 3, 30880 Laatzen
// Alle Rechte vorbehalten. Geistiges Eigentum der CSC GmbH.
// Unbefugte Vervielfältigung, Weitergabe oder Nutzung dieses
// Codes ist ohne ausdrückliche schriftliche Genehmigung der
// CSC GmbH streng untersagt (§§ 69a ff. UrhG).
// ============================================================
// ============================================================
//  app.js  —  Schulungsverwaltungs-App (Supabase Edition)
//  Multi-Tenant | Ampelsystem | Audit-Trail | PDF-Export
//  v2.6 – Push-Benachrichtigungen | PDF-Bericht | Wiederkehrende
//         Schulungen | QR-Login | Kalender-Ampel | Admin-Suche
//         E-Mail-Benachrichtigungen | Schulungshistorie
// ============================================================
'use strict';

// ── KONSTANTEN ───────────────────────────────────────────────
const SESSION_KEY        = 'schulung_session';
const SESSION_HOURS      = 8;    // Session-Timeout: 8h Inaktivität
const INACTIVITY_MINUTES = 8 * 60; // Minuten bis Auto-Logout
const LERNPFAD_VORLAGE_ID = '__lernpfad__'; // Pseudo-ID für Lernpfad-Zuweisung

// ── GLOBALER APP-ZUSTAND ─────────────────────────────────────
let currentUser       = null;
let APP_TENANTS       = [];
let APP_USERS         = [];
let SCHULUNG_VORLAGEN = [];
let zuweisungen       = [];
let formulare         = {};   // { zuwId: { felder, gestartet, abgeschlossen, ... } }
let auditLog          = [];
let activeZuwId       = null;
let abschlussCallback = null;
let activeAdminTab    = 'uebersicht';
let activeDetailZuwId = null;
let sigPads           = {};
let uploadFiles       = {};
let inactivityTimer   = null; // Session-Timeout Timer
let pushSubscription  = null; // Push-Benachrichtigungen
let adminSuchFilter   = '';   // Admin-Suche Filter

// ── LERNPFAD: 22 KAPITEL (Gebäudereinigung & Höhentechnologie) ───────────
// Direkt in app.js — data.js wird nicht mehr geladen (Daten kommen aus Supabase)
// Stufe 1: Checklisten-System | Stufe 2+3: Tests + Mehrsprachigkeit (geplant)
const LERNPFAD_KAPITEL = [
  // ── Säule A: Gesetzliche Basis-Unterweisungen (§ 12 ArbSchG) ──
  { id:'kap_01', nr:1,  saeule:'A', titel:'Verhalten im Kundenobjekt & Unfallmeldung',           rechtsgrundlage:'§ 12 ArbSchG, DGUV V1' },
  { id:'kap_02', nr:2,  saeule:'A', titel:'Stolper-, Rutsch- und Sturzgefahren',                 rechtsgrundlage:'§ 12 ArbSchG, DGUV R 108-003' },
  { id:'kap_03', nr:3,  saeule:'A', titel:'Brandschutz und Fluchtwege',                          rechtsgrundlage:'§ 12 ArbSchG, ASR A2.2' },
  { id:'kap_04', nr:4,  saeule:'A', titel:'Erste Hilfe',                                         rechtsgrundlage:'§ 12 ArbSchG, DGUV R 100-001' },
  { id:'kap_05', nr:5,  saeule:'A', titel:'Hautschutz- und Hygienepläne (Feuchtarbeit)',         rechtsgrundlage:'§ 12 ArbSchG, TRGS 401' },
  { id:'kap_06', nr:6,  saeule:'A', titel:'Richtiges Händewaschen und Pflegen',                  rechtsgrundlage:'§ 12 ArbSchG, TRGS 401' },
  { id:'kap_07', nr:7,  saeule:'A', titel:'Dokumentationspflichten und Unfallmeldung',           rechtsgrundlage:'§ 24 SGB VII, DGUV V1 §24' },
  { id:'kap_08', nr:8,  saeule:'A', titel:'Elektrische Geräte & Arbeitsmittel',                  rechtsgrundlage:'§ 12 ArbSchG, BetrSichV, DGUV V3' },
  // ── Säule B: Reinigungstechnologie & Chemie (§ 14 GefStoffV) ──
  { id:'kap_09', nr:9,  saeule:'B', titel:'Richtige Dosierung von Reinigungsmitteln',            rechtsgrundlage:'§ 14 GefStoffV, TRGS 555' },
  { id:'kap_10', nr:10, saeule:'B', titel:'Betriebsanweisungen lesen und verstehen',             rechtsgrundlage:'§ 14 GefStoffV, TRGS 555' },
  { id:'kap_11', nr:11, saeule:'B', titel:'Gefahrensymbole und GHS-Kennzeichnung mit Piktogrammen', rechtsgrundlage:'§ 14 GefStoffV, CLP-Verordnung, GHS' },
  { id:'kap_12', nr:12, saeule:'B', titel:'Mischverbot (Chlor + Sanitärreiniger u.a.)',          rechtsgrundlage:'§ 14 GefStoffV, TRGS 555' },
  { id:'kap_13', nr:13, saeule:'B', titel:'Oberflächenkunde (Böden, Stein, Holz, Textil)',       rechtsgrundlage:'Fachkunde Gebäudereiniger' },
  { id:'kap_14', nr:14, saeule:'B', titel:'Maschinenkunde — Scheuersaugmaschinen',               rechtsgrundlage:'§ 12 ArbSchG, BetrSichV' },
  { id:'kap_15', nr:15, saeule:'B', titel:'Tägliche Wartung und Pflege von Maschinen',           rechtsgrundlage:'BetrSichV §4, DGUV R 100-500' },
  // ── Säule C: Datenschutz & DSGVO ──────────────────────────────
  { id:'kap_16', nr:16, saeule:'C', titel:'DSGVO-Grundlagen — Was ist Datenschutz?',             rechtsgrundlage:'Art. 5 DSGVO, BDSG 2018' },
  { id:'kap_17', nr:17, saeule:'C', titel:'Meine Pflichten als Mitarbeiter (Datenschutz)',       rechtsgrundlage:'Art. 5, 32 DSGVO, § 26 BDSG' },
  { id:'kap_18', nr:18, saeule:'C', titel:'Vertraulichkeit & Verschwiegenheitspflicht',          rechtsgrundlage:'GeschGehG, Art. 28 DSGVO' },
  { id:'kap_19', nr:19, saeule:'C', titel:'Umgang mit Kundendaten & Privatsphäre',               rechtsgrundlage:'Art. 5 DSGVO, BDSG' },
  { id:'kap_20', nr:20, saeule:'C', titel:'Besondere Verhaltensregeln im Kundenobjekt',          rechtsgrundlage:'Art. 5 DSGVO, GeschGehG' },
  { id:'kap_21', nr:21, saeule:'C', titel:'Meldepflichten bei Datenpannen',                      rechtsgrundlage:'Art. 33 DSGVO, § 65 BDSG' },
  { id:'kap_22', nr:22, saeule:'C', titel:'Alkohol, Drogen & Verhaltensregeln am Arbeitsplatz', rechtsgrundlage:'§ 15 ArbSchG, § 106 GewO' },
  // ── Säule D: Das 4-Farben-System — Hygiene & Kreuzkontaminationsvermeidung ──
  { id:'kap_23', nr:23, saeule:'D', titel:'Das 4-Farben-System — Überblick & Warum es Leben rettet',       rechtsgrundlage:'HACCP (EG Nr. 852/2004), DGUV V1, RKI-Richtlinien' },
  { id:'kap_24', nr:24, saeule:'D', titel:'🔴 Rot — Hochrisikozone: Sanitär & WC',                         rechtsgrundlage:'RKI-Hygieneleitlinien, HACCP' },
  { id:'kap_25', nr:25, saeule:'D', titel:'🟡 Gelb — Sekundärzone: Allgemeiner Sanitärbereich',             rechtsgrundlage:'RKI-Hygieneleitlinien, HACCP' },
  { id:'kap_26', nr:26, saeule:'D', titel:'🟢 Grün — Sensible Zone: Küche & Lebensmittelbereiche',          rechtsgrundlage:'HACCP (EG Nr. 852/2004), LMHV' },
  { id:'kap_27', nr:27, saeule:'D', titel:'🔵 Blau — Standardzone: Allgemeine Oberflächen',                 rechtsgrundlage:'DGUV V1, allgemeine Hygiene' },
  { id:'kap_28', nr:28, saeule:'D', titel:'Das Schloss-Prinzip, pH-Codierung & Mischverbote',              rechtsgrundlage:'§ 14 GefStoffV, TRGS 555' },
  { id:'kap_29', nr:29, saeule:'D', titel:'Wechseltuch-Methode, 16-Seiten-Falttechnik & Waschprotokoll',   rechtsgrundlage:'RKI-Richtlinien, HACCP' },
];

// ── LERNPFAD-HTML: Kapitel mit visuellen HTML-Inhalten ─────────────────────
// Einträge hier werden direkt als HTML gerendert (kein escHtml).
// Sprachfallback greift NICHT — der Inhalt ist universal/bildbasiert.
const LERNPFAD_HTML = {
  kap_10: `
<div style="font-size:.78rem;color:#374151;line-height:1.5">
  <div style="margin-bottom:6px">Auf Reinigungsmittelflaschen gibt es <strong>9 GHS-Piktogramme</strong> — erkenne sie und handle richtig:</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0">

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Explodierende Bombe -->
        <ellipse cx="50" cy="70" rx="14" ry="12" fill="black"/>
        <rect x="46" y="54" width="8" height="12" fill="black"/>
        <path d="M50,42 Q58,30 66,28 Q60,38 62,44 Q54,36 50,42Z" fill="black"/>
        <line x1="62" y1="28" x2="68" y2="22" stroke="black" stroke-width="3"/>
        <circle cx="70" cy="20" r="4" fill="#e00"/>
        <line x1="40" y1="68" x2="28" y2="75" stroke="black" stroke-width="3"/>
        <line x1="43" y1="78" x2="34" y2="88" stroke="black" stroke-width="3"/>
        <line x1="57" y1="79" x2="64" y2="89" stroke="black" stroke-width="3"/>
        <line x1="60" y1="68" x2="72" y2="73" stroke="black" stroke-width="3"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS01</div>
      <div style="font-size:.68rem;color:#374151">Explodierende Bombe</div>
      <div style="font-size:.65rem;color:#6b7280">Explosionsgefahr</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Flamme -->
        <path d="M50,30 C50,30 42,42 42,54 C42,62 46,68 50,68 C54,68 58,62 58,54 C58,42 50,30 50,30Z" fill="black"/>
        <path d="M44,44 C44,44 38,50 38,58 C38,68 44,76 50,76 C56,76 62,68 62,58 C62,48 56,40 50,38 C52,44 50,50 48,50 C46,50 44,48 44,44Z" fill="black"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS02</div>
      <div style="font-size:.68rem;color:#374151">Flamme</div>
      <div style="font-size:.65rem;color:#6b7280">Entzündbar/brennbar</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Flamme über Kreis -->
        <circle cx="50" cy="72" r="12" fill="none" stroke="black" stroke-width="5"/>
        <path d="M50,36 C50,36 44,45 44,53 C44,59 47,63 50,63 C53,63 56,59 56,53 C56,45 50,36 50,36Z" fill="black"/>
        <path d="M45,46 C45,46 40,51 40,57 C40,64 44,69 50,69 C56,69 60,64 60,57 C60,50 55,44 50,43 C52,48 50,52 48,52 C46,52 45,50 45,46Z" fill="black"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS03</div>
      <div style="font-size:.68rem;color:#374151">Flamme über Kreis</div>
      <div style="font-size:.65rem;color:#6b7280">Brandfördernd/oxidierend</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Gasflasche -->
        <rect x="38" y="48" width="20" height="28" rx="4" fill="black"/>
        <rect x="41" y="40" width="14" height="12" rx="3" fill="black"/>
        <rect x="44" y="33" width="8" height="10" rx="2" fill="black"/>
        <path d="M52,33 Q62,30 64,38 Q62,42 56,41" fill="none" stroke="black" stroke-width="3"/>
        <line x1="38" y1="76" x2="62" y2="76" stroke="black" stroke-width="4"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS04</div>
      <div style="font-size:.68rem;color:#374151">Gasflasche</div>
      <div style="font-size:.65rem;color:#6b7280">Gas unter Druck</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Ätzwirkung: Hand + Metall mit Tropfen -->
        <path d="M30,44 L34,44 L36,56 L38,44 L42,44 L44,58 L46,44 L48,44 L44,72 L36,72 Z" fill="black"/>
        <path d="M55,44 L59,44 L61,56 L63,44 L67,44 L63,72 L55,72 Z" fill="black"/>
        <path d="M38,34 Q50,22 62,34" fill="none" stroke="black" stroke-width="3.5" stroke-linecap="round"/>
        <circle cx="50" cy="30" r="3" fill="black"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS05</div>
      <div style="font-size:.68rem;color:#374151">Ätzwirkung</div>
      <div style="font-size:.65rem;color:#6b7280">Ätzt Haut &amp; Augen</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Totenkopf -->
        <circle cx="50" cy="52" r="20" fill="black"/>
        <circle cx="43" cy="50" r="6" fill="white"/>
        <circle cx="57" cy="50" r="6" fill="white"/>
        <path d="M44,62 L44,76 L56,76 L56,62" fill="none" stroke="black" stroke-width="0"/>
        <rect x="43" y="63" width="5" height="14" rx="1" fill="white"/>
        <rect x="51" y="63" width="5" height="14" rx="1" fill="white"/>
        <rect x="44" y="68" width="12" height="4" rx="1" fill="black"/>
        <path d="M36,60 Q50,70 64,60" fill="none" stroke="white" stroke-width="2"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS06</div>
      <div style="font-size:.68rem;color:#374151">Totenkopf</div>
      <div style="font-size:.65rem;color:#6b7280">Akut giftig</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Ausrufezeichen -->
        <rect x="45" y="35" width="10" height="30" rx="4" fill="black"/>
        <circle cx="50" cy="75" r="6" fill="black"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS07</div>
      <div style="font-size:.68rem;color:#374151">Ausrufezeichen</div>
      <div style="font-size:.65rem;color:#6b7280">Reizend/schädlich</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Gesundheitsgefahr: Silhouette Mensch mit Stern an Brust -->
        <circle cx="50" cy="36" r="8" fill="black"/>
        <path d="M36,50 Q38,44 50,46 Q62,44 64,50 L62,72 L54,72 L54,60 L46,60 L46,72 L38,72 Z" fill="black"/>
        <path d="M36,50 L28,60 M64,50 L72,60" stroke="black" stroke-width="5" stroke-linecap="round"/>
        <polygon points="50,50 52,56 58,56 53,60 55,66 50,62 45,66 47,60 42,56 48,56" fill="white"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS08</div>
      <div style="font-size:.68rem;color:#374151">Gesundheitsgefahr</div>
      <div style="font-size:.65rem;color:#6b7280">Chronisch gefährlich</div>
    </div>

    <div style="display:flex;flex-direction:column;align-items:center;text-align:center;background:#fff;border-radius:8px;padding:6px 4px;border:1px solid #e5e7eb">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="56" height="56">
        <rect width="100" height="100" fill="white"/>
        <polygon points="50,4 96,96 4,96" fill="white" stroke="#e00" stroke-width="7" stroke-linejoin="round"/>
        <!-- Umwelt: Baum + toter Baum + Fisch -->
        <path d="M50,76 L50,54" stroke="black" stroke-width="4"/>
        <path d="M50,54 Q40,44 42,34 Q50,40 50,54 Q50,40 58,34 Q60,44 50,54Z" fill="black"/>
        <path d="M32,76 L32,62" stroke="black" stroke-width="3"/>
        <line x1="32" y1="66" x2="24" y2="60" stroke="black" stroke-width="2.5"/>
        <line x1="32" y1="62" x2="40" y2="57" stroke="black" stroke-width="2.5"/>
        <line x1="32" y1="70" x2="23" y2="68" stroke="black" stroke-width="2.5"/>
        <path d="M58,84 Q66,78 74,82 Q70,74 62,76 Q68,70 74,72 Q68,64 60,68 L58,84Z" fill="black"/>
        <circle cx="73" cy="82" r="2" fill="black"/>
        <line x1="20" y1="76" x2="80" y2="76" stroke="black" stroke-width="2.5"/>
      </svg>
      <div style="font-weight:700;font-size:.72rem;color:#b91c1c;margin-top:2px">GHS09</div>
      <div style="font-size:.68rem;color:#374151">Umwelt</div>
      <div style="font-size:.65rem;color:#6b7280">Gewässergefährdend</div>
    </div>

  </div>
  <div style="font-size:.72rem;color:#6b7280;margin-top:4px">💡 Erkenne das Symbol → Handle richtig → Leben schützen</div>
</div>`,
};

// ── LERNPFAD-TEXTE: Erläuterungen in 7 Sprachen ──────────────────────────
// DE=Deutsch, TR=Türkisch, RO=Rumänisch, SR=Serbisch/Kroatisch, PL=Polnisch, EN=Englisch, AR=Arabisch
const LERNPFAD_TEXTE = {
  kap_01: {
    de: "Im Kundenobjekt verhältst du dich ruhig, ordentlich und respektvoll. Wenn ein Unfall passiert, meldest du ihn sofort deinem Vorgesetzten — egal wie klein. Nur so bist du rechtlich abgesichert und hilfst, weitere Unfälle zu verhindern.",
    tr: "Müşteri binasında sakin, düzenli ve saygılı davranmalısın. Bir kaza olursa, ne kadar küçük olursa olsun hemen amirine bildirmelisin. Bu hem seni hukuken korur hem de yeni kazaların önüne geçer.",
    ro: "La obiectivul clientului te comporți calm, ordonat și respectuos. Dacă se întâmplă un accident, îl raportezi imediat șefului tău, oricât de mic ar fi. Doar așa ești protejat legal și ajuți la prevenirea altor accidente.",
    sr: "U objektu klijenta ponašaš se mirno, uredno i s poštovanjem. Ako se desi nezgoda, odmah je prijavljuješ nadređenom — bez obzira koliko je mala. Samo tako si pravno zaštićen i pomažeš da se spreče nove nezgode.",
    pl: "W obiekcie klienta zachowujesz się spokojnie, schludnie i z szacunkiem. Jeśli zdarzy się wypadek, natychmiast zgłaszasz go przełożonemu — bez względu na to, jak mały jest. Tylko w ten sposób jesteś chroniony prawnie i pomagasz zapobiegać kolejnym wypadkom.",
    en: "In the customer's premises you behave calmly, tidily and respectfully. If an accident happens, report it to your supervisor immediately — no matter how small. Only this way are you legally protected and help prevent further accidents.",
    ar: "في موقع العميل تتصرف بهدوء ونظام واحترام. إذا وقع حادث، أبلغ عنه فوراً لمشرفك — بغض النظر عن صغره. فقط هكذا تكون محمياً قانونياً وتساعد في منع المزيد من الحوادث."
  },
  kap_02: {
    de: "Nasse Böden, lose Kabel oder unebene Stellen können zu schweren Stürzen führen. Stelle immer Warnschilder auf, wenn du feucht wischt, und räume Hindernisse sofort weg. Rutschfeste Schuhe sind Pflicht — trage sie immer.",
    tr: "Islak zeminler, gevşek kablolar veya düzensiz yüzeyler ciddi düşmelere yol açabilir. Islak zemin temizlerken her zaman uyarı levhası koy ve engelleri hemen kaldır. Kaymaz ayakkabı zorunludur — her zaman giy.",
    ro: "Podelele ude, cablurile loose sau suprafețele neuniforme pot duce la căderi grave. Pune întotdeauna semne de avertizare când ștergi ud și îndepărtează obstacolele imediat. Pantofii antiderapanți sunt obligatorii — poartă-i mereu.",
    sr: "Mokri podovi, labavi kablovi ili neravne površine mogu dovesti do teških padova. Uvijek postavi znakove upozorenja kada mokro brišeš i odmah ukloni prepreke. Cipele koje ne kližu su obavezne — uvijek ih nosi.",
    pl: "Mokre podłogi, luźne kable lub nierówne powierzchnie mogą prowadzić do poważnych upadków. Zawsze stawiaj znaki ostrzegawcze podczas mycia na mokro i natychmiast usuwaj przeszkody. Obuwie antypoślizgowe jest obowiązkowe — zawsze je noś.",
    en: "Wet floors, loose cables or uneven surfaces can lead to serious falls. Always put up warning signs when mopping wet and remove obstacles immediately. Non-slip shoes are mandatory — always wear them.",
    ar: "الأرضيات المبللة والكابلات الفضفاضة أو الأسطح غير المستوية يمكن أن تؤدي إلى سقطات خطيرة. ضع دائماً لافتات تحذيرية عند التنظيف الرطب وأزل العوائق فوراً. الأحذية المانعة للانزلاق إلزامية — ارتدها دائماً."
  },
  kap_03: {
    de: "Lerne beim ersten Arbeitstag, wo die Feuerlöscher und Notausgänge im Gebäude sind. Halte Fluchtwege immer frei — stelle niemals Geräte oder Reinigungswagen davor. Im Brandfall: Alarm auslösen, Menschen warnen, Gebäude verlassen — niemals den Aufzug nutzen.",
    tr: "İlk iş gününde binadaki yangın söndürücülerin ve acil çıkışların nerede olduğunu öğren. Kaçış yollarını her zaman açık tut — önlerine asla cihaz veya temizlik arabası koyma. Yangın durumunda: alarm ver, insanları uyar, binayı terk et — asla asansörü kullanma.",
    ro: "În prima zi de lucru, află unde sunt stingătoarele de incendiu și ieșirile de urgență din clădire. Păstrează căile de evacuare mereu libere — nu pune niciodată echipamente sau cărucioare de curățenie în fața lor. În caz de incendiu: declanșează alarma, avertizează oamenii, părăsește clădirea — nu folosi niciodată liftul.",
    sr: "Prvog radnog dana saznaj gdje su aparati za gašenje požara i izlazi za nuždu u zgradi. Uvijek drži puteve evakuacije slobodnim — nikad ne stavljaj uređaje ili kolica za čišćenje ispred njih. U slučaju požara: aktiviraj alarm, upozori ljude, napusti zgradu — nikad ne koristi lift.",
    pl: "W pierwszym dniu pracy dowiedz się, gdzie w budynku znajdują się gaśnice i wyjścia awaryjne. Zawsze utrzymuj drogi ewakuacyjne wolne — nigdy nie stawiaj urządzeń ani wózków czyszczących przed nimi. W przypadku pożaru: uruchom alarm, ostrzeż ludzi, opuść budynek — nigdy nie używaj windy.",
    en: "On your first working day, learn where the fire extinguishers and emergency exits are in the building. Always keep escape routes clear — never place equipment or cleaning trolleys in front of them. In case of fire: trigger the alarm, warn people, leave the building — never use the lift.",
    ar: "في أول يوم عمل، تعرّف على أماكن طفايات الحريق ومخارج الطوارئ في المبنى. ابقِ مسارات الإخلاء خالية دائماً — لا تضع أبداً معدات أو عربات تنظيف أمامها. في حالة الحريق: أطلق الإنذار وحذّر الناس واغادر المبنى — لا تستخدم المصعد أبداً."
  },
  kap_04: {
    de: "Erste Hilfe bedeutet: ruhig bleiben, den Notruf 112 anrufen und bis zum Eintreffen des Rettungsdienstes helfen. Lerne, wo der nächste Verbandskasten ist, und schau dir den Aushang mit den Erste-Hilfe-Nummern an. Auch kleine Wunden müssen versorgt und dokumentiert werden.",
    tr: "İlk yardım demek: sakin kalmak, 112 acil hattını aramak ve ambulans gelene kadar yardım etmek demektir. En yakın ilkyardım kutusunun nerede olduğunu öğren ve ilkyardım numaralarının yazılı olduğu afişe bak. Küçük yaralar da tedavi edilmeli ve kayıt altına alınmalıdır.",
    ro: "Primul ajutor înseamnă: rămâi calm, suni la numărul de urgență 112 și ajuți până sosește salvarea. Află unde este cea mai apropiată trusă de prim ajutor și uită-te la afișul cu numerele de urgență. Chiar și rănile mici trebuie tratate și documentate.",
    sr: "Prva pomoć znači: ostani miran, pozovi hitnu pomoć 112 i pomaži dok ne stigne hitna. Saznaj gdje je najbliži sanitetski kofer i pogledaj obavještenje s brojevima prve pomoći. Čak i male rane moraju biti zbrinute i dokumentovane.",
    pl: "Pierwsza pomoc oznacza: zachowaj spokój, zadzwoń pod numer alarmowy 112 i pomagaj do czasu przyjazdu pogotowia. Dowiedz się, gdzie jest najbliższa apteczka i zapoznaj się z ogłoszeniem z numerami pierwszej pomocy. Nawet małe rany muszą być opatrzone i udokumentowane.",
    en: "First aid means: stay calm, call emergency number 112 and help until the rescue service arrives. Learn where the nearest first aid kit is and look at the notice with the first aid numbers. Even small wounds must be treated and documented.",
    ar: "الإسعافات الأولية تعني: ابقَ هادئاً واتصل برقم الطوارئ 112 وقدّم المساعدة حتى وصول الإسعاف. تعرّف على موقع أقرب حقيبة إسعافات أولية واطّلع على لوحة أرقام الإسعاف. حتى الجروح الصغيرة يجب معالجتها وتوثيقها."
  },
  kap_05: {
    de: "Wer täglich viel mit Wasser und Reinigungsmitteln arbeitet, schädigt seine Haut — das nennt man Feuchtarbeit. Trage Schutzhandschuhe und benutze nach der Arbeit immer Hautpflegecreme. Den Hautschutzplan findest du im Aufenthaltsraum — halte dich daran.",
    tr: "Her gün çok fazla su ve temizlik ürünüyle çalışanlar ciltlerine zarar verir — buna ıslak çalışma denir. Koruyucu eldiven giy ve işten sonra her zaman cilt bakım kremi kullan. Cilt koruma planını dinlenme odasında bulabilirsin — ona uy.",
    ro: "Cine lucrează zilnic mult cu apă și detergenți își dăunează pielii — aceasta se numește lucru umed. Poartă mănuși de protecție și folosește întotdeauna cremă de îngrijire a pielii după muncă. Planul de protecție a pielii se află în camera de odihnă — respectă-l.",
    sr: "Ko svakodnevno radi s puno vode i sredstava za čišćenje, oštećuje svoju kožu — to se naziva mokri rad. Nosi zaštitne rukavice i nakon rada uvijek koristi kremu za njegu kože. Plan zaštite kože naći ćeš u prostoriji za odmor — pridržavaj ga se.",
    pl: "Kto codziennie pracuje z dużą ilością wody i środków czyszczących, niszczy swoją skórę — nazywa się to pracą w środowisku mokrym. Noś rękawice ochronne i po pracy zawsze używaj kremu do pielęgnacji skóry. Plan ochrony skóry znajdziesz w pokoju socjalnym — przestrzegaj go.",
    en: "Anyone who works daily with a lot of water and cleaning agents damages their skin — this is called wet work. Wear protective gloves and always use skin care cream after work. You will find the skin protection plan in the break room — follow it.",
    ar: "من يعمل يومياً مع كميات كبيرة من الماء والمنظفات يُتلف جلده — يُسمى هذا العمل الرطب. ارتدِ قفازات الحماية واستخدم دائماً كريم العناية بالجلد بعد العمل. ستجد خطة حماية الجلد في غرفة الراحة — التزم بها."
  },
  kap_06: {
    de: "Richtig Hände waschen heißt: mindestens 30 Sekunden mit Seife, auch zwischen den Fingern und unter den Nägeln. Trockne die Hände immer vollständig ab, danach Pflegecreme auftragen. Saubere Hände schützen dich und andere vor Krankheiten.",
    tr: "Doğru el yıkama: en az 30 saniye sabunla, parmaklar arasını ve tırnakların altını da yıka. Elleri her zaman tamamen kurula, ardından bakım kremi sür. Temiz eller seni ve başkalarını hastalıklardan korur.",
    ro: "Spălatul corect al mâinilor înseamnă: cel puțin 30 de secunde cu săpun, inclusiv între degete și sub unghii. Usucă întotdeauna mâinile complet, apoi aplică cremă de îngrijire. Mâinile curate te protejează pe tine și pe alții de boli.",
    sr: "Pravilno pranje ruku znači: najmanje 30 sekundi sapunom, i između prstiju i ispod noktiju. Uvijek potpuno osuši ruke, a zatim nanesite kremu za njegu. Čiste ruke štite tebe i druge od bolesti.",
    pl: "Prawidłowe mycie rąk oznacza: co najmniej 30 sekund mydłem, również między palcami i pod paznokciami. Zawsze dokładnie osusz ręce, a następnie nałóż krem pielęgnacyjny. Czyste ręce chronią ciebie i innych przed chorobami.",
    en: "Washing hands correctly means: at least 30 seconds with soap, including between the fingers and under the nails. Always dry your hands completely, then apply care cream. Clean hands protect you and others from illness.",
    ar: "غسل اليدين بشكل صحيح يعني: على الأقل 30 ثانية بالصابون، شاملاً ما بين الأصابع وتحت الأظافر. جفّف يديك دائماً بالكامل ثم ضع كريم العناية. اليدان النظيفتان تحميانك وتحميان الآخرين من الأمراض."
  },
  kap_07: {
    de: "Du musst bestimmte Dinge schriftlich festhalten: welche Räume gereinigt wurden, welche Mittel du verwendet hast und ob ein Unfall passiert ist. Diese Aufzeichnungen schützen dich bei Streitigkeiten und sind gesetzlich vorgeschrieben. Fülle die Listen sorgfältig und ehrlich aus.",
    tr: "Belirli şeyleri yazılı olarak kayıt altına alman gerekir: hangi odaların temizlendiğini, hangi ürünleri kullandığını ve kaza olup olmadığını. Bu kayıtlar anlaşmazlıklarda seni korur ve yasal olarak zorunludur. Listeleri dikkatli ve dürüstçe doldur.",
    ro: "Trebuie să notezi anumite lucruri în scris: care camere au fost curățate, ce produse ai folosit și dacă s-a întâmplat un accident. Aceste înregistrări te protejează în caz de dispute și sunt obligatorii prin lege. Completează listele cu grijă și onestitate.",
    sr: "Određene stvari moraš pisano evidentirati: koje prostorije su očišćene, koja sredstva si koristio i da li se dogodila nezgoda. Ovi zapisi te štite u sporovima i zakonski su obavezni. Popunjavaj liste pažljivo i pošteno.",
    pl: "Musisz pisemnie rejestrować określone rzeczy: które pomieszczenia zostały posprzątane, jakich środków użyłeś i czy wydarzył się wypadek. Te zapisy chronią cię w sporach i są wymagane przez prawo. Wypełniaj listy starannie i uczciwie.",
    en: "You must record certain things in writing: which rooms were cleaned, which products you used and whether an accident occurred. These records protect you in disputes and are required by law. Fill in the lists carefully and honestly.",
    ar: "يجب عليك توثيق أشياء معينة كتابياً: أي الغرف تم تنظيفها وأي المواد استخدمتها وما إذا وقع حادث. هذه السجلات تحميك في النزاعات وهي مطلوبة قانونياً. أملأ القوائم بعناية وأمانة."
  },
  kap_08: {
    de: "Elektrische Geräte wie Staubsauger oder Scheuersaugmaschinen müssen vor jeder Benutzung kurz auf Schäden geprüft werden — Kabel, Stecker, Gehäuse. Ziehe vor der Reinigung immer den Stecker aus der Steckdose. Defekte Geräte niemals benutzen und sofort melden — Reparaturen darfst du nicht selbst durchführen.",
    tr: "Elektrikli süpürge veya ovalama makineleri gibi elektrikli cihazlar her kullanımdan önce hasar açısından kısa kontrol edilmelidir — kablolar, fişler, gövde. Temizlemeden önce her zaman fişi prizden çekin. Arızalı cihazları asla kullanmayın ve hemen bildirin — onarımları kendiniz yapmamalısınız.",
    ro: "Echipamentele electrice precum aspiratoarele sau mașinile de frecat trebuie verificate pentru deteriorări înainte de fiecare utilizare — cabluri, fișe, carcasă. Înainte de curățare, scoateți întotdeauna fișa din priză. Nu utilizați niciodată echipamente defecte și raportați-le imediat — nu aveți voie să faceți singur reparații.",
    sr: "Električna oprema poput usisivača ili mašina za ribanje mora se kratko provjeravati na oštećenja prije svake upotrebe — kablovi, utikači, kućište. Uvijek izvuci utikač iz utičnice prije čišćenja. Nikad ne koristi pokvarenu opremu i odmah je prijavi — ne smiješ sam obavljati popravke.",
    pl: "Urządzenia elektryczne, takie jak odkurzacze lub maszyny szorujące, należy sprawdzać pod kątem uszkodzeń przed każdym użyciem — kable, wtyczki, obudowa. Przed czyszczeniem zawsze wyjmuj wtyczkę z gniazdka. Nigdy nie używaj wadliwego sprzętu i natychmiast zgłaszaj to — nie wolno ci samemu dokonywać napraw.",
    en: "Electrical equipment such as vacuum cleaners or scrubber-dryers must be briefly checked for damage before each use — cables, plugs, housing. Always unplug from the socket before cleaning. Never use defective equipment and report it immediately — you must not carry out repairs yourself.",
    ar: "يجب فحص المعدات الكهربائية مثل المكانس الكهربائية أو آلات التنظيف بحثاً عن أضرار قبل كل استخدام — الكابلات والقوابس والهياكل. افصل دائماً القابس من المقبس قبل التنظيف. لا تستخدم أبداً المعدات المعطوبة وأبلغ عنها فوراً — لا يُسمح لك بإجراء الإصلاحات بنفسك."
  },
  kap_09: {
    de: "Mehr Reinigungsmittel bedeutet nicht mehr Sauberkeit — zu viel schadet den Oberflächen und deiner Gesundheit. Halte dich immer genau an die Dosierungsangaben auf der Flasche oder im Aushang. Miss die Menge ab — schütte niemals einfach drauf los.",
    tr: "Daha fazla temizlik ürünü daha fazla temizlik demek değildir — fazla kullanmak yüzeylere ve sağlığına zarar verir. Her zaman şişedeki veya ilan panosundaki dozaj talimatlarına tam olarak uy. Miktarı ölç — asla gelişigüzel dökme.",
    ro: "Mai mult detergent nu înseamnă mai multă curățenie — prea mult dăunează suprafețelor și sănătății tale. Respectă întotdeauna exact indicațiile de dozare de pe sticlă sau de pe afișaj. Măsoară cantitatea — nu turna niciodată la întâmplare.",
    sr: "Više sredstva za čišćenje ne znači veću čistoću — previše šteti površinama i tvom zdravlju. Uvijek se pridržavaj točno uputa za doziranje na boci ili na oglasnoj ploči. Odmjeri količinu — nikad ne sipaj nasumično.",
    pl: "Więcej środka czyszczącego nie oznacza większej czystości — za dużo szkodzi powierzchniom i twojemu zdrowiu. Zawsze ściśle przestrzegaj wskazówek dotyczących dawkowania na butelce lub na tablicy informacyjnej. Odmierzaj ilość — nigdy nie lejaj na oślep.",
    en: "More cleaning agent does not mean more cleanliness — too much damages surfaces and your health. Always follow the dosage instructions on the bottle or notice board exactly. Measure the quantity — never just pour it on.",
    ar: "المزيد من المنظف لا يعني نظافة أكبر — الكميات الزائدة تضر بالأسطح وبصحتك. اتبع دائماً تعليمات الجرعة على الزجاجة أو اللوحة الإعلانية بدقة. قِس الكمية — لا تصب المنظف عشوائياً أبداً."
  },
  kap_10: {
    de: "Jede Betriebsanweisung erklärt, wie du ein Reinigungsmittel sicher benutzt — lies sie immer, bevor du anfängst. Darin steht: was das Mittel kann, wie du es anwendest und was du im Notfall tun musst. Frag deinen Vorgesetzten, wenn du etwas nicht verstehst.",
    tr: "Her kullanım talimatı, bir temizlik ürününü nasıl güvenli kullanacağını açıklar — başlamadan önce her zaman oku. İçinde şunlar yazar: ürünün ne işe yaradığı, nasıl kullanılacağı ve acil durumda ne yapman gerektiği. Bir şeyi anlamazsan amirine sor.",
    ro: "Fiecare instrucțiune de utilizare explică cum să folosești în siguranță un produs de curățare — citește-o întotdeauna înainte să începi. Conține: ce poate face produsul, cum îl aplici și ce trebuie să faci în caz de urgență. Întreabă-ți superiorul dacă nu înțelegi ceva.",
    sr: "Svako uputstvo za rad objašnjava kako sigurno koristiti sredstvo za čišćenje — uvijek ga čitaj prije nego što počneš. U njemu piše: šta sredstvo može, kako ga koristiti i šta moraš uraditi u hitnom slučaju. Pitaj nadređenog ako nešto ne razumiješ.",
    pl: "Każda instrukcja obsługi wyjaśnia, jak bezpiecznie używać środka czyszczącego — zawsze ją czytaj przed rozpoczęciem pracy. Zawiera: co może zrobić środek, jak go stosować i co musisz zrobić w nagłym przypadku. Zapytaj przełożonego, jeśli czegoś nie rozumiesz.",
    en: "Every operating instruction explains how to use a cleaning agent safely — always read it before you start. It contains: what the product can do, how to apply it and what to do in an emergency. Ask your supervisor if you do not understand something.",
    ar: "كل تعليمات التشغيل تشرح كيفية استخدام مادة التنظيف بأمان — اقرأها دائماً قبل البدء. تحتوي على: ما يمكن أن تفعله المادة وكيفية تطبيقها وما يجب فعله في حالات الطوارئ. اسأل مشرفك إذا لم تفهم شيئاً."
  },
  kap_11: {
    de: "Auf Reinigungsmittelflaschen gibt es 9 GHS-Piktogramme, die dir auf einen Blick zeigen welche Gefahr droht:\n\n🔴 GHS01 – Explodierende Bombe: Explosionsgefahr — Produkt kann explodieren (Druck, Reibung, Hitze)\n🔴 GHS02 – Flamme: Entzündbar — leicht brennbar, Hitze und offenes Feuer fernhalten\n🔴 GHS03 – Flamme über Kreis: Brandfördernd/Oxidierend — kann andere Stoffe entflammen\n🔴 GHS04 – Gasflasche: Gas unter Druck — Behälter kann platzen (z.B. Sprühflaschen)\n🔴 GHS05 – Ätzwirkung: Ätzend — greift Haut, Augen und Metalle an (z.B. Abflussreiniger)\n🔴 GHS06 – Totenkopf: Akut giftig — bereits kleine Mengen können tödlich sein\n🟡 GHS07 – Ausrufezeichen: Reizend/Schädlich — reizt Haut oder Augen, schädlich bei Einatmen\n🟡 GHS08 – Gesundheitsgefahr: Chronisch gefährlich — krebserregend, erbgutverändernd, fortpflanzungsgefährdend\n🔵 GHS09 – Umwelt: Gewässergefährdend — nicht in den Abfluss, umweltgerecht entsorgen\n\nTipp: Erkenne das Symbol → Handle richtig → Leben schützen.",
    tr: "Temizlik ürünü şişelerinde 9 GHS piktogramı bulunur ve size tek bakışta tehlikeyi gösterir:\n\n🔴 GHS01 – Patlayan Bomba: Patlama tehlikesi — basınç, sürtünme, ısıyla patlayabilir\n🔴 GHS02 – Alev: Yanıcı — kolayca tutuşur, ısı ve açık ateşten uzak tut\n🔴 GHS03 – Daire Üzerinde Alev: Yanmayı destekleyici — diğer maddeleri tutuşturabilir\n🔴 GHS04 – Gaz Tüpü: Basınç altında gaz — kap patlayabilir (sprey şişeler gibi)\n🔴 GHS05 – Aşındırıcı Etki: Aşındırıcı — deri, gözler ve metallere zarar verir\n🔴 GHS06 – Kurukafa: Akut zehirli — küçük miktarlar bile ölümcül olabilir\n🟡 GHS07 – Ünlem İşareti: Tahriş edici — deriyi veya gözleri tahriş eder, solunumda zararlı\n🟡 GHS08 – Sağlık Tehlikesi: Kronik tehlikeli — kanserojen, mutajenik, üreme toksik\n🔵 GHS09 – Çevre: Su kirliliği — gidere dökme, çevre dostu bertaraf et\n\nİpucu: Sembolü tanı → Doğru davran → Hayat kurtar.",
    ro: "Pe sticlele de detergenți există 9 pictograme GHS care îți arată dintr-o privire pericolul:\n\n🔴 GHS01 – Bombă explodând: Pericol de explozie — poate exploda la presiune, frecare, căldură\n🔴 GHS02 – Flacără: Inflamabil — se aprinde ușor, ține departe de căldură și foc deschis\n🔴 GHS03 – Flacără deasupra cercului: Comburant — poate aprinde alte substanțe\n🔴 GHS04 – Butelie de gaz: Gaz sub presiune — recipientul poate exploda (spray-uri)\n🔴 GHS05 – Coroziune: Coroziv — atacă pielea, ochii și metalele (ex. desfundator)\n🔴 GHS06 – Craniu: Toxic acut — chiar și cantități mici pot fi fatale\n🟡 GHS07 – Semn de exclamare: Iritant/Nociv — iritează pielea sau ochii, nociv prin inhalare\n🟡 GHS08 – Pericol pentru sănătate: Pericol cronic — cancerigen, mutagen, toxic pentru reproducere\n🔵 GHS09 – Mediu: Periculos pentru mediul acvatic — nu arunca la canal, elimină ecologic\n\nSfat: Recunoaște simbolul → Acționează corect → Protejează viața.",
    sr: "Na bocama sredstava za čišćenje postoji 9 GHS piktograma koji ti jednim pogledom pokazuju opasnost:\n\n🔴 GHS01 – Eksplodirajuća bomba: Opasnost od eksplozije — može eksplodirati od pritiska, trenja, topline\n🔴 GHS02 – Plamen: Zapaljivo — lako se pali, drži dalje od topline i otvorenog plamena\n🔴 GHS03 – Plamen iznad kruga: Oksidativno — može zapaliti druge tvari\n🔴 GHS04 – Boca plina: Plin pod pritiskom — posuda može eksplodirati (npr. sprej boce)\n🔴 GHS05 – Korozivnost: Korozivno — nagriza kožu, oči i metale (npr. čistač odvoda)\n🔴 GHS06 – Lubanja: Akutno otrovano — čak i male količine mogu biti smrtonosne\n🟡 GHS07 – Uskličnik: Nadražujuće — nadražuje kožu ili oči, štetno pri udisanju\n🟡 GHS08 – Zdravstvena opasnost: Kronično opasno — kancerogeno, mutageno, reproduktivno toksično\n🔵 GHS09 – Okoliš: Opasno za vodeni okoliš — ne u odvod, zbrinuti ekološki\n\nSavjet: Prepoznaj simbol → Djeluj ispravno → Zaštiti život.",
    pl: "Na butelkach środków czyszczących znajduje się 9 piktogramów GHS, które jednym spojrzeniem pokazują grożące niebezpieczeństwo:\n\n🔴 GHS01 – Wybuchająca bomba: Niebezpieczeństwo wybuchu — może wybuchnąć pod wpływem ciśnienia, tarcia, ciepła\n🔴 GHS02 – Płomień: Łatwopalne — łatwo się zapala, trzymaj z dala od ciepła i otwartego ognia\n🔴 GHS03 – Płomień nad kołem: Utleniające — może zapalać inne substancje\n🔴 GHS04 – Butla gazowa: Gaz pod ciśnieniem — pojemnik może pęknąć (np. spray)\n🔴 GHS05 – Działanie żrące: Żrące — niszczy skórę, oczy i metale (np. odtykacz)\n🔴 GHS06 – Trup: Toksyczność ostra — nawet małe ilości mogą być śmiertelne\n🟡 GHS07 – Wykrzyknik: Drażniące — drażni skórę lub oczy, szkodliwe przy wdychaniu\n🟡 GHS08 – Zagrożenie dla zdrowia: Przewlekle niebezpieczne — rakotwórcze, mutagenne, toksyczne dla rozrodczości\n🔵 GHS09 – Środowisko: Szkodliwe dla środowiska wodnego — nie wlewać do kanalizacji, utylizować ekologicznie\n\nWskazówka: Rozpoznaj symbol → Działaj właściwie → Chroń życie.",
    en: "Cleaning agent bottles carry 9 GHS pictograms that show you at a glance which hazard is present:\n\n🔴 GHS01 – Exploding bomb: Explosion hazard — can explode from pressure, friction or heat\n🔴 GHS02 – Flame: Flammable — ignites easily, keep away from heat and open flames\n🔴 GHS03 – Flame over circle: Oxidising — can ignite other substances\n🔴 GHS04 – Gas cylinder: Gas under pressure — container can burst (e.g. spray bottles)\n🔴 GHS05 – Corrosion: Corrosive — attacks skin, eyes and metals (e.g. drain cleaner)\n🔴 GHS06 – Skull: Acutely toxic — even small amounts can be fatal\n🟡 GHS07 – Exclamation mark: Irritant/Harmful — irritates skin or eyes, harmful if inhaled\n🟡 GHS08 – Health hazard: Chronically dangerous — carcinogenic, mutagenic, reproductive toxin\n🔵 GHS09 – Environment: Hazardous to the aquatic environment — do not pour down drain, dispose of correctly\n\nTip: Recognise the symbol → Act correctly → Protect lives.",
    ar: "تحمل زجاجات مواد التنظيف 9 رموز GHS تُظهر لك بنظرة واحدة نوع الخطر:\n\n🔴 GHS01 – قنبلة منفجرة: خطر انفجار — قد ينفجر من الضغط أو الاحتكاك أو الحرارة\n🔴 GHS02 – لهب: قابل للاشتعال — يشتعل بسهولة، ابقِه بعيداً عن الحرارة والنيران المكشوفة\n🔴 GHS03 – لهب فوق دائرة: مؤكسِد — قد يُشعل مواد أخرى\n🔴 GHS04 – أسطوانة غاز: غاز تحت ضغط — الوعاء قد ينفجر (مثل علب الرش)\n🔴 GHS05 – تآكل: مادة آكلة — تضر بالجلد والعيون والمعادن (مثل منظف المجاري)\n🔴 GHS06 – جمجمة: سام حاد — حتى الكميات الصغيرة قد تكون قاتلة\n🟡 GHS07 – علامة تعجب: مهيّج/ضار — يهيّج الجلد أو العينين، ضار عند الاستنشاق\n🟡 GHS08 – خطر صحي: خطير مزمن — مسرطن أو مطفّر أو ضار بالتكاثر\n🔵 GHS09 – بيئة: خطير على البيئة المائية — لا تصبّه في المصرف، تخلص منه بطريقة صحيحة\n\nنصيحة: تعرّف على الرمز ← تصرّف بشكل صحيح ← احمِ الحياة."
  },
  kap_12: {
    de: "Manche Reinigungsmittel darf man NIEMALS mischen — zum Beispiel Chlorreiniger und Sanitärreiniger zusammen erzeugen giftige Gase. Lies immer das Etikett und frage nach, bevor du zwei Mittel zusammen benutzt. Im Zweifelsfall: lieber weniger mischen als riskieren.",
    tr: "Bazı temizlik ürünlerini ASLA karıştırmamalısın — örneğin klorlu temizleyici ile banyo temizleyicisi birlikte zehirli gaz üretir. Her zaman etiketi oku ve iki ürünü birlikte kullanmadan önce sor. Şüphe durumunda: riske girmek yerine az karıştır.",
    ro: "Unele produse de curățare NU trebuie NICIODATĂ amestecate — de exemplu, curățătorul cu clor și curățătorul sanitar împreună produc gaze toxice. Citește întotdeauna eticheta și întreabă înainte să folosești două produse împreună. În caz de dubiu: mai bine amesteci mai puțin decât să riști.",
    sr: "Neka sredstva za čišćenje se NIKAD ne smiju miješati — na primjer, klorni čistač i sanitarni čistač zajedno stvaraju otrovne plinove. Uvijek čitaj etiketu i pitaj prije nego što koristiš dva sredstva zajedno. U slučaju sumnje: bolje manje miješati nego riskirati.",
    pl: "Niektórych środków czyszczących NIGDY nie wolno mieszać — na przykład środek chlorowy i środek do sanitariatów razem wytwarzają trujące gazy. Zawsze czytaj etykietę i pytaj, zanim użyjesz dwóch środków razem. W razie wątpliwości: lepiej mieszać mniej niż ryzykować.",
    en: "Some cleaning agents must NEVER be mixed — for example, chlorine cleaner and sanitary cleaner together produce toxic gases. Always read the label and ask before using two products together. If in doubt: mix less rather than take the risk.",
    ar: "بعض مواد التنظيف يجب ألا تُخلط أبداً — فمثلاً خلط منظف الكلور مع منظف الصرف يُنتج غازات سامة. اقرأ دائماً الملصق واستشر قبل استخدام مادتين معاً. عند الشك: أقل خلطاً خير من المخاطرة."
  },
  kap_13: {
    de: "Nicht jedes Reinigungsmittel passt zu jeder Oberfläche — falsches Mittel kann Böden, Stein oder Holz dauerhaft beschädigen. Lerne, welche Mittel für welche Flächen erlaubt sind, und frage im Zweifel nach. Teste neue Mittel immer zuerst an einer kleinen, versteckten Stelle.",
    tr: "Her temizlik ürünü her yüzeye uygun değildir — yanlış ürün zeminleri, taşı veya ahşabı kalıcı olarak hasar verebilir. Hangi ürünlerin hangi yüzeyler için uygun olduğunu öğren ve şüphe durumunda sor. Yeni ürünleri her zaman önce küçük, gizli bir bölgede test et.",
    ro: "Nu orice produs de curățare este potrivit pentru orice suprafață — produsul greșit poate deteriora permanent podelele, piatra sau lemnul. Află ce produse sunt permise pentru ce suprafețe și întreabă dacă ai dubii. Testează întotdeauna produsele noi mai întâi pe o zonă mică și ascunsă.",
    sr: "Nije svako sredstvo za čišćenje prikladno za svaku površinu — pogrešno sredstvo može trajno oštetiti podove, kamen ili drvo. Nauči koja sredstva su dozvoljena za koje površine i pitaj ako si u nedoumici. Uvijek testiraj nova sredstva prvo na malom, skrivenom mjestu.",
    pl: "Nie każdy środek czyszczący nadaje się do każdej powierzchni — niewłaściwy środek może trwale uszkodzić podłogi, kamień lub drewno. Dowiedz się, jakie środki są dozwolone do jakich powierzchni i pytaj w razie wątpliwości. Zawsze testuj nowe środki najpierw na małym, ukrytym miejscu.",
    en: "Not every cleaning agent is suitable for every surface — the wrong product can permanently damage floors, stone or wood. Learn which products are permitted for which surfaces and ask if in doubt. Always test new products first on a small, hidden area.",
    ar: "ليست كل مادة تنظيف مناسبة لكل سطح — المادة الخاطئة قد تُتلف الأرضيات أو الحجارة أو الخشب بشكل دائم. تعلّم أي المواد مسموح باستخدامها على أي سطح واسأل عند الشك. اختبر المواد الجديدة دائماً أولاً على منطقة صغيرة مخفية."
  },
  kap_14: {
    de: "Scheuersaugmaschinen reinigen Böden schnell und gründlich — aber nur, wenn man sie richtig bedient. Lerne die Schalter und Hebel kennen, bevor du die Maschine startest, und fahre nie zu schnell. Bei Problemen oder komischen Geräuschen: Maschine stoppen und Vorgesetzten informieren.",
    tr: "Ovalama-emme makineleri zeminleri hızlı ve kapsamlı temizler — ama ancak doğru kullanıldıklarında. Makineyi çalıştırmadan önce düğmeleri ve kolları öğren ve asla çok hızlı sürme. Sorun veya garip ses olursa: makineyi durdur ve amirini bilgilendir.",
    ro: "Mașinile de frecat-aspirat curăță podelele rapid și temeinic — dar numai dacă sunt utilizate corect. Cunoaște butoanele și mânerele înainte să pornești mașina și nu merge niciodată prea repede. La probleme sau zgomote ciudate: oprește mașina și informează superiorul.",
    sr: "Mašine za ribanje i usisavanje čiste podove brzo i temeljito — ali samo ako se pravilno koriste. Upoznaj prekidače i poluge prije nego što pokreneš mašinu i nikad ne vozi prebrzo. Kod problema ili čudnih zvukova: zaustavi mašinu i obavijesti nadređenog.",
    pl: "Maszyny szorująco-zbierające czyszczą podłogi szybko i dokładnie — ale tylko wtedy, gdy są prawidłowo obsługiwane. Poznaj przyciski i dźwignie przed uruchomieniem maszyny i nigdy nie jedź zbyt szybko. W przypadku problemów lub dziwnych dźwięków: zatrzymaj maszynę i poinformuj przełożonego.",
    en: "Scrubber-dryers clean floors quickly and thoroughly — but only when operated correctly. Learn the switches and levers before starting the machine and never drive too fast. If there are problems or strange noises: stop the machine and inform your supervisor.",
    ar: "آلات التنظيف بالدعك والتجفيف تنظف الأرضيات بسرعة وكفاءة — لكن فقط عند تشغيلها بشكل صحيح. تعرّف على المفاتيح والرافعات قبل تشغيل الآلة ولا تقد بسرعة كبيرة أبداً. عند وجود مشكلات أو أصوات غريبة: أوقف الآلة وأبلغ مشرفك."
  },
  kap_15: {
    de: "Nach jeder Schicht musst du die Maschine reinigen: Schmutzwasser entleeren, Bürsten abspülen und alles trocken lagern. Schau täglich nach, ob Kabel, Stecker oder Räder beschädigt sind — defekte Maschinen nie benutzen. Gepflegte Maschinen halten länger und arbeiten sicherer.",
    tr: "Her vardiyadan sonra makineyi temizlemelisin: kirli suyu boşalt, fırçaları çalkala ve her şeyi kuru olarak depola. Kablo, fiş veya tekerleklerin hasar görüp görmediğini her gün kontrol et — arızalı makineleri asla kullanma. Bakımlı makineler daha uzun sürer ve daha güvenli çalışır.",
    ro: "După fiecare tură trebuie să cureți mașina: golești apa murdară, clătești perii și depozitezi totul uscat. Verifică zilnic dacă cablurile, prizele sau roțile sunt deteriorate — nu folosi niciodată mașini defecte. Mașinile întreținute durează mai mult și funcționează mai sigur.",
    sr: "Nakon svake smjene moraš očistiti mašinu: isprazniti prljavu vodu, isprati četke i pohraniti sve suho. Svakodnevno provjeravaj jesu li kablovi, utikači ili kotači oštećeni — nikad ne koristi pokvarene mašine. Održavane mašine traju duže i rade sigurnije.",
    pl: "Po każdej zmianie musisz wyczyścić maszynę: opróżnić brudną wodę, przepłukać szczotki i przechować wszystko suche. Codziennie sprawdzaj, czy kable, wtyczki lub koła nie są uszkodzone — nigdy nie używaj uszkodzonych maszin. Zadbane maszyny działają dłużej i bezpieczniej.",
    en: "After each shift you must clean the machine: empty the dirty water, rinse the brushes and store everything dry. Check daily whether cables, plugs or wheels are damaged — never use defective machines. Well-maintained machines last longer and operate more safely.",
    ar: "بعد كل وردية يجب عليك تنظيف الآلة: تفريغ الماء القذر وشطف الفرش وتخزين كل شيء جافاً. افحص يومياً ما إذا كانت الكابلات أو القوابس أو العجلات تالفة — لا تستخدم الآلات المعطوبة أبداً. الآلات المُصانة تدوم أطول وتعمل بأمان أكبر."
  },
  kap_16: {
    de: "Die DSGVO (Datenschutz-Grundverordnung) schützt die persönlichen Daten aller Menschen in der EU. Als Mitarbeiter im Reinigungsdienst kommst du täglich mit fremden Daten in Berührung — Namensschilder, Post, Dokumente, Computer. Du bist verpflichtet, all das vertraulich zu behandeln.",
    tr: "GDPR, AB'deki tüm insanların kişisel verilerini korur. Temizlik hizmetinde çalışan biri olarak her gün başkalarının verileriyle karşılaşırsın — isim etiketleri, posta, belgeler, bilgisayarlar. Bunların tamamını gizli tutmakla yükümlüsün.",
    ro: "GDPR protejează datele personale ale tuturor persoanelor din UE. Ca angajat în serviciile de curățenie, intri zilnic în contact cu date ale altora — etichete cu nume, corespondență, documente, calculatoare. Ești obligat să tratezi totul confidențial.",
    sr: "GDPR štiti osobne podatke svih ljudi u EU. Kao zaposlenik u uslugama čišćenja, svakodnevno dolaziš u kontakt s tuđim podacima — natpisne pločice, pošta, dokumenti, računala. Dužan si sve to tretirati povjerljivo.",
    pl: "RODO chroni dane osobowe wszystkich ludzi w UE. Jako pracownik w służbach sprzątających codziennie masz kontakt z danymi innych osób — tabliczki z imionami, poczta, dokumenty, komputery. Jesteś zobowiązany do zachowania pełnej poufności.",
    en: "The GDPR protects the personal data of all people in the EU. As a cleaning service employee, you come into contact with other people's data every day — name badges, mail, documents, computers. You are obliged to treat all of this confidentially.",
    ar: "تحمي اللائحة العامة لحماية البيانات (GDPR) البيانات الشخصية لجميع الأشخاص في الاتحاد الأوروبي. بوصفك موظفاً في خدمات التنظيف تتعامل يومياً مع بيانات الآخرين — بطاقات الأسماء والبريد والوثائق وأجهزة الكمبيوتر. أنت ملزم بمعاملة كل ذلك بسرية تامة."
  },
  kap_17: {
    de: "Du darfst persönliche Daten nur für den vorgesehenen Zweck verwenden — nicht für private Dinge oder Neugierde. Schütze Passwörter und Zugangsdaten, die du durch deine Arbeit kennst. Wenn du einen Datenschutzverstoß bemerkst — zum Beispiel offen liegende Akten — melde ihn sofort deinem Vorgesetzten.",
    tr: "Kişisel verileri yalnızca belirtilen amaç için kullanabilirsin — kişisel ya da merak amaçlı değil. İşin aracılığıyla öğrendiğin şifreleri ve erişim bilgilerini koru. Bir veri ihlali fark edersen — örneğin açıkta duran dosyalar — hemen amirini bilgilendir.",
    ro: "Poți folosi datele personale doar în scopul prevăzut — nu pentru uz personal sau din curiozitate. Protejează parolele și datele de acces pe care le cunoști din activitatea ta. Dacă observi o încălcare a protecției datelor — de exemplu dosare lăsate deschise — raportează-o imediat superiorului tău.",
    sr: "Smijete koristiti osobne podatke samo u predviđenu svrhu — ne za privatne stvari ili znatiželju. Zaštiti lozinke i pristupne podatke koje znaš kroz svoj posao. Ako primijetiš kršenje zaštite podataka — npr. otvorene spise — odmah to prijavi nadređenom.",
    pl: "Możesz używać danych osobowych tylko w wyznaczonym celu — nie do spraw prywatnych ani z ciekawości. Chroń hasła i dane dostępowe, które poznajesz przez swoją pracę. Jeśli zauważysz naruszenie ochrony danych — na przykład otwarte teczki — natychmiast zgłoś to swojemu przełożonemu.",
    en: "You may only use personal data for the intended purpose — not for private matters or out of curiosity. Protect passwords and access data that you come to know through your work. If you notice a data protection violation — for example open files — report it immediately to your supervisor.",
    ar: "لا يجوز لك استخدام البيانات الشخصية إلا للغرض المحدد — ليس لأغراض شخصية أو من باب الفضول. احمِ كلمات المرور وبيانات الوصول التي تعرفها من خلال عملك. إذا لاحظت انتهاكاً لحماية البيانات — مثل ملفات مفتوحة — أبلغ مشرفك فوراً."
  },
  kap_18: {
    de: "Verschwiegenheit bedeutet: Was du bei der Arbeit siehst, hörst oder weißt, bleibt bei dir. Das gilt für Kundennamen, Adressen, wirtschaftliche Verhältnisse und Firmengeheimnisse. Diese Pflicht gilt auch noch nach Ende des Arbeitsverhältnisses — für immer.",
    tr: "Gizlilik demek: İşte gördüğün, duyduğun veya bildiğin şeyler sende kalır. Bu durum müşteri isimleri, adresler, ekonomik koşullar ve ticari sırlar için geçerlidir. Bu yükümlülük iş ilişkisi sona erdikten sonra da geçerlidir — sonsuza kadar.",
    ro: "Confidențialitatea înseamnă: ceea ce vezi, auzi sau știi la locul de muncă rămâne la tine. Aceasta se aplică numelor clienților, adreselor, situațiilor economice și secretelor de afaceri. Această obligație se aplică și după încetarea raportului de muncă — pentru totdeauna.",
    sr: "Povjerljivost znači: ono što vidiš, čuješ ili znaš na poslu ostaje kod tebe. To se odnosi na imena klijenata, adrese, ekonomske uvjete i poslovne tajne. Ova obveza vrijedi i nakon prestanka radnog odnosa — zauvijek.",
    pl: "Poufność oznacza: to, co widzisz, słyszysz lub wiesz w pracy, pozostaje przy tobie. Dotyczy to nazwisk klientów, adresów, sytuacji ekonomicznej i tajemnic przedsiębiorstwa. Ten obowiązek obowiązuje również po zakończeniu stosunku pracy — na zawsze.",
    en: "Confidentiality means: what you see, hear or know at work stays with you. This applies to customer names, addresses, economic circumstances and trade secrets. This obligation also applies after the end of the employment relationship — forever.",
    ar: "السرية تعني: ما تراه أو تسمعه أو تعرفه في العمل يبقى عندك. ينطبق هذا على أسماء العملاء والعناوين والأوضاع الاقتصادية والأسرار التجارية. هذا الالتزام ساري أيضاً بعد انتهاء علاقة العمل — إلى الأبد."
  },
  kap_19: {
    de: "Im Kundenobjekt triffst du auf persönliche Gegenstände, Fotos, Dokumente und Computer der Menschen, die dort arbeiten oder wohnen. Berühre solche Sachen nicht unnötig, schau nicht in Unterlagen und lies keine Bildschirme. Deine Aufgabe ist Reinigung — nicht Neugier.",
    tr: "Müşteri binasında orada çalışan veya yaşayan kişilerin kişisel eşyalarına, fotoğraflarına, belgelerine ve bilgisayarlarına rastlarsın. Bu tür şeylere gereksiz yere dokunma, belgelere bakma ve ekranları okuma. Görevin temizlik — merak değil.",
    ro: "La obiectivul clientului întâlnești obiecte personale, fotografii, documente și calculatoare ale persoanelor care lucrează sau locuiesc acolo. Nu atinge astfel de lucruri inutil, nu te uita în dosare și nu citi ecranele. Sarcina ta este curățenia — nu curiozitatea.",
    sr: "U objektu klijenta nailazit ćeš na osobne predmete, fotografije, dokumente i računala osoba koje tamo rade ili žive. Ne diraj takve stvari nepotrebno, ne gledaj u spise i ne čitaj zaslone. Tvoj zadatak je čišćenje — ne znatiželja.",
    pl: "W obiekcie klienta natrafisz na osobiste przedmioty, zdjęcia, dokumenty i komputery osób, które tam pracują lub mieszkają. Nie dotykaj takich rzeczy niepotrzebnie, nie zaglądaj do teczek i nie czytaj ekranów. Twoje zadanie to sprzątanie — nie ciekawość.",
    en: "In the customer's premises you encounter personal belongings, photos, documents and computers of the people who work or live there. Do not touch such things unnecessarily, do not look at documents and do not read screens. Your task is cleaning — not curiosity.",
    ar: "في مواقع العميل ستجد أغراضاً شخصية وصوراً ووثائق وأجهزة حاسوب تخص الأشخاص الذين يعملون أو يقيمون هناك. لا تلمس مثل هذه الأشياء دون ضرورة، ولا تطّلع على الوثائق ولا تقرأ الشاشات. مهمتك هي التنظيف — لا الفضول."
  },
  kap_20: {
    de: "Wenn dir auffällt, dass Daten in Gefahr sind — zum Beispiel ein offener PC, liegengebliebene Ausweise oder Akten auf dem Boden — muss das sofort dem Vorgesetzten gemeldet werden. Mach keine Fotos von solchen Situationen mit dem Smartphone — auch nicht als Beweis. Eine Datenpanne kann zu hohen Bußgeldern führen.",
    tr: "Verilerin tehlikede olduğunu fark edersen — örneğin açık bir bilgisayar, yerde kalan kimlikler veya dosyalar — bunu hemen amirine bildirmen gerekir. Akıllı telefonunla böyle durumların fotoğrafını çekme — kanıt olarak bile olsa. Veri ihlali yüksek para cezalarına yol açabilir.",
    ro: "Dacă observi că datele sunt în pericol — de exemplu un PC deschis, acte de identitate sau dosare rămase pe podea — trebuie raportat imediat superiorului. Nu face fotografii ale unor astfel de situații cu smartphone-ul, nici măcar ca dovadă. O scurgere de date poate duce la amenzi mari.",
    sr: "Ako primijetiš da su podaci u opasnosti — npr. otvoren PC, ostavljene lične karte ili spisi na podu — to se mora odmah prijaviti nadređenom. Ne snimi takve situacije pametnim telefonom, čak ni kao dokaz. Povreda podataka može dovesti do visokih novčanih kazni.",
    pl: "Jeśli zauważysz, że dane są zagrożone — na przykład otwarty komputer, pozostawione dowody osobiste lub akta na podłodze — należy to natychmiast zgłosić przełożonemu. Nie fotografuj takich sytuacji smartfonem, nawet jako dowód. Wyciek danych może prowadzić do wysokich kar finansowych.",
    en: "If you notice that data is at risk — for example an open PC, identity documents or files left on the floor — this must be reported to your supervisor immediately. Do not photograph such situations with your smartphone, not even as evidence. A data breach can lead to heavy fines.",
    ar: "إذا لاحظت أن البيانات في خطر — مثل حاسوب مفتوح أو بطاقات هوية أو ملفات متروكة على الأرض — يجب الإبلاغ عن ذلك فوراً للمشرف. لا تُصور مثل هذه المواقف بهاتفك الذكي، حتى ولو كان كدليل. يمكن أن يؤدي اختراق البيانات إلى غرامات مالية باهظة."
  },
  kap_21: {
    de: "Im Kundenobjekt gilt: keine Fotos im Objekt, keine fremden Dokumente lesen, keine Daten weitergeben. Du darfst keine persönlichen Informationen der Bewohner oder Mitarbeiter nutzen oder weitergeben — weder mündlich noch schriftlich. Wer dagegen verstößt, riskiert Abmahnung, Kündigung oder rechtliche Konsequenzen.",
    tr: "Müşteri binasında: binada fotoğraf çekme, başkalarının belgelerini okuma, veri paylaşma. Sakinlerin veya çalışanların kişisel bilgilerini kullanamaz veya paylaşamazsın — ne sözlü ne yazılı. Buna uymayan kişi uyarı, işten çıkarma veya hukuki sonuçlarla karşılaşır.",
    ro: "La obiectivul clientului: nicio fotografie în obiectiv, nicio citire a documentelor altora, nicio transmitere de date. Nu ai voie să folosești sau să transmiți informații personale ale locatarilor sau angajaților — nici verbal, nici în scris. Cine încalcă aceasta riscă avertisment, concediere sau consecințe juridice.",
    sr: "U objektu klijenta vrijedi: nema fotografiranja u objektu, ne čitaj tuđe dokumente, ne dijeli podatke. Ne smiješ koristiti ni prosljeđivati osobne informacije stanara ili zaposlenika — ni usmeno ni pismeno. Ko to prekrši, riskira opomenu, otkaz ili pravne posljedice.",
    pl: "W obiekcie klienta obowiązuje: nie robić zdjęć w obiekcie, nie czytać cudzych dokumentów, nie przekazywać danych. Nie wolno ci używać ani przekazywać danych osobowych mieszkańców lub pracowników — ani ustnie ani pisemnie. Kto naruszy te zasady, ryzykuje ostrzeżenie, zwolnienie lub konsekwencje prawne.",
    en: "In the customer's premises: no photos in the building, do not read other people's documents, do not share data. You must not use or pass on personal information of residents or employees — neither verbally nor in writing. Anyone who violates this risks a warning, dismissal or legal consequences.",
    ar: "في موقع العميل: لا تلتقط صوراً في المبنى، لا تقرأ وثائق الآخرين، لا تشارك البيانات. لا يجوز لك استخدام المعلومات الشخصية للمقيمين أو الموظفين أو نقلها — لا شفهياً ولا كتابياً. من يخالف ذلك يخاطر بالإنذار أو الفصل أو العواقب القانونية."
  },
  kap_22: {
    de: "Du darfst die Arbeit nicht unter Einfluss von Alkohol, Drogen oder Cannabis antreten — das gefährdet dich selbst und andere. Wenn du Medikamente nimmst, die deine Reaktionsfähigkeit beeinflussen, musst du das dem Vorgesetzten melden. Verstöße können zur fristlosen Kündigung führen.",
    tr: "Alkol, uyuşturucu veya esrar etkisi altında işe başlayamazsın — bu hem seni hem başkalarını tehlikeye atar. Tepki yeteneğini etkileyen ilaçlar alıyorsan, bunu amirlerine bildirmen gerekir. İhlaller derhal feshe yol açabilir.",
    ro: "Nu poți începe munca sub influența alcoolului, drogurilor sau canabisului — aceasta te pune pe tine și pe alții în pericol. Dacă iei medicamente care îți afectează capacitatea de reacție, trebuie să îi informezi superiorul. Încălcările pot duce la concediere imediată.",
    sr: "Ne smiješ početi rad pod utjecajem alkohola, droga ili kanabisa — to ugrožava tebe i druge. Ako uzimate lijekove koji utječu na tvoju sposobnost reakcije, moraš to prijaviti nadređenom. Kršenja mogu dovesti do trenutnog otkaza.",
    pl: "Nie możesz przystąpić do pracy pod wpływem alkoholu, narkotyków lub konopi — zagraża to tobie i innym. Jeśli przyjmujesz leki wpływające na twoją zdolność reagowania, musisz poinformować o tym przełożonego. Naruszenia mogą prowadzić do natychmiastowego zwolnienia.",
    en: "You must not start work under the influence of alcohol, drugs or cannabis — this puts yourself and others at risk. If you take medication that affects your reaction capacity, you must inform your supervisor. Violations can lead to instant dismissal.",
    ar: "لا يجوز لك البدء في العمل تحت تأثير الكحول أو المخدرات أو الحشيش — فهذا يُعرّضك أنت والآخرين للخطر. إذا كنت تتناول أدوية تؤثر على قدرة التفاعل لديك يجب إبلاغ مشرفك. يمكن أن تؤدي المخالفات إلى الفصل الفوري من العمل."  },
  // ── Säule D: Das 4-Farben-System ──────────────────────────────────────────
  kap_23: {
    de: "Das 4-Farben-System ist ein international anerkannter Hygienestandard: Jede Farbe steht für eine bestimmte Zone. 🔴 Rot = WC und Hochrisikobereich. 🟡 Gelb = Waschbecken und allgemeiner Sanitärbereich. 🟢 Grün = Küche und Lebensmittelbereiche. 🔵 Blau = Schreibtische, Türen und allgemeine Oberflächen. Mischst du Tücher aus verschiedenen Zonen, überträgst du Keime — das nennt man Kreuzkontamination. Das System verhindert genau das.",
    tr: "4 renk sistemi uluslararası kabul görmüş bir hijyen standardıdır: Her renk belirli bir bölgeyi temsil eder. 🔴 Kırmızı = Tuvalet ve yüksek risk alanı. 🟡 Sarı = Lavabo ve genel banyo alanı. 🟢 Yeşil = Mutfak ve gıda alanları. 🔵 Mavi = Masalar, kapılar ve genel yüzeyler. Farklı bölgelerden bezleri karıştırırsanız mikrop bulaştırırsınız — buna çapraz kontaminasyon denir. Sistem tam olarak bunu önler.",
    ro: "Sistemul cu 4 culori este un standard de igienă recunoscut internațional: fiecare culoare reprezintă o anumită zonă. 🔴 Roșu = toaletă și zona de risc înalt. 🟡 Galben = chiuvetă și zona sanitară generală. 🟢 Verde = bucătărie și zone alimentare. 🔵 Albastru = birouri, uși și suprafețe generale. Dacă amesteci cârpe din zone diferite, transmiți germeni — asta se numește contaminare încrucișată. Sistemul previne exact asta.",
    sr: "Sistem od 4 boje je međunarodno priznat higijenski standard: svaka boja predstavlja određenu zonu. 🔴 Crvena = WC i zona visokog rizika. 🟡 Žuta = lavabo i opšta kupatilska zona. 🟢 Zelena = kuhinja i zone hrane. 🔵 Plava = stolovi, vrata i opšte površine. Ako miješaš krpe iz različitih zona, prenosiš klice — to se zove unakrsna kontaminacija. Sistem upravo to sprečava.",
    pl: "System 4 kolorów to międzynarodowo uznany standard higieny: każdy kolor oznacza określoną strefę. 🔴 Czerwony = toaleta i strefa wysokiego ryzyka. 🟡 Żółty = umywalka i ogólna strefa sanitarna. 🟢 Zielony = kuchnia i strefy żywnościowe. 🔵 Niebieski = biurka, drzwi i ogólne powierzchnie. Jeśli mieszasz ściereczki z różnych stref, przenosisz drobnoustroje — to nazywa się skażeniem krzyżowym. System dokładnie temu zapobiega.",
    en: "The 4-colour system is an internationally recognised hygiene standard: each colour represents a specific zone. 🔴 Red = toilet and high-risk area. 🟡 Yellow = washbasin and general sanitary area. 🟢 Green = kitchen and food areas. 🔵 Blue = desks, doors and general surfaces. If you mix cloths from different zones, you transfer germs — this is called cross-contamination. The system prevents exactly that.",
    ar: "نظام الألوان الأربعة هو معيار نظافة معترف به دولياً: كل لون يمثل منطقة محددة. 🔴 أحمر = المرحاض ومنطقة عالية الخطورة. 🟡 أصفر = الحوض ومنطقة الصرف الصحي العامة. 🟢 أخضر = المطبخ ومناطق الأغذية. 🔵 أزرق = المكاتب والأبواب والأسطح العامة. إذا خلطت القماشات من مناطق مختلفة فأنت تنقل الجراثيم — يُسمى هذا التلوث المتقاطع. النظام يمنع ذلك تماماً."
  },
  kap_24: {
    de: "🔴 Rote Tücher sind ausschließlich für WC, Urinale, Bidets und den direkten Spritzbereich. Diese Zone hat die höchste Keimbelastung — daher gilt: Ein Tuch = Ein Sanitärobjekt. Danach kommt das Tuch sofort in die Wäsche — niemals zurück in den Eimer tauchen! Wäsche bei mindestens 95 °C um Keime sicher abzutöten. Rote Tücher dürfen NIEMALS in einer anderen Zone verwendet werden.",
    tr: "🔴 Kırmızı bezler yalnızca tuvalet, pisuar, bide ve doğrudan sıçrama alanı içindir. Bu bölgede en yüksek mikrop yoğunluğu vardır — bu nedenle kural: Bir bez = Bir sanitasyon nesnesi. Bundan sonra bez derhal çamaşıra gider — kovaya asla geri daldırmayın! Mikroorganizmaları güvenli şekilde öldürmek için en az 95 °C'de yıkayın. Kırmızı bezler başka bir bölgede ASLA kullanılmamalıdır.",
    ro: "🔴 Cârpele roșii sunt exclusiv pentru toalete, pisoare, bidete și zona de stropi directă. Această zonă are cea mai mare încărcare de germeni — de aceea regula este: o cârpă = un obiect sanitar. Apoi cârpa merge imediat la spălat — niciodată nu o scufundați înapoi în găleată! Spălați la minimum 95 °C pentru a ucide sigur germenii. Cârpele roșii nu trebuie NICIODATĂ utilizate în altă zonă.",
    sr: "🔴 Crvene krpe su isključivo za WC, pisoare, bidee i direktnu zonu prskanja. Ova zona ima najveće opterećenje klicama — stoga vrijedi: Jedna krpa = Jedan sanitarni predmet. Zatim krpa odmah ide u pranje — nikad je ne uranjajte natrag u kantu! Perite na najmanje 95 °C da sigurno uništite klice. Crvene krpe se NIKAD ne smiju koristiti u drugoj zoni.",
    pl: "🔴 Czerwone ściereczki przeznaczone są wyłącznie do toalet, pisuarów, bidetów i bezpośredniej strefy zachlapań. Ta strefa ma największe obciążenie drobnoustrojami — dlatego obowiązuje zasada: jedna ściereczka = jeden obiekt sanitarny. Następnie ściereczka idzie od razu do prania — nigdy nie zanurzaj jej z powrotem w wiaderku! Pranie w temperaturze co najmniej 95 °C, aby bezpiecznie zabić drobnoustroje. Czerwonych ściereczek NIGDY nie wolno używać w innej strefie.",
    en: "🔴 Red cloths are exclusively for toilets, urinals, bidets and the direct splash zone. This zone has the highest germ load — so the rule is: one cloth = one sanitary object. Then the cloth goes straight into the wash — never dip it back into the bucket! Wash at a minimum of 95 °C to safely kill germs. Red cloths must NEVER be used in any other zone.",
    ar: "🔴 القماشات الحمراء مخصصة حصرياً للمراحيض والبوالات وأحواض الغسيل ومنطقة الرذاذ المباشرة. هذه المنطقة تحمل أعلى تلوث بالجراثيم — لذا القاعدة: قماشة واحدة = جسم صرف صحي واحد. بعد ذلك تذهب القماشة مباشرة للغسيل — لا تغمسها أبداً في الدلو مرة أخرى! اغسل بدرجة حرارة لا تقل عن 95 °C لقتل الجراثيم بأمان. القماشات الحمراء يجب أن لا تُستخدم أبداً في أي منطقة أخرى."
  },
  kap_25: {
    de: "🟡 Gelbe Tücher sind für Waschbecken, Armaturen, Duschen, Spiegel und Fliesen außerhalb der WC-Spritzzone. Warum eine eigene Farbe? Weil Fäkal- und Urinreste vom WC (rot) nicht auf das Waschbecken übertragen werden dürfen — dort waschen sich Menschen das Gesicht. Die Trennung schützt vor unsichtbarer Kreuzkontamination. Wäsche bei 60 °C bis 95 °C.",
    tr: "🟡 Sarı bezler lavabolar, musluklar, duşlar, aynalar ve WC sıçrama alanı dışındaki fayanslar içindir. Neden ayrı bir renk? Çünkü WC'den (kırmızı) gelen dışkı ve idrar kalıntıları lavaboya taşınamaz — insanlar orada yüzlerini yıkıyorlar. Ayırma görünmez çapraz kontaminasyondan korur. 60 °C ila 95 °C'de yıkayın.",
    ro: "🟡 Cârpele galbene sunt pentru chiuvete, robinete, dușuri, oglinzi și gresie din afara zonei de stropi WC. De ce o culoare separată? Deoarece resturile fecale și de urină din WC (roșu) nu trebuie transferate pe chiuvetă — acolo oamenii se spală pe față. Separarea protejează de contaminarea încrucișată invizibilă. Spălați la 60 °C până la 95 °C.",
    sr: "🟡 Žute krpe su za lavaboe, slavine, tuševe, ogledala i pločice izvan zone prskanja WC-a. Zašto posebna boja? Jer se fekalne i ostatke urina iz WC-a (crveno) ne smiju prenijeti na lavabo — tamo se ljudi peru po licu. Odvajanje štiti od nevidljive unakrsne kontaminacije. Perite na 60 °C do 95 °C.",
    pl: "🟡 Żółte ściereczki służą do umywalek, kranów, pryszniców, luster i płytek poza strefą zachlapań toalety. Dlaczego osobny kolor? Ponieważ resztki kałowe i moczu z toalety (czerwony) nie mogą być przenoszone na umywalkę — tam ludzie myją sobie twarz. Rozdzielenie chroni przed niewidocznym skażeniem krzyżowym. Pranie w temperaturze 60 °C do 95 °C.",
    en: "🟡 Yellow cloths are for washbasins, taps, showers, mirrors and tiles outside the toilet splash zone. Why a separate colour? Because faecal and urine residues from the toilet (red) must not be transferred to the washbasin — people wash their faces there. Separation protects against invisible cross-contamination. Wash at 60 °C to 95 °C.",
    ar: "🟡 القماشات الصفراء مخصصة لأحواض الغسيل والحنفيات والدشات والمرايا والبلاط خارج منطقة رذاذ المرحاض. لماذا لون منفصل؟ لأن بقايا البراز والبول من المرحاض (أحمر) يجب ألا تنتقل إلى حوض الغسيل — الناس يغسلون وجوههم هناك. الفصل يحمي من التلوث المتقاطع غير المرئي. اغسل بدرجة حرارة 60 °C إلى 95 °C."
  },
  kap_26: {
    de: "🟢 Grüne Tücher sind für Küchen, Arbeitsflächen, Schneidebretter, Kühlschränke und Pflegebereiche. Hier hat die Lebensmittelsicherheit (HACCP) höchste Priorität. Ein Küchentuch darf NIEMALS mit Sanitärtextilien in Berührung kommen — das wäre ein schwerwiegender HACCP-Verstoß. Strenge Trennung von allen anderen Zonen ist Pflicht. Wäsche zwingend bei 95 °C.",
    tr: "🟢 Yeşil bezler mutfaklar, tezgahlar, kesme tahtaları, buzdolapları ve bakım alanları içindir. Burada gıda güvenliği (HACCP) en yüksek önceliğe sahiptir. Bir mutfak bezi ASLA sanitasyon tekstilleriyle temas etmemeli — bu ciddi bir HACCP ihlali olur. Diğer tüm bölgelerden sıkı ayrım zorunludur. Yıkama zorunlu olarak 95 °C'de yapılmalıdır.",
    ro: "🟢 Cârpele verzi sunt pentru bucătării, suprafețe de lucru, tocătoare, frigidere și zone de îngrijire. Aici siguranța alimentară (HACCP) are prioritate maximă. O cârpă de bucătărie nu trebuie NICIODATĂ să atingă textile sanitare — acesta ar fi o încălcare gravă a HACCP. Separarea strictă de toate celelalte zone este obligatorie. Spălați obligatoriu la 95 °C.",
    sr: "🟢 Zelene krpe su za kuhinje, radne površine, daske za rezanje, frižidere i zone njege. Ovdje sigurnost hrane (HACCP) ima najviši prioritet. Kuhinjska krpa NIKAD ne smije doći u kontakt s sanitarnim tekstilom — to bi bio ozbiljan prekršaj HACCP-a. Stroga odvojenost od svih ostalih zona je obavezna. Pranje obavezno na 95 °C.",
    pl: "🟢 Zielone ściereczki przeznaczone są do kuchni, blatów, desek do krojenia, lodówek i stref pielęgnacji. Tu bezpieczeństwo żywności (HACCP) ma najwyższy priorytet. Ściereczka kuchenna NIGDY nie może stykać się z tekstyliami sanitarnymi — byłoby to poważne naruszenie HACCP. Ścisłe oddzielenie od wszystkich innych stref jest obowiązkowe. Pranie obowiązkowo w 95 °C.",
    en: "🟢 Green cloths are for kitchens, work surfaces, chopping boards, refrigerators and care areas. Here food safety (HACCP) has the highest priority. A kitchen cloth must NEVER come into contact with sanitary textiles — that would be a serious HACCP violation. Strict separation from all other zones is mandatory. Wash obligatorily at 95 °C.",
    ar: "🟢 القماشات الخضراء مخصصة للمطابخ وأسطح العمل وألواح التقطيع والثلاجات ومناطق الرعاية. هنا سلامة الغذاء (HACCP) لها الأولوية القصوى. يجب أن لا تلامس قماشة المطبخ أبداً مواد نسيجية صحية — سيكون ذلك انتهاكاً خطيراً لـ HACCP. الفصل الصارم عن جميع المناطق الأخرى إلزامي. غسيل إلزامي عند 95 °C."
  },
  kap_27: {
    de: "🔵 Blaue Tücher sind für allgemeine Oberflächen: Schreibtische, Stühle, Türen, Heizkörper, Regale, Fensterbänke. Diese Zone hat die geringste Keimbelastung — einfache Unterhaltsreinigung und Staubwischen. Trotzdem gilt: Blaue Tücher NICHT in Sanitärbereichen oder der Küche verwenden. In der Praxis benötigst du die meisten blauen Tücher — plane genug ein. Wäsche bei 60 °C.",
    tr: "🔵 Mavi bezler genel yüzeyler içindir: masalar, sandalyeler, kapılar, radyatörler, raflar, pencere eşikleri. Bu bölgede mikrop yoğunluğu en azdır — basit süpürme ve toz alma. Yine de kural geçerlidir: Mavi bezleri banyo veya mutfak alanlarında KULLANMAYIN. Pratikte en fazla mavi bez ihtiyacınız olur — yeterli stok planlayın. 60 °C'de yıkayın.",
    ro: "🔵 Cârpele albastre sunt pentru suprafețe generale: birouri, scaune, uși, calorifere, rafturi, pervaze. Această zonă are cea mai mică încărcare de germeni — curățenie ușoară de întreținere și ștergerea prafului. Totuși regula se aplică: nu folosiți cârpele albastre în zone sanitare sau bucătărie. În practică aveți nevoie de cele mai multe cârpe albastre — planificați suficient stoc. Spălați la 60 °C.",
    sr: "🔵 Plave krpe su za opšte površine: stolove, stolice, vrata, radijatore, police, prozorske klupice. Ova zona ima najmanje opterećenje klicama — jednostavno čišćenje i brisanje prašine. Ipak pravilo važi: Plave krpe NE koristiti u kupatilskim ili kuhinjskim zonama. U praksi vam trebaju najviše plave krpe — planujte dovoljno zaliha. Perite na 60 °C.",
    pl: "🔵 Niebieskie ściereczki służą do ogólnych powierzchni: biurek, krzeseł, drzwi, grzejników, półek, parapetów. Ta strefa ma najmniejsze obciążenie drobnoustrojami — proste sprzątanie bieżące i ścieranie kurzu. Mimo to obowiązuje zasada: nie używaj niebieskich ściereczek w strefach sanitarnych ani w kuchni. W praktyce potrzebujesz najwięcej niebieskich ściereczek — zaplanuj wystarczający zapas. Pranie w 60 °C.",
    en: "🔵 Blue cloths are for general surfaces: desks, chairs, doors, radiators, shelves, window sills. This zone has the lowest germ load — simple routine cleaning and dusting. Nevertheless the rule applies: do NOT use blue cloths in sanitary areas or the kitchen. In practice you need the most blue cloths — plan enough stock. Wash at 60 °C.",
    ar: "🔵 القماشات الزرقاء مخصصة للأسطح العامة: المكاتب والكراسي والأبواب والمشعات والأرفف وأعتاب النوافذ. هذه المنطقة تحمل أقل تلوث بالجراثيم — تنظيف روتيني بسيط وإزالة الغبار. ومع ذلك تطبق القاعدة: لا تستخدم القماشات الزرقاء في المناطق الصحية أو المطبخ. في الممارسة العملية تحتاج إلى أكثر القماشات الزرقاء — خطط لمخزون كافٍ. اغسل عند 60 °C."
  },
  kap_28: {
    de: "Das Schloss-Prinzip: Rotes Tuch → Roter Deckel (saure Chemie) → Roter Eimer. Die Farbe des Tuchs und die Farbe der Flasche müssen übereinstimmen — so landet immer die richtige Chemie auf der richtigen Fläche, ohne tiefes Fachwissen. pH-Codierung: Rot (sauer) gegen Kalk und Urinstein. Grün (neutral) für tägliche Reinigung, schont Holz und Lack. Blau (alkalisch) gegen Fett und organische Verschmutzungen. ACHTUNG: Saure (rot) und alkalische (blau) Reiniger NIEMALS mischen — das ist lebensgefährlich!",
    tr: "Kilit prensibi: Kırmızı bez → Kırmızı kapak (asidik kimyasal) → Kırmızı kova. Bezin rengi ve şişenin rengi eşleşmelidir — böylece her zaman doğru kimyasal doğru yüzeye gelir, derin uzmanlık bilgisi gerekmez. pH kodlaması: Kırmızı (asidik) kireç ve idrar taşına karşı. Yeşil (nötr) günlük temizlik için, ahşap ve lake korur. Mavi (alkalin) yağa ve organik kirlere karşı. DİKKAT: Asidik (kırmızı) ve alkalin (mavi) temizleyicileri ASLA karıştırmayın!",
    ro: "Principiul lacătului: cârpă roșie → capac roșu (chimical acid) → găleată roșie. Culoarea cârpei și culoarea sticlei trebuie să se potrivească. Codificarea pH: roșu (acid) împotriva calcarului. Verde (neutru) pentru curățenie zilnică. Albastru (alcalin) împotriva grăsimilor. ATENȚIE: Nu amestecați NICIODATĂ agenți de curățare acizi cu alcalini — pericol de viață!",
    sr: "Princip brave: Crvena krpa → Crveni poklopac (kisela hemija) → Crvena kanta. Boja krpe i boja boce moraju se podudarati. pH kodiranje: Crvena (kisela) protiv kamenca. Zelena (neutralna) za svakodnevno čišćenje. Plava (alkalna) protiv masnoće. PAŽNJA: Kisele i alkalne čistioce NIKAD ne miješajte — opasnost po život!",
    pl: "Zasada zamka: Czerwona ściereczka → Czerwona nakrętka (chemia kwaśna) → Czerwone wiadro. Kolor ściereczki i kolor butelki muszą się zgadzać. Kodowanie pH: czerwony (kwasowy) przeciw kamieniowi. Zielony (neutralny) do codziennego sprzątania. Niebieski (zasadowy) przeciw tłuszczom. UWAGA: kwaśnych i zasadowych środków NIGDY nie mieszaj — niebezpieczne dla życia!",
    en: "The lock principle: red cloth → red cap (acidic chemical) → red bucket. The colour of the cloth and bottle must match. pH coding: red (acidic) against limescale. Green (neutral) for daily cleaning. Blue (alkaline) against grease. WARNING: NEVER mix acidic (red) and alkaline (blue) cleaners — life-threatening!",
    ar: "مبدأ القفل: قماشة حمراء ← غطاء أحمر ← دلو أحمر. يجب تطابق اللون مع الزجاجة. ترميز pH: أحمر ضد الكلس، أخضر للتنظيف اليومي، أزرق ضد الدهون. تحذير: لا تخلط أبداً المنظفات الحمضية مع القلوية — خطر على الحياة!"
  },
  kap_29: {
    de: "Die Wechseltuch-Methode: Ein Tuch = Ein Sanitärobjekt — danach sofort in die Wäsche, kein Zurücktauchen in die Lösung. Pflicht in Kliniken, Pflegeeinrichtungen und Sanitäranlagen (RKI-Richtlinien). Die 16-Seiten-Falttechnik: Tuch zweimal falten ergibt 16 saubere Flächen. Für jede neue Oberfläche eine frische Seite — spart Wasser und maximiert Keimfreiheit. Waschprotokoll: 🔴🟢 bei 95 °C, 🟡🔵 bei 60 °C. NIEMALS Weichspüler — er verklebt die Mikrofasern! Trockner empfohlen — die Hitze ist ein zusätzlicher Hygieneschritt.",
    tr: "Değiştirme bezi yöntemi: Bir bez = Bir sanitasyon nesnesi — sonra hemen çamaşıra, solüsyona geri daldırmayın. Klinikler ve bakım tesislerinde zorunludur. 16 yüz katlama: Bezi iki kez katlamak 16 temiz yüzey verir. Yıkama: 🔴🟢 95°C, 🟡🔵 60°C. ASLA yumuşatıcı kullanmayın — mikrofiberleri yapıştırır!",
    ro: "Metoda schimbării cârpei: o cârpă = un obiect sanitar — apoi direct la spălat. Obligatorie în clinici. Tehnica de pliere în 16 fețe: plierea cârpei de două ori dă 16 suprafețe curate. Protocol de spălare: 🔴🟢 la 95°C, 🟡🔵 la 60°C. NICIODATĂ balsam de rufe — lipește microfibra!",
    sr: "Metoda izmjene krpe: Jedna krpa = Jedan sanitarni predmet — zatim odmah u pranje. Obavezno u klinikama. Tehnika 16 strana: Dvostruko savijanje daje 16 čistih površina. Protokol pranja: 🔴🟢 95°C, 🟡🔵 60°C. NIKAD omekšivač — lijepi mikrovlakna!",
    pl: "Metoda wymiany ściereczki: jedna ściereczka = jeden obiekt sanitarny — potem od razu do prania. Obowiązkowe w klinikach. Technika 16 stron: Złożenie dwa razy daje 16 czystych powierzchni. Protokół prania: 🔴🟢 w 95°C, 🟡🔵 w 60°C. NIGDY płynu do płukania — skleja mikrowłókna!",
    en: "The cloth-change method: one cloth = one sanitary object — straight into the wash, no dipping back. Mandatory in clinics (RKI guidelines). 16-face folding technique: folding twice gives 16 clean surfaces. Washing protocol: 🔴🟢 at 95°C, 🟡🔵 at 60°C. NEVER fabric softener — it clogs the microfibres! Tumble dryer recommended.",
    ar: "طريقة تبديل القماشة: قماشة واحدة = جسم صرف صحي واحد — مباشرة للغسيل. إلزامية في العيادات. تقنية الطي على 16 وجهاً: الطي مرتين يعطي 16 سطحاً نظيفاً. بروتوكول الغسيل: 🔴🟢 عند 95°C، 🟡🔵 عند 60°C. لا تستخدم أبداً منعم القماش!"
  }
};

// ── UTILS ────────────────────────────────────────────────────
function now()     { return new Date().toISOString(); }
// Löst User-ID auf lesbare Name auf (für PDFs, Archiv etc.)
// Nur innerhalb desselben Tenants — verhindert Cross-Tenant-Datenlecks
function userNameVonId(userId, tenantId) {
  if (!userId) return '–';
  const u = APP_USERS.find(u => u.id === userId && u.tenant_id === tenantId);
  return u ? u.name : userId; // Fallback: ID anzeigen wenn User nicht gefunden
}
function dateStr(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
function datumStr(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── SHA-256 (mit Fallback für HTTP/unsichere Kontexte) ────────
async function sha256(text) {
  // crypto.subtle nur über HTTPS verfügbar
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  }
  // Fallback: Pure-JS SHA-256 (für HTTP-Kontext)
  return sha256PureJS(text);
}

function sha256PureJS(str) {
  // RFC 6234 SHA-256 in reinem JavaScript
  function rightRotate(v,a){return(v>>>a)|(v<<(32-a));}
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const msg=unescape(encodeURIComponent(str));
  const bytes=[];
  for(let i=0;i<msg.length;i++) bytes.push(msg.charCodeAt(i));
  bytes.push(0x80);
  while(bytes.length%64!==56) bytes.push(0);
  const bitLen=msg.length*8;
  for(let i=7;i>=0;i--) bytes.push((bitLen/Math.pow(2,i*8))&0xff);
  for(let c=0;c<bytes.length;c+=64){
    const w=[];
    for(let i=0;i<16;i++) w[i]=(bytes[c+i*4]<<24)|(bytes[c+i*4+1]<<16)|(bytes[c+i*4+2]<<8)|bytes[c+i*4+3];
    for(let i=16;i<64;i++){const s0=(rightRotate(w[i-15],7)^rightRotate(w[i-15],18)^(w[i-15]>>>3));const s1=(rightRotate(w[i-2],17)^rightRotate(w[i-2],19)^(w[i-2]>>>10));w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;}
    let [a,b,c2,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){const S1=(rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25));const ch=(e&f)^(~e&g);const tmp1=(h+S1+ch+K[i]+w[i])>>>0;const S0=(rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22));const maj=(a&b)^(a&c2)^(b&c2);const tmp2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+tmp1)>>>0;d=c2;c2=b;b=a;a=(tmp1+tmp2)>>>0;}
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c2)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  return H.map(v=>v.toString(16).padStart(8,'0')).join('');
}

// ── Passwort-Hashing mit bcrypt (DSGVO-konform) ──────────────
const BCRYPT_ROUNDS = 10;

function bcryptVerfuegbar() {
  try { return typeof dcodeIO !== 'undefined' && dcodeIO.bcrypt; } catch(e) { return false; }
}

async function hashPasswort(text) {
  if (bcryptVerfuegbar()) {
    return new Promise(resolve => setTimeout(() => {
      resolve(dcodeIO.bcrypt.hashSync(text, BCRYPT_ROUNDS));
    }, 0));
  }
  // Fallback: SHA-256
  return sha256(text);
}

async function verifyPasswort(text, hash) {
  // bcrypt-Hash erkennen ($2a$, $2b$)
  if (hash && hash.startsWith('$2') && bcryptVerfuegbar()) {
    return new Promise(resolve => setTimeout(() => {
      resolve(dcodeIO.bcrypt.compareSync(text, hash));
    }, 0));
  }
  // Legacy SHA-256
  return (await sha256(text)) === hash;
}

// ── Datenschutz-Modal ────────────────────────────────────────
function zeigeDS() {
  document.getElementById('ds-modal').style.display = 'block';
}

// ── Impressum-Modal ──────────────────────────────────────────
function zeigeImpressum() {
  document.getElementById('impressum-modal').style.display = 'flex';
}

// ── Cookie-Consent ───────────────────────────────────────────
function cookieAkzeptieren() {
  localStorage.setItem('schulung_cookie_consent', '1');
  document.getElementById('cookie-banner').style.display = 'none';
}

function pruefeCookieConsent() {
  if (!localStorage.getItem('schulung_cookie_consent')) {
    document.getElementById('cookie-banner').style.display = 'block';
  }
}

// ══════════════════════════════════════════════════════════════
//  SESSION-TIMEOUT (8h Inaktivität)
// ══════════════════════════════════════════════════════════════
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (!currentUser) return;
  inactivityTimer = setTimeout(() => {
    showToast('⏰ Sie wurden wegen Inaktivität abgemeldet.', '#6b7280');
    setTimeout(doLogout, 2000);
  }, INACTIVITY_MINUTES * 60 * 1000);
  // Ablaufzeit in Session speichern
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (s) { s.expires = Date.now() + SESSION_HOURS * 3600 * 1000; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  } catch(e) {}
}
function startInactivityWatcher() {
  ['click','keydown','touchstart','scroll','mousemove'].forEach(ev =>
    document.addEventListener(ev, resetInactivityTimer, { passive: true })
  );
  resetInactivityTimer();
}

// ══════════════════════════════════════════════════════════════
//  DARK MODE
// ══════════════════════════════════════════════════════════════
function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('schulung_darkmode', isDark ? '1' : '0');
  updateDarkModeBtn();
}
function updateDarkModeBtn() {
  const isDark = document.body.classList.contains('dark-mode');
  document.querySelectorAll('.dark-mode-btn').forEach(btn => {
    btn.textContent = isDark ? '☀️' : '🌙';
    btn.title = isDark ? 'Helles Design' : 'Dunkles Design';
  });
}
function initDarkMode() {
  if (localStorage.getItem('schulung_darkmode') === '1') {
    document.body.classList.add('dark-mode');
  }
  updateDarkModeBtn();
}

// ══════════════════════════════════════════════════════════════
//  PASSWORT VERGESSEN / RESET
// ══════════════════════════════════════════════════════════════
function zeigePwReset() {
  document.getElementById('pw-reset-modal').style.display = 'flex';
  document.getElementById('pw-reset-email').value = document.getElementById('login-email').value || '';
  document.getElementById('pw-reset-msg').textContent = '';
}
function schliessePwReset() {
  document.getElementById('pw-reset-modal').style.display = 'none';
}
async function pwResetAnfordern() {
  const email  = document.getElementById('pw-reset-email').value.trim().toLowerCase();
  const msgEl  = document.getElementById('pw-reset-msg');
  const btn    = document.getElementById('pw-reset-btn');
  msgEl.textContent = '';
  if (!email) { msgEl.style.color='#dc2626'; msgEl.textContent='Bitte E-Mail eingeben.'; return; }

  btn.disabled = true; btn.textContent = '⏳ …';
  try {
    const users = await SB.get('users', `email=eq.${encodeURIComponent(email)}`);
    // Immer gleiche Meldung (Sicherheit: kein User-Enumeration)
    if (users.length) {
      // Token generieren und speichern
      const arr = new Uint8Array(24);
      crypto.getRandomValues(arr);
      const token = Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
      const gueltigBis = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2h gültig
      const userId = users[0].id;
      // Token in reset_tokens-Tabelle (oder als einladung mit besonderem Typ)
      await SB.upsert('pw_reset_tokens', {
        id: 'pwreset_' + Date.now(),
        user_id: userId,
        token,
        gueltig_bis: gueltigBis,
        genutzt: false
      });
      // Reset-Link anzeigen (in echter Prod: per E-Mail senden)
      const baseUrl = window.location.href.split('?')[0].split('#')[0].replace(/^http:\/\//i, 'https://');
      const link = `${baseUrl}?pwreset=${token}`;
      msgEl.style.color = '#16a34a';
      msgEl.innerHTML = `✅ Reset-Link generiert (2h gültig):<br>
        <textarea style="width:100%;font-size:.72rem;margin-top:6px;padding:6px;border-radius:6px;border:1px solid #d1d5db;resize:none" rows="2" readonly>${link}</textarea>
        <button class="btn btn-outline btn-sm" style="margin-top:4px" onclick="navigator.clipboard.writeText('${link}').then(()=>showToast('✅ Link kopiert!'))">📋 Kopieren</button>
        <div style="font-size:.72rem;color:#6b7280;margin-top:4px">⚠️ Diesen Link per E-Mail oder WhatsApp an den Nutzer senden.</div>`;
    } else {
      msgEl.style.color = '#16a34a';
      msgEl.textContent = '✅ Falls die E-Mail bekannt ist, wurde ein Link generiert.';
    }
  } catch(e) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = 'Fehler: ' + e.message;
  }
  btn.disabled = false; btn.textContent = '🔑 Link generieren';
}
async function pruefePasswordResetToken() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('pwreset');
  if (!token) return false;

  try {
    const res = await SB.get('pw_reset_tokens', `token=eq.${token}`);
    if (!res.length) { alert('Ungültiger oder abgelaufener Reset-Link.'); return false; }
    const rec = res[0];
    if (rec.genutzt || new Date(rec.gueltig_bis) < new Date()) {
      alert('Dieser Reset-Link ist bereits abgelaufen oder wurde verwendet.'); return false;
    }
    // Neues Passwort eingeben
    const newPw = prompt('Neues Passwort eingeben (min. 8 Zeichen):');
    if (!newPw || newPw.length < 8) { alert('Passwort zu kurz.'); return false; }
    const hash = await hashPasswort(newPw);
    await SB.patch('users', `id=eq.${rec.user_id}`, { password_hash: hash });
    await SB.patch('pw_reset_tokens', `id=eq.${rec.id}`, { genutzt: true });
    // URL säubern
    window.history.replaceState({}, '', window.location.pathname);
    alert('✅ Passwort erfolgreich geändert! Sie können sich jetzt anmelden.');
    return false; // Normalen Login-Flow starten
  } catch(e) {
    alert('Fehler beim Passwort-Reset: ' + e.message);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
//  PASSWORT ÄNDERN (für eingeloggte Nutzer)
// ══════════════════════════════════════════════════════════════
function zeigePwAendern() {
  document.getElementById('pw-aendern-modal').style.display = 'flex';
  document.getElementById('pw-alt').value = '';
  document.getElementById('pw-neu').value = '';
  document.getElementById('pw-neu2').value = '';
  document.getElementById('pw-aendern-msg').textContent = '';
}
function schliessePwAendern() {
  document.getElementById('pw-aendern-modal').style.display = 'none';
}
async function pwAendernSpeichern() {
  const alt  = document.getElementById('pw-alt').value;
  const neu  = document.getElementById('pw-neu').value;
  const neu2 = document.getElementById('pw-neu2').value;
  const msgEl = document.getElementById('pw-aendern-msg');
  msgEl.textContent = '';
  if (!alt || !neu || !neu2) { msgEl.style.color='#dc2626'; msgEl.textContent='Bitte alle Felder ausfüllen.'; return; }
  if (neu !== neu2) { msgEl.style.color='#dc2626'; msgEl.textContent='Die neuen Passwörter stimmen nicht überein.'; return; }
  if (neu.length < 8) { msgEl.style.color='#dc2626'; msgEl.textContent='Neues Passwort muss mindestens 8 Zeichen haben.'; return; }

  const btn = document.getElementById('pw-aendern-btn');
  btn.disabled = true; btn.textContent = '⏳ …';
  try {
    const users = await SB.get('users', `id=eq.${currentUser.userId}`);
    if (!users.length) throw new Error('Benutzer nicht gefunden');
    const ok = await verifyPasswort(alt, users[0].password_hash);
    if (!ok) { msgEl.style.color='#dc2626'; msgEl.textContent='Altes Passwort falsch.'; btn.disabled=false; btn.textContent='💾 Passwort ändern'; return; }
    const newHash = await hashPasswort(neu);
    await SB.patch('users', `id=eq.${currentUser.userId}`, { password_hash: newHash });
    await sbAudit('PW_AENDERUNG', 'Passwort geändert');
    msgEl.style.color = '#16a34a';
    msgEl.textContent = '✅ Passwort erfolgreich geändert!';
    setTimeout(schliessePwAendern, 2000);
  } catch(e) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = 'Fehler: ' + e.message;
  }
  btn.disabled = false; btn.textContent = '💾 Passwort ändern';
}

// ══════════════════════════════════════════════════════════════
//  bcrypt AUTO-MIGRATION beim Login
// ══════════════════════════════════════════════════════════════
async function migriereSHA256ZuBcrypt(userId, klartext) {
  if (!bcryptVerfuegbar()) return;
  try {
    const newHash = await hashPasswort(klartext);
    await SB.patch('users', `id=eq.${userId}`, { password_hash: newHash });
    console.info('bcrypt-Migration abgeschlossen für', userId);
  } catch(e) { console.warn('bcrypt-Migration fehlgeschlagen:', e.message); }
}

// ── SUPABASE ─────────────────────────────────────────────────
const SUPABASE_URL = 'https://vziankbxuiqwekdbjewg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_O1FpQYiGlmdgrlIKJVUq-g_zMOj6Utw';

const SB = {
  h: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },
  async get(table, q='') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${q}`, { headers: this.h });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async select(table, q='') {
    // Alias für get() — select wird in neueren Funktionen verwendet
    return this.get(table, q);
  },
  async post(table, data) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:'POST', headers: this.h, body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async upsert(table, data) {
    const h = { ...this.h, 'Prefer': 'return=representation,resolution=merge-duplicates' };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:'POST', headers: h, body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(table, filter, data) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method:'PATCH', headers: this.h, body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async uploadPdf(pdfBlob, path) {
    // PUT mit x-upsert:true — überschreibt ohne 409-Fehler
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/schulung-pdfs/${path}`, {
      method:'PUT',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':'application/pdf',
        'x-upsert': 'true'
      },
      body: pdfBlob
    });
    if (!r.ok) { const t = await r.text(); throw new Error(t); }
    return `${SUPABASE_URL}/storage/v1/object/public/schulung-pdfs/${path}`;
  },
  async delete(table, filter) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method:'DELETE', headers: this.h
    });
    if (!r.ok) throw new Error(await r.text());
    return r.status;
  }
};

// ── APP INITIALISIEREN ───────────────────────────────────────
async function initApp() {
  initDarkMode();
  pruefeCookieConsent();
  showScreen('screen-loading');

  // Passwort-Reset-Token prüfen
  await pruefePasswordResetToken();

  // QR-Login prüfen
  const istQrLogin = await pruefeQrLogin();
  if (istQrLogin) return;

  // Einladungslink prüfen — wenn vorhanden, Gast-Flow starten
  const istGast = await pruefeEinladungsToken();
  if (istGast) return;

  // DSGVO: Audit-Einträge älter als 2 Jahre löschen
  try {
    const zweiJahreAgo = new Date(Date.now() - 2*365*24*60*60*1000).toISOString();
    await SB.delete('audit', `ts=lt.${zweiJahreAgo}`);
  } catch(e) { /* nicht kritisch */ }

  try {
    const [tenants, vorlagen, zuws, users] = await Promise.all([
      SB.get('tenants'),
      SB.get('vorlagen'),
      SB.get('zuweisungen'),
      SB.get('users', 'select=id,name,email,tenant_id,role,telefon,mobil,position,aktiv,archiviert')
    ]);
    APP_TENANTS       = tenants;
    APP_USERS         = users; // Für ID→Name Auflösung (z.B. im PDF)
    SCHULUNG_VORLAGEN = vorlagen.map(v => ({
      ...v, intervallMonate: v.intervall_monate,
      abschnitte: typeof v.abschnitte === 'string' ? JSON.parse(v.abschnitte) : v.abschnitte
    }));
    zuweisungen = zuws.map(z => ({
      id: z.id, vorlagenId: z.vorlage_id, tenantId: z.tenant_id,
      frist: z.frist, pflicht: z.pflicht,
      intervallMonate: z.intervall_monate || null,
      zugewiesenAn: z.zugewiesen_an || null
    }));

    // Formulare laden
    const forms = await SB.get('formulare');
    formulare = {};
    forms.forEach(f => {
      formulare[f.id] = {
        felder:           typeof f.felder === 'string' ? JSON.parse(f.felder) : (f.felder || {}),
        gestartet:        f.gestartet,
        abgeschlossen:    f.abgeschlossen,
        abgeschlossenAm:  f.abgeschlossen_am,
        abgeschlossenVon: f.abgeschlossen_von,
        pdfPath:          f.pdf_path
      };
    });

    const session = checkSession();
    if (session) { currentUser = session; startInactivityWatcher(); routeAfterLogin(); }
    else { showScreen('screen-login'); }
  } catch(e) {
    console.error('Init Fehler:', e);
    document.getElementById('loading-msg').textContent = 'Verbindungsfehler: ' + e.message;
  }
}

// ── AMPEL ────────────────────────────────────────────────────
function berechneStatus(zuw) {
  // Lernpfad-Zuweisung: Status aus lernpfadUnterschrift (eigener User) oder _lpUntCache (andere User)
  if (zuw.vorlagenId === LERNPFAD_VORLAGE_ID) {
    const userId = zuw.zugewiesenAn || (currentUser ? currentUser.userId : null);
    const hat = userId && window._lpUntCache && window._lpUntCache[userId]
      ? window._lpUntCache[userId].unterzeichnet_am
      : (lernpfadUnterschrift && lernpfadUnterschrift.unterzeichnetAm);
    if (hat) return 'gruen';
    const frist = zuw.frist ? new Date(zuw.frist) : null;
    const jetzt = new Date();
    if (frist && frist < jetzt) return 'rot';
    if (frist && (frist - jetzt) / 86400000 <= 20) return 'gelb';
    return 'grau';
  }
  const form  = formulare[zuw.id] || {};
  if (form.abgeschlossen) return 'gruen';           // ✅ Abgeschlossen → grün
  const frist = zuw.frist ? new Date(zuw.frist) : null;
  const jetzt = new Date();
  if (frist && frist < jetzt) return 'rot';         // 🔴 Frist überschritten → rot
  if (frist && (frist - jetzt) / 86400000 <= 20) return 'gelb'; // 🟡 ≤20 Tage → gelb
  return 'grau';                                    // ⚪ Noch >20 Tage oder keine Frist → grau
}
function statusLabel(s) {
  if (s === 'gruen') return 'Abgeschlossen';
  if (s === 'gelb')  return 'Bald fällig';
  if (s === 'rot')   return 'Überfällig';
  return 'Noch nicht fällig';
}
function statusBadgeHtml(s) {
  return `<span class="badge badge-${s}"><span class="ampel-dot dot-${s}"></span>${statusLabel(s)}</span>`;
}

// ── SCREENS ──────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
  // Legal-Footer: nur im eingeloggten Bereich anzeigen (nicht auf Login/Loading/Gast)
  const lf = document.getElementById('legal-footer');
  if (lf) {
    const hiddenScreens = ['screen-login','screen-loading','screen-gast'];
    lf.style.display = hiddenScreens.includes(id) ? 'none' : 'flex';
  }
}

// ── SESSION ──────────────────────────────────────────────────
function checkSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s || Date.now() > s.expires) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch(e) { return null; }
}
function doLogout() {
  sbAudit('LOGOUT','Benutzer abgemeldet');
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  // SICHERHEIT: Alle globalen Datenarrays leeren — kein Datenleck beim Benutzerwechsel
  APP_TENANTS       = [];
  APP_USERS         = [];
  SCHULUNG_VORLAGEN = [];
  zuweisungen       = [];
  formulare         = {};
  lernpfadFortschritt = {};
  lernpfadUnterschrift = null;
  document.getElementById('screen-firma')?.style.setProperty('display','none');
  showScreen('screen-login');
}

function doLogoutMitBestaetigung() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `<div style="background:#fff;border-radius:14px;padding:22px 20px;max-width:320px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.2)">
    <div style="font-size:1.1rem;font-weight:700;color:#1e3a5f;margin-bottom:8px">Abmelden?</div>
    <div style="font-size:.85rem;color:#6b7280;margin-bottom:18px">Möchten Sie sich wirklich abmelden?</div>
    <div style="display:flex;gap:10px">
      <button id="_lo_ab" style="flex:1;padding:11px;border-radius:9px;border:1px solid #e5e7eb;background:#f9fafb;font-size:.9rem;font-weight:600;cursor:pointer">Abbrechen</button>
      <button id="_lo_ok" style="flex:1;padding:11px;border-radius:9px;border:none;background:#dc2626;color:#fff;font-size:.9rem;font-weight:700;cursor:pointer">Abmelden</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#_lo_ab').onclick = () => document.body.removeChild(modal);
  modal.querySelector('#_lo_ok').onclick = () => { document.body.removeChild(modal); doLogout(); };
}
function routeAfterLogin() {
  // Archivierte Mitarbeiter dürfen sich nicht anmelden
  if (currentUser.archiviert) {
    showToast('📦 Dieses Konto ist archiviert. Bitte wenden Sie sich an Ihren Verantwortlichen.', '#6b7280');
    setTimeout(doLogout, 4500);
    return;
  }
  if (currentUser.role === 'admin') {
    renderAdminDashboard();
    showScreen('screen-admin');
  } else if (currentUser.role === 'firma') {
    // Firma-Admin: sieht alle Verantwortlichen und Mitarbeiter seines Tenants
    const tid = currentUser.tenantId;
    APP_TENANTS = APP_TENANTS.filter(t => t.id === tid);
    zuweisungen = zuweisungen.filter(z => z.tenantId === tid);
    const eigeneZuwIds = new Set(zuweisungen.map(z => z.id));
    Object.keys(formulare).forEach(k => { if (!eigeneZuwIds.has(k)) delete formulare[k]; });
    APP_USERS = APP_USERS.filter(u => u.tenant_id === tid);
    renderFirmaDashboard();
    showScreen('screen-firma');
  } else {
    // ══════════════════════════════════════════════════════
    // MANDANTENTRENNUNG — Sub-User sieht AUSSCHLIESSLICH
    // eigene Daten. Alle globalen Arrays werden hier auf
    // den eigenen Tenant reduziert. Fremde Daten werden
    // vollständig aus dem Arbeitsspeicher entfernt.
    // ══════════════════════════════════════════════════════
    const tid = currentUser.tenantId;

    // 1. Nur eigener Tenant sichtbar
    APP_TENANTS = APP_TENANTS.filter(t => t.id === tid);

    // 2. Nur eigene Zuweisungen (ohne persönliche Einweisungen anderer Mitarbeiter)
    zuweisungen = zuweisungen.filter(z =>
      z.tenantId === tid &&
      (z.zugewiesenAn === null || z.zugewiesenAn === currentUser.userId)
    );

    // 3. Nur Formulare der eigenen Zuweisungen
    const eigeneZuwIds = new Set(zuweisungen.map(z => z.id));
    Object.keys(formulare).forEach(k => {
      if (!eigeneZuwIds.has(k)) delete formulare[k];
    });

    // 4. Nur Vorlagen die in eigenen Zuweisungen vorkommen
    //    Ausnahme: Verantwortliche brauchen alle Vorlagen (für Bereichs-Einweisung)
    const eigeneVorlagenIds = new Set(zuweisungen.map(z => z.vorlagenId));
    if (currentUser.role !== 'verantwortlicher') {
      SCHULUNG_VORLAGEN = SCHULUNG_VORLAGEN.filter(v => eigeneVorlagenIds.has(v.id));
    }

    // 5. Nur User des eigenen Tenants (für ID→Name Auflösung)
    APP_USERS = APP_USERS.filter(u => u.tenant_id === tid);

    renderSubDashboard();
    showScreen('screen-sub');
    // Wiederkehrende Schulungen auch für Verantwortliche prüfen
    setTimeout(pruefeWiederkehrendeSchulungen, 1500);
  }
}

// ── LOGIN ────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pw    = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-fehler');
  errEl.classList.remove('show');
  if (!email || !pw) { errEl.textContent='Bitte E-Mail und Passwort eingeben.'; errEl.classList.add('show'); return; }

  const loginBtn = document.querySelector('#screen-login .btn-primary');
  loginBtn.textContent = '⏳ Anmelden…';
  loginBtn.disabled = true;

  try {
    const users = await SB.get('users', `email=eq.${encodeURIComponent(email)}`);
    if (!users.length) {
      errEl.textContent='E-Mail oder Passwort falsch.'; errEl.classList.add('show');
      loginBtn.textContent='Anmelden'; loginBtn.disabled=false; return;
    }
    const user = users[0];
    const ok = await verifyPasswort(pw, user.password_hash);
    if (!ok) {
      errEl.textContent='E-Mail oder Passwort falsch.'; errEl.classList.add('show');
      loginBtn.textContent='Anmelden'; loginBtn.disabled=false; return;
    }
    // SHA-256 → bcrypt Auto-Migration (im Hintergrund)
    if (user.password_hash && !user.password_hash.startsWith('$2')) {
      migriereSHA256ZuBcrypt(user.id, pw); // async, kein await
    }
    const session = {
      userId: user.id, name: user.name, email: user.email,
      role: user.role, tenantId: user.tenant_id,
      aktiv: user.aktiv !== false,        // passiv-Schutz
      archiviert: !!user.archiviert,      // archiviert-Schutz
      expires: Date.now() + SESSION_HOURS * 3600 * 1000
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    currentUser = session;
    startInactivityWatcher();
    await sbAudit('LOGIN','Benutzer angemeldet');
    routeAfterLogin();
  } catch(e) {
    errEl.textContent='Fehler: '+e.message; errEl.classList.add('show');
  }
  loginBtn.textContent='Anmelden'; loginBtn.disabled=false;
}

// ── AUDIT ────────────────────────────────────────────────────
async function sbAudit(action, detail) {
  try {
    await SB.post('audit', {
      user_name:  currentUser ? currentUser.name  : '–',
      user_email: currentUser ? currentUser.email : '',
      action, detail
    });
  } catch(e) { console.warn('Audit Fehler:', e); }
}

// ── PW TOGGLE ────────────────────────────────────────────────
document.getElementById('pw-toggle-btn').addEventListener('click', () => {
  const inp = document.getElementById('login-password');
  const btn = document.getElementById('pw-toggle-btn');
  inp.type = inp.type==='password' ? 'text' : 'password';
  btn.textContent = inp.type==='password' ? '👁' : '🙈';
});
document.getElementById('login-password').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

// ══════════════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ══════════════════════════════════════════════════════════════
function renderAdminDashboard() {
  document.getElementById('admin-username').textContent = currentUser.name;
  renderAdminStats();
  renderAdminTenantTable();
  renderAdminVorlagen();
  renderAdminZuweisungen();
  renderAuditTrail();
  populateZuweisungsForm();
  // Wiederkehrende Schulungen prüfen
  setTimeout(pruefeWiederkehrendeSchulungen, 1000);
  // Push-Benachrichtigungen Status im Header
  setTimeout(() => {
    const headerBtns = document.querySelector('#screen-admin .app-header > div');
    if (headerBtns && 'Notification' in window && Notification.permission !== 'granted') {
      const pushBtn = document.createElement('button');
      pushBtn.className = 'btn btn-outline btn-sm';
      pushBtn.style.cssText = 'font-size:.72rem;color:#fff;border-color:rgba(255,255,255,.4)';
      pushBtn.innerHTML = '🔔';
      pushBtn.title = 'Benachrichtigungen aktivieren';
      pushBtn.onclick = pushBenachrichtigungAnfordern;
      headerBtns.insertBefore(pushBtn, headerBtns.firstChild);
    }
  }, 500);
}
function adminTab(tabName, btn) {
  activeAdminTab = tabName;
  // Nav-Buttons in Sidebar aktiv setzen
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Tab-Inhalte umschalten
  document.querySelectorAll('#screen-admin .tab-content').forEach(t => t.style.display='none');
  document.getElementById(`tab-${tabName}`).style.display='';
  // Sidebar auf Mobile schließen
  adminSidebarClose();
  if (tabName==='protokoll') loadAuditFromDB();
  if (tabName==='unternehmen') nuRenderListe();
  if (tabName==='kalender') renderKalender();
  if (tabName==='archiv') renderArchiv();
  if (tabName==='uebersicht') renderAdminCharts();
}
function adminSidebarOpen() {
  document.getElementById('admin-sidebar').classList.add('open');
  document.getElementById('admin-sidebar-overlay').style.display = '';
}
function adminSidebarClose() {
  document.getElementById('admin-sidebar').classList.remove('open');
  document.getElementById('admin-sidebar-overlay').style.display = 'none';
}
async function loadAuditFromDB() {
  try {
    const log = await SB.get('audit','order=ts.desc&limit=100');
    const html = log.map(e => `
      <div class="audit-item">
        <span class="audit-icon">${e.action==='LOGIN'?'🔑':e.action==='LOGOUT'?'🔓':e.action==='ABSCHLUSS'?'✅':e.action==='ZWISCHENSPEICHERN'?'💾':'📝'}</span>
        <div>
          <div style="font-size:.82rem"><strong>${e.action}</strong> — ${escHtml(e.detail)}</div>
          <div class="audit-time">${dateStr(e.ts)} • ${escHtml(e.user_name)}</div>
        </div>
      </div>
    `).join('') || '<div class="empty-state"><div class="icon">📋</div><p>Noch keine Einträge</p></div>';
    document.getElementById('audit-list').innerHTML = html;
  } catch(e) { console.warn(e); }
}
function renderAuditTrail() {
  document.getElementById('audit-list').innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280">Tab öffnen zum Laden…</div>';
}
function adminStatFilter(status) {
  // 1. Zum Zuweisungen-Tab wechseln
  const btn = document.querySelector('.admin-nav-btn[data-tab="zuweisungen"]');
  // Tab direkt schalten ohne adminTab (der ruft adminSidebarClose auf was bei Mobile stören kann)
  activeAdminTab = 'zuweisungen';
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('#screen-admin .tab-content').forEach(t => t.style.display='none');
  const tabEl = document.getElementById('tab-zuweisungen');
  if (tabEl) tabEl.style.display='';
  // 2. Liste aufklappen
  const bereich = document.getElementById('zuw-liste-bereich');
  if (bereich) bereich.style.display = '';
  const icon = document.getElementById('zuw-toggle-icon');
  if (icon) icon.style.transform = 'rotate(90deg)';
  // 3. Filter setzen und rendern
  const sel = document.getElementById('zuw-filter-status');
  if (sel) sel.value = status;
  renderAdminZuweisungen();
  // 4. Scrollen
  setTimeout(() => {
    const el = document.getElementById('zuw-liste-bereich');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
}

function renderAdminStats() {
  let g=0,y=0,r=0;
  zuweisungen.forEach(z => { const s=berechneStatus(z); if(s==='gruen')g++; else if(s==='gelb')y++; else r++; });
  const kachelStyle = 'cursor:pointer;transition:transform .15s,box-shadow .15s';
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-tile gruen" style="${kachelStyle}" onclick="adminStatFilter('gruen')" title="Abgeschlossene anzeigen"><div class="zahl">${g}</div><div class="label">Abgeschlossen</div></div>
    <div class="stat-tile gelb" style="${kachelStyle}" onclick="adminStatFilter('gelb')" title="In Bearbeitung anzeigen"><div class="zahl">${y}</div><div class="label">In Bearbeitung</div></div>
    <div class="stat-tile rot" style="${kachelStyle}" onclick="adminStatFilter('rot')" title="Offene / Überfällige anzeigen"><div class="zahl">${r}</div><div class="label">Offen / Überfällig</div></div>
  `;
  // Charts beim ersten Übersicht-Tab ebenfalls aktualisieren
  setTimeout(renderAdminCharts, 0);
}

// ── ADMIN CHARTS ──────────────────────────────────────────────
function renderAdminCharts() {
  const el = document.getElementById('admin-charts');
  if (!el) return;

  // Top-5 Unternehmen mit meisten offenen Schulungen
  const topOffen = APP_TENANTS.map(t => {
    const zuws = zuweisungen.filter(z => z.tenantId === t.id);
    const offen = zuws.filter(z => berechneStatus(z) === 'rot').length;
    return { name: t.name, offen };
  }).sort((a,b) => b.offen - a.offen).slice(0, 5);

  // Balkendiagramm (CSS-basiert, kein externe Lib nötig)
  const maxOffen = Math.max(...topOffen.map(t=>t.offen), 1);
  const barsHtml = topOffen.map(t => {
    const pct = Math.round(t.offen / maxOffen * 100);
    const color = t.offen === 0 ? '#16a34a' : t.offen <= 2 ? '#f59e0b' : '#dc2626';
    return `<div style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:3px">
        <span>${escHtml(t.name)}</span>
        <strong style="color:${color}">${t.offen} offen</strong>
      </div>
      <div style="background:#f3f4f6;border-radius:6px;height:14px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:6px;transition:width .5s"></div>
      </div>
    </div>`;
  }).join('');

  // Gesamtfortschritt Donut (SVG)
  let g=0,y=0,r=0;
  zuweisungen.forEach(z => { const s=berechneStatus(z); if(s==='gruen')g++; else if(s==='gelb')y++; else r++; });
  const total = g+y+r || 1;
  const grPct = g/total, ylPct = y/total, rtPct = r/total;
  const R=40, C=2*Math.PI*R;
  const grArc=C*grPct, ylArc=C*ylPct, rtArc=C*rtPct;
  const grOff=0, ylOff=-grArc, rtOff=-(grArc+ylArc);

  el.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">📊 Gesamtfortschritt</div>
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <svg width="100" height="100" viewBox="0 0 100 100" style="flex-shrink:0">
          <circle cx="50" cy="50" r="${R}" fill="none" stroke="#f3f4f6" stroke-width="14"/>
          ${r>0?`<circle cx="50" cy="50" r="${R}" fill="none" stroke="#dc2626" stroke-width="14" stroke-dasharray="${rtArc} ${C}" stroke-dashoffset="${rtOff}" transform="rotate(-90 50 50)"/>`:''}
          ${y>0?`<circle cx="50" cy="50" r="${R}" fill="none" stroke="#f59e0b" stroke-width="14" stroke-dasharray="${ylArc} ${C}" stroke-dashoffset="${ylOff}" transform="rotate(-90 50 50)"/>`:''}
          ${g>0?`<circle cx="50" cy="50" r="${R}" fill="none" stroke="#16a34a" stroke-width="14" stroke-dasharray="${grArc} ${C}" stroke-dashoffset="${grOff}" transform="rotate(-90 50 50)"/>`:''}
          <text x="50" y="55" text-anchor="middle" font-size="16" font-weight="700" fill="#1a3a5c">${Math.round(grPct*100)}%</text>
        </svg>
        <div style="flex:1">
          <div style="font-size:.82rem;margin-bottom:4px"><span style="color:#16a34a">●</span> ${g} Abgeschlossen</div>
          <div style="font-size:.82rem;margin-bottom:4px"><span style="color:#f59e0b">●</span> ${y} In Bearbeitung</div>
          <div style="font-size:.82rem"><span style="color:#dc2626">●</span> ${r} Offen / Überfällig</div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">🏆 Unternehmen mit offenen Schulungen</div>
      ${barsHtml || '<div style="color:#6b7280;font-size:.85rem">✅ Alle Schulungen erledigt!</div>'}
    </div>`;
}

// ── SCHULUNGS-KALENDER (leitet auf verbesserte Version weiter) ─
function renderKalender() {
  renderKalenderVerbessert();
}

// ── ARCHIV ────────────────────────────────────────────────────
async function renderArchiv() {
  const el = document.getElementById('tab-archiv');
  if (!el) return;
  el.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280">⏳ Wird geladen…</div>';

  try {
    // Alle abgeschlossenen Formulare laden
    const abgeschlossene = await SB.get('formulare',
      'abgeschlossen=eq.true&order=abgeschlossen_am.desc&limit=200'
    );

    // Archivierte Mitarbeiter laden
    let archivierteMa = [];
    try {
      archivierteMa = await SB.get('users',
        `role=eq.mitarbeiter&archiviert=eq.true&order=archiviert_am.desc&limit=200`
      );
      // Auf eigene Tenants beschränken (für Non-Admin)
      if (currentUser && currentUser.role !== 'admin' && currentUser.tenantId) {
        archivierteMa = archivierteMa.filter(m => m.tenant_id === currentUser.tenantId);
      }
    } catch(e) { /* ignorieren falls Feld fehlt */ }

    let html = '';

    // ── Abgeschlossene Schulungen ──────────────────────────────
    if (!abgeschlossene.length) {
      html += '<div class="card"><div class="empty-state"><div class="icon">📦</div><p>Noch keine abgeschlossenen Schulungen</p></div></div>';
    } else {
      // Nach Jahr gruppieren
      const byJahr = {};
      abgeschlossene.forEach(f => {
        const jahr = f.abgeschlossen_am ? new Date(f.abgeschlossen_am).getFullYear() : 'Unbekannt';
        if (!byJahr[jahr]) byJahr[jahr] = [];
        const zuw = zuweisungen.find(z=>z.id===f.id);
        const v   = zuw ? SCHULUNG_VORLAGEN.find(vl=>vl.id===zuw.vorlagenId) : null;
        const t   = zuw ? APP_TENANTS.find(tn=>tn.id===zuw.tenantId) : null;
        byJahr[jahr].push({ ...f, titel: v?.titel||f.id, tenant: t?.name||zuw?.tenantId||'–' });
      });

      Object.keys(byJahr).sort((a,b)=>b-a).forEach(jahr => {
        html += `<div class="card" style="margin-bottom:12px">
          <div class="card-title">📁 ${jahr} (${byJahr[jahr].length} Schulungen)</div>`;
        byJahr[jahr].forEach(f => {
          html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f3f4f6">
            <div style="font-size:1.2rem">✅</div>
            <div style="flex:1">
              <div style="font-size:.88rem;font-weight:600">${escHtml(f.titel)}</div>
              <div style="font-size:.76rem;color:#6b7280">${escHtml(f.tenant)} · ${f.abgeschlossen_am ? dateStr(f.abgeschlossen_am) : '–'} ${f.mitarbeiter_name?`· ${escHtml(f.mitarbeiter_name)}`:''}</div>
            </div>
            ${f.pdf_path?`<a href="${f.pdf_path}" target="_blank" class="btn btn-outline btn-sm" style="font-size:.72rem">📄 PDF</a>`:''}\n          </div>`;
        });
        html += '</div>';
      });
    }

    // ── Archivierte Mitarbeiter ───────────────────────────────
    html += `<div class="card" style="margin-top:12px">
      <div class="card-title">👤 Archivierte Mitarbeiter (${archivierteMa.length})</div>`;
    if (!archivierteMa.length) {
      html += '<div style="font-size:.85rem;color:#6b7280;padding:12px 0">Keine archivierten Mitarbeiter.</div>';
    } else {
      archivierteMa.forEach(m => {
        const tenant = APP_TENANTS.find(t => t.id === m.tenant_id);
        html += `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f3f4f6;opacity:0.8">
          <div style="font-size:1.2rem">📦</div>
          <div style="flex:1">
            <div style="font-size:.88rem;font-weight:600">${escHtml(m.name)}</div>
            <div style="font-size:.76rem;color:#6b7280">${escHtml(m.email)} ${tenant?`· ${escHtml(tenant.name)}`:''} · Archiviert: ${m.archiviert_am ? dateStr(m.archiviert_am) : '–'}</div>
          </div>
        </div>`;
      });
    }
    html += '</div>';

    el.innerHTML = `<div class="card-title" style="font-size:1.1rem;margin-bottom:12px">📦 Schulungsarchiv</div>${html}`;
  } catch(e) {
    el.innerHTML = `<div class="card"><div style="color:#dc2626">Fehler: ${escHtml(e.message)}</div></div>`;
  }
}

// ── SUB-KALENDER VOLLBILD ─────────────────────────────────────
function subKalenderOeffnen() {
  const modal = document.getElementById('sub-kalender-modal');
  if (!modal) return;
  const el = document.getElementById('sub-kal-unternehmen');
  if (el && currentUser) {
    const t = APP_TENANTS.find(t => t.id === currentUser.tenantId);
    el.textContent = t ? t.name : '';
  }
  modal.style.display = 'block';
  document.body.style.overflow = 'hidden';
  window._subKalFilter = 'alle';
  subKalenderRenderInhalt('alle');
  ['alle','rot','gelb','gruen'].forEach(f => {
    const btn = document.getElementById('skf-' + f);
    if (!btn) return;
    if (f === 'alle') { btn.style.background = '#1e3a5f'; btn.style.color = '#fff'; }
    else { btn.style.background = '#fff'; btn.style.color = f==='rot'?'#dc2626':f==='gelb'?'#f59e0b':'#16a34a'; }
  });
}
function subKalenderSchliessen() {
  const modal = document.getElementById('sub-kalender-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}
function subKalenderFilter(filter, btn) {
  window._subKalFilter = filter;
  [
    {id:'skf-alle', ab:{bg:'#1e3a5f',c:'#fff'}, ib:{bg:'#f1f5f9',c:'#374151'}},
    {id:'skf-rot',  ab:{bg:'#dc2626',c:'#fff'}, ib:{bg:'#fff',c:'#dc2626'}},
    {id:'skf-gelb', ab:{bg:'#f59e0b',c:'#fff'}, ib:{bg:'#fff',c:'#f59e0b'}},
    {id:'skf-gruen',ab:{bg:'#16a34a',c:'#fff'}, ib:{bg:'#fff',c:'#16a34a'}},
  ].forEach(({id,ab,ib}) => {
    const b = document.getElementById(id);
    if (!b) return;
    const a = id === 'skf-' + filter;
    b.style.background = a ? ab.bg : ib.bg;
    b.style.color      = a ? ab.c  : ib.c;
  });
  subKalenderRenderInhalt(filter);
}
function subKalenderRenderInhalt(filter) {
  const el = document.getElementById('sub-kal-inhalt');
  if (!el) return;
  const meineZuws = zuweisungen.filter(z => z.tenantId === currentUser.tenantId && z.frist);
  if (!meineZuws.length) {
    el.innerHTML = '<div style="text-align:center;padding:40px 16px;color:#6b7280">Keine Schulungsfristen vorhanden.</div>';
    return;
  }
  let liste = meineZuws.map(z => {
    const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
    const s = berechneStatus(z);
    const tage = Math.ceil((new Date(z.frist) - new Date()) / 86400000);
    return { ...z, v, s, tage };
  }).sort((a, b) => new Date(a.frist) - new Date(b.frist));
  if (filter === 'rot')   liste = liste.filter(z => z.s === 'rot');
  if (filter === 'gelb')  liste = liste.filter(z => z.s === 'gelb');
  if (filter === 'gruen') liste = liste.filter(z => z.s === 'gruen');
  if (!liste.length) {
    const labels = {rot:'Überfällige', gelb:'Bald fällige', gruen:'Abgeschlossene'};
    el.innerHTML = `<div style="text-align:center;padding:40px 16px;color:#6b7280">Keine ${labels[filter]||''} Schulungen.</div>`;
    return;
  }
  const gruppen = {};
  liste.forEach(z => {
    const d = new Date(z.frist);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('de-DE', {month:'long', year:'numeric'});
    if (!gruppen[key]) gruppen[key] = {label, items: []};
    gruppen[key].items.push(z);
  });
  const ampelFarbe = {rot:'#dc2626', gelb:'#f59e0b', gruen:'#16a34a', grau:'#9ca3af'};
  const ampelBadge = {rot:'🔴 Überfällig', gelb:'🟡 Bald fällig', gruen:'🟢 Abgeschlossen', grau:'⚪ Noch nicht fällig'};
  let html = '';
  Object.values(gruppen).forEach(gruppe => {
    html += `<div style="margin-bottom:20px">
      <div style="font-size:.78rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px;padding:0 2px">${gruppe.label}</div>`;
    gruppe.items.forEach(z => {
      const farbe = ampelFarbe[z.s] || '#9ca3af';
      const badge = ampelBadge[z.s] || '';
      const tageText = z.tage < 0
        ? `<span style="color:#dc2626;font-weight:700">${Math.abs(z.tage)} Tage überfällig</span>`
        : z.tage === 0 ? `<span style="color:#dc2626;font-weight:700">Heute fällig!</span>`
        : `<span style="color:${farbe};font-weight:600">in ${z.tage} Tag${z.tage===1?'':'en'}</span>`;
      const datumFormatiert = new Date(z.frist).toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});
      const icon = z.s==='gruen'?'✅':z.s==='rot'?'⚠️':z.s==='gelb'?'⏳':'📋';
      html += `<div onclick="kalenderEintragDetail('${z.id}')" style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid ${farbe};display:flex;align-items:flex-start;gap:14px;cursor:pointer;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 3px 12px rgba(0,0,0,.15)'" onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,.08)'">
        <div style="min-width:44px;height:44px;border-radius:50%;background:${farbe}22;display:flex;align-items:center;justify-content:center;font-size:1.3rem">${icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.93rem;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${z.vorlagenId === LERNPFAD_VORLAGE_ID ? '<span style="color:#6b21a8">📚 Lernpfad (29 Kapitel)</span>' : z.vorlagenId === '__psaga__' ? '<span style="color:#166534">🪝 PSAgA-Schulung</span>' : escHtml(z.v ? z.v.titel : z.vorlagenId)}</div>
          <div style="font-size:.78rem;color:#64748b;margin-top:3px">📅 Frist: <strong>${datumFormatiert}</strong> · ${tageText}</div>
          <div style="margin-top:6px;display:flex;align-items:center;gap:8px">
            <span style="font-size:.72rem;padding:3px 8px;border-radius:20px;background:${farbe}22;color:${farbe};font-weight:600">${badge}</span>
            <span style="font-size:.72rem;color:#9ca3af">👥 Mitarbeiter anzeigen ›</span>
          </div>
        </div>
      </div>`;
    });
    html += '</div>';
  });
  const anzRot = liste.filter(z=>z.s==='rot').length;
  const anzGelb = liste.filter(z=>z.s==='gelb').length;
  const anzGruen = liste.filter(z=>z.s==='gruen').length;
  const summaryHtml = filter === 'alle' ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
    ${anzRot>0   ? `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:8px 14px;font-size:.82rem;color:#dc2626;font-weight:600">🔴 ${anzRot} Überfällig</div>` : ''}
    ${anzGelb>0  ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 14px;font-size:.82rem;color:#b45309;font-weight:600">🟡 ${anzGelb} Bald fällig</div>` : ''}
    ${anzGruen>0 ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:8px 14px;font-size:.82rem;color:#16a34a;font-weight:600">🟢 ${anzGruen} Abgeschlossen</div>` : ''}
  </div>` : '';
  el.innerHTML = summaryHtml + html;
}

// ── SUB-KALENDER (Dashboard-Widget) ──────────────────────────
function renderSubKalender() {
  // Deaktiviert — Widget "Nächste Fristen" ausgeblendet
  const el = document.getElementById('sub-kalender');
  if (el) el.style.display = 'none';
}
function renderAdminTenantTable() {
  // Mit Suchfunktion — nutzt renderAdminTenantTableMitSuche wenn Suche aktiv
  const el = document.getElementById('admin-tenant-table');
  if (!el) return;
  if (adminSuchFilter) {
    renderAdminTenantTableMitSuche();
    return;
  }

  const rows = APP_TENANTS.map(t => {
    const zuws  = zuweisungen.filter(z => z.tenantId===t.id);
    const stati = zuws.map(z => berechneStatus(z));
    const g=stati.filter(s=>s==='gruen').length, y=stati.filter(s=>s==='gelb').length, r=stati.filter(s=>s==='rot').length;
    const pct = zuws.length ? Math.round(g/zuws.length*100) : 0;
    return `<tr>
      <td class="td-name">${escHtml(t.name)}</td>
      <td>${zuws.length}</td>
      <td>
        <span class="badge badge-gruen"><span class="ampel-dot dot-gruen"></span>${g}</span>
        <span class="badge badge-gelb" style="margin-left:4px"><span class="ampel-dot dot-gelb"></span>${y}</span>
        <span class="badge badge-rot"  style="margin-left:4px"><span class="ampel-dot dot-rot"></span>${r}</span>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar" style="width:100px">
            <div class="progress-fill ${pct===100?'fill-gruen':pct>0?'fill-gelb':'fill-rot'}" style="width:${pct}%"></div>
          </div>
          <span style="font-size:.78rem;color:#374151">${pct}%</span>
        </div>
      </td>
      <td><button class="btn btn-outline btn-sm" onclick="adminZeigeTenant('${t.id}')">Details</button></td>
    </tr>`;
  }).join('');
  document.getElementById('admin-tenant-table').innerHTML = `
    <div class="table-wrap"><table>
      <thead><tr><th>Unternehmen</th><th>Schulungen</th><th>Ampelstatus</th><th>Fortschritt</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}
function adminZeigeTenant(tenantId) {
  const tenant = APP_TENANTS.find(t=>t.id===tenantId);
  const zuws   = zuweisungen.filter(z=>z.tenantId===tenantId);
  const html = `<div class="card"><div class="card-title">🏢 ${escHtml(tenant.name)}</div>
    ${zuws.map(z => {
      const v=SCHULUNG_VORLAGEN.find(vl=>vl.id===z.vorlagenId), s=berechneStatus(z), f=formulare[z.id]||{};
      const isLP = z.vorlagenId === LERNPFAD_VORLAGE_ID;
      const isPsaga = z.vorlagenId === '__psaga__';
      const titel = isLP ? '📚 Lernpfad (29 Kapitel)' : isPsaga ? '🪝 PSAgA-Schulung' : (v ? escHtml(v.titel) : z.vorlagenId);
      return `<div class="schulung-item" onclick="adminDetailAnzeigen('${z.id}')">
        <div>
          <div class="titel" style="${isLP?'color:#6b21a8;font-weight:700':isPsaga?'color:#166534;font-weight:700':''}">${titel}</div>
          <div class="meta">Frist: ${z.frist||'–'} ${z.pflicht?'• <strong>Pflicht</strong>':''}</div>
          ${f.abgeschlossen?`<div class="meta">Abgeschlossen: ${dateStr(f.abgeschlossenAm)}</div>`:''}
        </div>
        <div class="right">${statusBadgeHtml(s)}</div>
      </div>`;
    }).join('')}
    ${!zuws.length?'<div class="empty-state"><div class="icon">📭</div><p>Keine Zuweisungen</p></div>':''}
  </div>`;
  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail-user-info').textContent = currentUser.name;
  showScreen('screen-admin-detail');
}
function adminDetailAnzeigen(zuwId) {
  activeDetailZuwId = zuwId;
  const zuw=zuweisungen.find(z=>z.id===zuwId), vorlage=SCHULUNG_VORLAGEN.find(v=>v.id===zuw.vorlagenId);
  const tenant=APP_TENANTS.find(t=>t.id===zuw.tenantId), form=formulare[zuwId]||{}, status=berechneStatus(zuw);
  const isLP = zuw.vorlagenId === LERNPFAD_VORLAGE_ID;
  const isPsaga = zuw.vorlagenId === '__psaga__';

  let feldHtml='';
  if (isLP) {
    // Lernpfad-Detail: Status aus Cache anzeigen
    const lpUnt = window._lpUntCache && zuw.zugewiesenAn ? window._lpUntCache[zuw.zugewiesenAn] : null;
    feldHtml = lpUnt && lpUnt.unterzeichnet_am
      ? `<div style="background:#f0fdf4;border-radius:8px;padding:12px 14px">
           <div style="font-weight:700;color:#15803d;margin-bottom:4px">✅ Lernpfad unterzeichnet</div>
           <div style="font-size:.82rem;color:#374151">
             👤 <b>${escHtml(lpUnt.vollname||'–')}</b> · ${new Date(lpUnt.unterzeichnet_am).toLocaleDateString('de-DE')}
             ${lpUnt.verantwortlicher_am ? `<br>🧑‍💼 Gegengezeichnet: <b>${escHtml(lpUnt.verantwortlicher_name||'–')}</b> · ${new Date(lpUnt.verantwortlicher_am).toLocaleDateString('de-DE')}` : '<br>⏳ Gegenzeichnung ausstehend'}
           </div>
         </div>`
      : `<div class="empty-state"><div class="icon">📚</div><p>Noch nicht unterzeichnet</p></div>`;
  } else if (form.felder && vorlage) {
    vorlage.abschnitte.forEach(ab => {
      feldHtml += `<div class="form-section-title">${escHtml(ab.titel)}</div>`;
      ab.felder.forEach(feld => {
        const val=form.felder[feld.id];
        if (feld.typ==='signature' && val) feldHtml+=`<div class="form-group"><label>${escHtml(feld.label)}</label><img src="${val}" style="max-width:250px;border:1px solid #dde2e9;border-radius:6px"></div>`;
        else if (feld.typ==='checkbox') feldHtml+=`<div class="form-group"><label>${escHtml(feld.label)}</label><span>${val?'✅ Ja':'☐ Nein'}</span></div>`;
        else if (feld.typ==='upload' && val) feldHtml+=`<div class="form-group"><label>${escHtml(feld.label)}</label><span style="color:#16a34a">✓ ${escHtml(val)}</span></div>`;
        else feldHtml+=`<div class="form-group"><label>${escHtml(feld.label)}</label><div style="padding:8px;background:#f4f6f9;border-radius:6px">${escHtml(String(val||'–'))}</div></div>`;
      });
    });
  }
  const titelAnzeige = isLP ? '📚 Lernpfad (29 Kapitel)' : isPsaga ? '🪝 PSAgA-Schulung (22 Module)' : (vorlage ? escHtml(vorlage.titel) : zuwId);
  document.getElementById('detail-body').innerHTML = `
    <div class="card">
      <div class="card-title" style="${isLP?'color:#6b21a8':isPsaga?'color:#166534':''}">${titelAnzeige}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        ${statusBadgeHtml(status)}
        <span class="tenant-badge">${tenant?escHtml(tenant.name):zuw.tenantId}</span>
        ${zuw.pflicht?'<span class="badge" style="background:#fce7f3;color:#9d174d">Pflichtschulung</span>':''}
      </div>
      <div style="font-size:.82rem;color:#6b7280;margin-bottom:14px">
        Frist: ${zuw.frist||'–'} | ${form.abgeschlossen?`Abgeschlossen: ${dateStr(form.abgeschlossenAm)}`:'Noch offen'}
        ${form.pdfPath?`<br><a href="${form.pdfPath}" target="_blank" style="color:#0047cc">📄 PDF in Supabase öffnen</a>`:''}
      </div>
      ${feldHtml||'<div class="empty-state"><div class="icon">📝</div><p>Noch kein Formular ausgefüllt</p></div>'}
    </div>`;
  document.getElementById('detail-user-info').textContent = currentUser.name;
  showScreen('screen-admin-detail');
}
function exportDetailPdf() { if(activeDetailZuwId) generatePdf(activeDetailZuwId, true); }
function renderAdminVorlagen() {
  const liste = SCHULUNG_VORLAGEN;
  const anzEl = document.getElementById('vt-suche-anzahl');
  if (anzEl) anzEl.textContent = `${liste.length} Vorlage${liste.length !== 1 ? 'n' : ''} gespeichert`;

  // Suchfilter anwenden falls aktiv
  const suche = document.getElementById('vt-suche')?.value?.toLowerCase().trim() || '';
  const gefiltert = suche
    ? liste.filter(v => v.titel.toLowerCase().includes(suche) || (v.beschreibung||'').toLowerCase().includes(suche))
    : liste;

  document.getElementById('admin-vorlagen-list').innerHTML = gefiltert.map(v=>`
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div style="flex:1;min-width:0">
          <div class="card-title" style="margin-bottom:4px">📄 ${escHtml(v.titel)}</div>
          <div style="font-size:.84rem;color:#374151;margin-bottom:6px">${escHtml(v.beschreibung||'')}</div>
          <div style="font-size:.78rem;color:#6b7280">🔁 Intervall: ${v.intervallMonate||v.intervall_monate||'–'} Monate &nbsp;|&nbsp; 📑 ${(v.abschnitte||[]).length} Abschnitte &nbsp;|&nbsp; 🔢 ${(v.abschnitte||[]).reduce((s,a)=>s+a.felder.length,0)} Felder</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-outline btn-sm" onclick="vtBearbeiten('${v.id}')">✏️ Bearbeiten</button>
          <button class="btn btn-danger btn-sm" onclick="vtLoeschen('${v.id}')">🗑 Löschen</button>
        </div>
      </div>
      <details style="margin-top:10px">
        <summary style="font-size:.8rem;color:#6b7280;cursor:pointer;user-select:none">📑 Abschnitte anzeigen</summary>
        <div style="margin-top:8px;border-top:1px solid #f0f2f5;padding-top:8px">
          ${(v.abschnitte||[]).map(a=>`
            <div style="margin-bottom:5px">
              <span style="font-weight:700;font-size:.82rem;color:#1a3a5c">${escHtml(a.titel)}</span>
              <span style="color:#6b7280;font-size:.78rem"> — ${a.felder.map(f=>escHtml(f.label)).join(', ')}</span>
            </div>`).join('')}
        </div>
      </details>
    </div>`).join('')
    || `<div class="empty-state"><div class="icon">${suche ? '🔍' : '📭'}</div><p>${suche ? `Keine Vorlage für „${escHtml(suche)}" gefunden` : 'Noch keine Vorlagen vorhanden'}</p></div>`;

  // Anzahl-Anzeige mit Suchergebnis
  if (anzEl && suche) {
    anzEl.textContent = `${gefiltert.length} von ${liste.length} Vorlagen gefunden`;
  }
}

// Toggle: Vorlagenliste auf/zuklappen
function vtVorlagenListeToggle() {
  const container = document.getElementById('vt-liste-container');
  const icon = document.getElementById('vt-liste-toggle-icon');
  const btn = document.getElementById('vt-liste-toggle-btn');
  const offen = container.style.display !== 'none';
  if (offen) {
    container.style.display = 'none';
    icon.style.transform = '';
    btn.querySelector('span:first-child').textContent = `📋 Bestehende Vorlagen anzeigen`;
  } else {
    container.style.display = '';
    icon.style.transform = 'rotate(180deg)';
    btn.querySelector('span:first-child').textContent = `📋 Vorlagen schließen`;
    renderAdminVorlagen(); // Beim Öffnen immer frisch rendern
    document.getElementById('vt-suche').value = '';
    setTimeout(() => document.getElementById('vt-suche').focus(), 150);
  }
}

// Suchfunktion
function vtVorlagenSuche(wert) {
  renderAdminVorlagen();
}

// ── Lernpfad-Kernkapitel im Admin anzeigen ──
function adminKernkapitelToggle() {
  const container = document.getElementById('admin-kk-container');
  const icon = document.getElementById('admin-kk-toggle-icon');
  const btn = document.getElementById('admin-kk-toggle-btn');
  const offen = container.style.display !== 'none';
  if (offen) {
    container.style.display = 'none';
    icon.style.transform = '';
    btn.querySelector('span:first-child').textContent = '📚 29 Lernpfad-Kernkapitel anzeigen';
  } else {
    container.style.display = '';
    icon.style.transform = 'rotate(180deg)';
    btn.querySelector('span:first-child').textContent = '📚 Lernpfad-Kernkapitel schließen';
    renderAdminKernkapitel();
  }
}

function renderAdminKernkapitel() {
  const liste = document.getElementById('admin-kk-list');
  if (!liste) return;

  const saeuleInfo = {
    A: { label: 'Säule A — Gesetzliche Basis-Unterweisungen', farbe: '#1a3a5c', bg: '#e8f0fb' },
    B: { label: 'Säule B — Reinigungstechnologie & Chemie',   farbe: '#166534', bg: '#dcfce7' },
    C: { label: 'Säule C — Datenschutz & DSGVO',              farbe: '#7c2d12', bg: '#fff7ed' },
    D: { label: 'Säule D — Das 4-Farben-System (Hygiene)',    farbe: '#6b21a8', bg: '#faf5ff' },
  };

  // Kapitel nach Säule gruppieren
  const gruppen = {};
  LERNPFAD_KAPITEL.forEach(k => {
    if (!gruppen[k.saeule]) gruppen[k.saeule] = [];
    gruppen[k.saeule].push(k);
  });

  liste.innerHTML = Object.entries(gruppen).map(([saeule, kapitel]) => {
    const info = saeuleInfo[saeule] || { label: `Säule ${saeule}`, farbe: '#374151', bg: '#f9fafb' };
    return `
      <div class="card" style="margin-bottom:12px;border-left:4px solid ${info.farbe}">
        <div style="font-weight:700;font-size:.9rem;color:${info.farbe};margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e2e8f0">
          ${info.label}
        </div>
        ${kapitel.map(k => `
          <div style="display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #f0f2f5">
            <span style="min-width:28px;height:28px;background:${info.bg};color:${info.farbe};border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.82rem;flex-shrink:0">${k.nr}</span>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:.87rem;color:#1a1a2e">${escHtml(k.titel)}</div>
              <div style="font-size:.75rem;color:#6b7280;margin-top:2px">⚖️ ${escHtml(k.rechtsgrundlage)}</div>
            </div>
          </div>`).join('')}
      </div>`;
  }).join('') + `
    <div style="font-size:.78rem;color:#6b7280;text-align:center;padding:8px">
      ${LERNPFAD_KAPITEL.length} Standard-Kernkapitel — fest definiert für alle Unternehmen
    </div>`;
}

// ── Vorlage bearbeiten: Editor mit bestehenden Daten vorausfüllen ──
function vtBearbeiten(id) {
  const v = SCHULUNG_VORLAGEN.find(vl => vl.id === id);
  if (!v) return;

  // PDF-Vorlagen ohne Abschnitte können nicht bearbeitet werden
  const abschnitte = v.abschnitte || [];
  if (v.typ === 'pdf' && abschnitte.length === 0) {
    alert('Diese PDF-Vorlage enthält keine bearbeitbaren Felder.\n\nTipp: Laden Sie die Vorlage neu hoch und nutzen Sie „🔍 Felder aus PDF erkennen & bearbeiten".');
    return;
  }

  vtEditId = id;

  // Vorlagenliste schließen beim Bearbeiten
  const listeContainer = document.getElementById('vt-liste-container');
  const listeIcon = document.getElementById('vt-liste-toggle-icon');
  const listeBtn = document.getElementById('vt-liste-toggle-btn');
  if (listeContainer && listeContainer.style.display !== 'none') {
    listeContainer.style.display = 'none';
    if (listeIcon) listeIcon.style.transform = '';
    if (listeBtn) listeBtn.querySelector('span:first-child').textContent = '📋 Bestehende Vorlagen anzeigen';
  }

  // Zum Editor scrollen (Tab öffnen falls nötig)
  const tab = document.getElementById('tab-schulungen');
  if (tab && tab.style.display === 'none') {
    document.querySelectorAll('#screen-admin .tab-btn').forEach(b => {
      if (b.getAttribute('onclick')?.includes('schulungen')) b.click();
    });
  }

  // Felder vorausfüllen
  document.getElementById('vt-titel').value       = v.titel || '';
  document.getElementById('vt-beschreibung').value = v.beschreibung || '';
  document.getElementById('vt-intervall').value   = v.intervallMonate || v.intervall_monate || 12;

  // Typ auf "felder" setzen
  const radioFelder = document.querySelector('input[name="vt-typ"][value="felder"]');
  if (radioFelder) { radioFelder.checked = true; vtTypWechseln('felder'); }

  // Abschnitte leeren und neu befüllen
  const container = document.getElementById('vt-abschnitte');
  container.innerHTML = '';
  vtAbschnittCount = 0;

  (v.abschnitte || []).forEach(ab => {
    vtAbschnittCount++;
    const abId = `ab_${vtAbschnittCount}`;
    const div = document.createElement('div');
    div.id = abId;
    div.className = 'card';
    div.style.cssText = 'margin-top:12px;background:#f8faff;border:1px solid #dde8ff';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <input type="text" placeholder="Abschnittsname" style="font-weight:700;font-size:.9rem;border:none;background:transparent;flex:1;outline:none" id="ab_titel_${abId}" value="${escHtml(ab.titel||'')}">
        <button class="btn btn-danger btn-sm" onclick="document.getElementById('${abId}').remove()">✕</button>
      </div>
      <div id="felder_${abId}"></div>
      <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="vtAddFeld('${abId}')">+ Feld hinzufügen</button>
    `;
    container.appendChild(div);

    // Felder des Abschnitts befüllen
    (ab.felder || []).forEach(f => {
      const feldId = `feld_${abId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const fDiv = document.createElement('div');
      fDiv.id = feldId;
      fDiv.style.cssText = 'display:grid;grid-template-columns:1fr 130px 60px 32px;gap:6px;align-items:center;margin-bottom:6px';
      fDiv.innerHTML = `
        <input type="text" placeholder="Feldbezeichnung *" id="label_${feldId}" style="font-size:.82rem" value="${escHtml(f.label||'')}">
        <select id="typ_${feldId}" style="font-size:.82rem">
          <option value="text"${f.typ==='text'?' selected':''}>Texteingabe</option>
          <option value="textarea"${f.typ==='textarea'?' selected':''}>Mehrzeilig</option>
          <option value="select"${f.typ==='select'?' selected':''}>Auswahl</option>
          <option value="checkbox"${f.typ==='checkbox'?' selected':''}>Checkbox</option>
          <option value="signature"${f.typ==='signature'?' selected':''}>Unterschrift</option>
          <option value="upload"${f.typ==='upload'?' selected':''}>Datei-Upload</option>
        </select>
        <label style="font-size:.78rem;display:flex;align-items:center;gap:3px;cursor:pointer">
          <input type="checkbox" id="pfl_${feldId}"${f.pflicht?' checked':''}> Pflicht
        </label>
        <button class="btn btn-danger btn-sm" onclick="document.getElementById('${feldId}').remove()">✕</button>
      `;
      document.getElementById(`felder_${abId}`).appendChild(fDiv);
    });
  });

  // Titel + Buttons des Editor-Blocks umschalten
  document.getElementById('vt-card-titel').textContent = `✏️ Vorlage bearbeiten: ${escHtml(v.titel)}`;
  document.getElementById('vt-speichern-btn').textContent = '💾 Änderungen speichern';
  document.getElementById('vt-abbrechen-btn').style.display = '';

  // Nach oben scrollen zum Editor
  document.getElementById('vt-card-titel').scrollIntoView({ behavior:'smooth', block:'start' });
}

function vtBearbeitenAbbrechen() {
  vtEditId = null;
  document.getElementById('vt-titel').value = '';
  document.getElementById('vt-beschreibung').value = '';
  document.getElementById('vt-intervall').value = '12';
  document.getElementById('vt-abschnitte').innerHTML = '';
  vtAbschnittCount = 0;
  document.getElementById('vt-card-titel').textContent = '➕ Neue Schulungsvorlage erstellen';
  document.getElementById('vt-speichern-btn').textContent = '💾 Vorlage speichern';
  document.getElementById('vt-abbrechen-btn').style.display = 'none';
  document.getElementById('vt-msg').classList.remove('show');
}

async function vtLoeschen(id) {
  const v = SCHULUNG_VORLAGEN.find(v=>v.id===id);
  // Prüfen ob abgeschlossene Formulare existieren
  const zuws = zuweisungen.filter(z=>z.vorlagenId===id);
  const abgeschlosseneAnzahl = zuws.filter(z => formulare[z.id]?.abgeschlossen).length;
  if (abgeschlosseneAnzahl > 0) {
    alert(`⚠️ Vorlage "${v?.titel}" kann nicht gelöscht werden!\n\n${abgeschlosseneAnzahl} Zuweisung(en) haben bereits abgeschlossene Schulungsnachweise.\n\nAbgeschlossene Formulare dürfen nicht gelöscht werden (Dokumentationspflicht).`);
    return;
  }
  if (!confirm(`Vorlage "${v?.titel}" wirklich löschen?\n\nAcht: Alle Zuweisungen dieser Vorlage werden ebenfalls gelöscht!`)) return;
  try {
    // Zuweisungen dieser Vorlage löschen
    for (const z of zuws) {
      await fetch(`${SUPABASE_URL}/rest/v1/formulare?id=eq.${z.id}`,   { method:'DELETE', headers:SB.h });
      await fetch(`${SUPABASE_URL}/rest/v1/zuweisungen?id=eq.${z.id}`, { method:'DELETE', headers:SB.h });
      delete formulare[z.id];
    }
    zuweisungen = zuweisungen.filter(z=>z.vorlagenId!==id);
    // Vorlage löschen
    await fetch(`${SUPABASE_URL}/rest/v1/vorlagen?id=eq.${id}`, { method:'DELETE', headers:SB.h });
    SCHULUNG_VORLAGEN = SCHULUNG_VORLAGEN.filter(v=>v.id!==id);
    await sbAudit('LOESCHEN', `Vorlage "${v?.titel}" gelöscht`);
    showToast('🗑️ Vorlage gelöscht', '#dc2626');
    renderAdminVorlagen();
    renderAdminZuweisungen();
    renderAdminStats();
    renderAdminTenantTable();
    populateZuweisungsForm();
  } catch(e) { alert('Fehler: '+e.message); }
}

// ── VORLAGEN-EDITOR ──────────────────────────────────────────
let vtAbschnittCount = 0;
let vtSigFeldExtra   = 0;
let vtPdfFile        = null;
let vtEditId         = null; // null = Neu-Modus, string = Bearbeiten-Modus
let aktiveSprache    = 'de';

// Übersetzungstabelle
const UEBERSETZUNGEN = {
  de: { pflichtHinweis:'* Pflichtfelder', zwischenspeichern:'💾 Zwischenspeichern', abschliessen:'✅ Abschließen & PDF', richtung:'ltr' },
  en: { pflichtHinweis:'* Required fields', zwischenspeichern:'💾 Save draft', abschliessen:'✅ Complete & PDF', richtung:'ltr' },
  tr: { pflichtHinweis:'* Zorunlu alanlar', zwischenspeichern:'💾 Taslak kaydet', abschliessen:'✅ Tamamla & PDF', richtung:'ltr' },
  ar: { pflichtHinweis:'* الحقول المطلوبة', zwischenspeichern:'💾 حفظ مسودة', abschliessen:'✅ إكمال وPDF', richtung:'rtl' },
  es: { pflichtHinweis:'* Campos obligatorios', zwischenspeichern:'💾 Guardar borrador', abschliessen:'✅ Completar & PDF', richtung:'ltr' },
  ru: { pflichtHinweis:'* Обязательные поля', zwischenspeichern:'💾 Сохранить', abschliessen:'✅ Завершить & PDF', richtung:'ltr' }
};

// ── ABSCHNITT-ÜBERSETZUNGEN ──────────────────────────────────
const ABSCHNITT_UEBERSETZUNGEN = {
  // Formular-Metafelder
  'Mitarbeiterinformationen':     { en:'Employee Information',     tr:'Çalışan Bilgileri',      ar:'معلومات الموظف',           es:'Datos del empleado',         ru:'Данные сотрудника' },
  // Sicherheitsunterweisung Abschnitte
  'Chemie / Reinigungsmittel':    { en:'Chemicals / Cleaning Agents', tr:'Kimyasallar / Temizlik Maddeleri', ar:'المواد الكيميائية / منظفات', es:'Químicos / Productos de limpieza', ru:'Химия / Чистящие средства' },
  'Elektrische Geräte':           { en:'Electrical Devices',       tr:'Elektrikli Cihazlar',    ar:'الأجهزة الكهربائية',       es:'Equipos eléctricos',         ru:'Электрооборудование' },
  'Gefahrstoffe':                 { en:'Hazardous Substances',     tr:'Tehlikeli Maddeler',     ar:'المواد الخطرة',             es:'Sustancias peligrosas',      ru:'Опасные вещества' },
  'Leitern und Tritte':           { en:'Ladders and Steps',        tr:'Merdivenler ve Basamaklar', ar:'السلالم والدرجات',       es:'Escaleras y peldaños',       ru:'Лестницы и ступени' },
  'Alkohol & Drogen':             { en:'Alcohol & Drugs',          tr:'Alkol ve Uyuşturucu',    ar:'الكحول والمخدرات',         es:'Alcohol y drogas',           ru:'Алкоголь и наркотики' },
  'Datenschutz (DSGVO)':          { en:'Data Protection (GDPR)',   tr:'Veri Koruma (KVKK)',     ar:'حماية البيانات (GDPR)',     es:'Protección de datos (RGPD)', ru:'Защита данных (GDPR)' },
  'Fluchtwege & Brandschutz':     { en:'Escape Routes & Fire Protection', tr:'Kaçış Yolları ve Yangın Güvenliği', ar:'مسارات الإخلاء ومكافحة الحرائق', es:'Vías de evacuación y protección contra incendios', ru:'Пути эвакуации и пожарная безопасность' },
  'Erste Hilfe':                  { en:'First Aid',                tr:'İlk Yardım',             ar:'الإسعافات الأولية',        es:'Primeros auxilios',          ru:'Первая помощь' },
  'Schäden & Mängel':             { en:'Damage & Defects',         tr:'Hasarlar ve Eksiklikler', ar:'الأضرار والعيوب',          es:'Daños y defectos',           ru:'Повреждения и недостатки' },
  'Qualitätsmanagement (QM)':     { en:'Quality Management (QM)', tr:'Kalite Yönetimi',        ar:'إدارة الجودة',              es:'Gestión de calidad (GC)',     ru:'Управление качеством' },
  'Bestätigung':                  { en:'Confirmation',             tr:'Onay',                   ar:'التأكيد',                   es:'Confirmación',               ru:'Подтверждение' },
  'Unterschriften':               { en:'Signatures',               tr:'İmzalar',                ar:'التوقيعات',                 es:'Firmas',                     ru:'Подписи' },
  'Allgemeine Angaben':           { en:'General Information',      tr:'Genel Bilgiler',         ar:'المعلومات العامة',          es:'Datos generales',            ru:'Общие сведения' },
  'Inhalte':                      { en:'Contents',                 tr:'İçerikler',              ar:'المحتويات',                 es:'Contenidos',                 ru:'Содержание' },
};

// ── FELD-ÜBERSETZUNGEN ────────────────────────────────────────
const FELD_UEBERSETZUNGEN = {
  // ── Meta / Stammdaten ──
  'Name':                         { en:'Name',                     tr:'Ad',                     ar:'الاسم',                     es:'Nombre',                     ru:'Имя' },
  'Vollständiger Name':           { en:'Full Name',                tr:'Ad Soyad',               ar:'الاسم الكامل',              es:'Nombre completo',            ru:'Полное имя' },
  'Mitarbeiter':                  { en:'Employee',                 tr:'Çalışan',                ar:'الموظف',                    es:'Empleado',                   ru:'Сотрудник' },
  'Datum':                        { en:'Date',                     tr:'Tarih',                  ar:'التاريخ',                   es:'Fecha',                      ru:'Дата' },
  'Schulungsdatum':               { en:'Training date',            tr:'Eğitim tarihi',          ar:'تاريخ التدريب',             es:'Fecha de formación',         ru:'Дата обучения' },
  'Objekt / Bereich':             { en:'Object / Area',            tr:'Nesne / Alan',           ar:'الموقع / القسم',            es:'Objeto / Área',              ru:'Объект / Зона' },
  'Abteilung':                    { en:'Department',               tr:'Departman',              ar:'القسم',                     es:'Departamento',               ru:'Отдел' },
  'Position / Tätigkeit':         { en:'Position / Role',          tr:'Pozisyon / Görev',       ar:'المنصب / الوظيفة',          es:'Cargo / Actividad',          ru:'Должность / Деятельность' },
  // ── Unterschriften ──
  'Unterschrift Mitarbeiter':     { en:'Employee signature',       tr:'Çalışan imzası',         ar:'توقيع الموظف',              es:'Firma del empleado',         ru:'Подпись сотрудника' },
  'Unterschrift Trainer':         { en:'Trainer signature',        tr:'Eğitmen imzası',         ar:'توقيع المدرب',              es:'Firma del formador',         ru:'Подпись тренера' },
  'Unterschrift Vorgesetzter':    { en:'Supervisor signature',     tr:'Amir imzası',            ar:'توقيع المشرف',              es:'Firma del supervisor',       ru:'Подпись руководителя' },
  'Unterschrift Unterweisender':  { en:'Instructor signature',     tr:'Eğitici imzası',         ar:'توقيع المعلم',              es:'Firma del instructor',       ru:'Подпись инструктора' },
  // ── PSA / Allgemein ──
  'Ich habe die PSA erhalten und wurde eingewiesen':
    { en:'I received the PPE and was instructed', tr:'KKD teslim aldım ve eğitim aldım', ar:'تلقيت معدات الحماية الشخصية والتعليمات اللازمة', es:'Recibí el EPI y recibí instrucciones', ru:'Я получил СИЗ и прошёл инструктаж' },
  'Fluchtwege sind bekannt':      { en:'Escape routes are known',  tr:'Kaçış yolları bilinmektedir', ar:'مسارات الهروب معروفة',  es:'Las rutas de escape son conocidas', ru:'Пути эвакуации известны' },
  'Notruf 112 bekannt':           { en:'Emergency number 112 known', tr:'Acil numara 112 biliniyor', ar:'رقم الطوارئ 112 معروف', es:'Número de emergencia 112 conocido', ru:'Номер экстренной помощи 112 известен' },
  // ── Chemie / Reinigungsmittel ──
  'Nur zugelassene Reinigungsmittel verwenden':
    { en:'Use only approved cleaning agents',    tr:'Yalnızca onaylı temizlik maddeleri kullanın', ar:'استخدم فقط منظفات معتمدة', es:'Usar solo productos de limpieza autorizados', ru:'Использовать только разрешённые чистящие средства' },
  'Keine Reinigungsmittel mischen':
    { en:'Do not mix cleaning agents',           tr:'Temizlik maddelerini karıştırmayın', ar:'لا تخلط المنظفات',            es:'No mezclar productos de limpieza', ru:'Не смешивать чистящие средства' },
  'Dosierung nach Herstellerangaben einhalten':
    { en:'Follow manufacturer dosage instructions', tr:'Üretici talimatlarına göre dozajı uygulayın', ar:'اتبع تعليمات الجرعة من الشركة المصنعة', es:'Respetar la dosis indicada por el fabricante', ru:'Соблюдать дозировку согласно инструкции производителя' },
  'Schutzhandschuhe / PSA tragen':
    { en:'Wear protective gloves / PPE',         tr:'Koruyucu eldiven / KKD takın',    ar:'ارتدِ القفازات الواقية / معدات الحماية', es:'Usar guantes protectores / EPI', ru:'Надевать защитные перчатки / СИЗ' },
  'Chemikalien korrekt beschriften und lagern':
    { en:'Label and store chemicals correctly',  tr:'Kimyasalları doğru şekilde etiketleyip depolayın', ar:'ضع تسميات صحيحة وخزّن المواد الكيميائية بشكل صحيح', es:'Etiquetar y almacenar correctamente los productos químicos', ru:'Правильно маркировать и хранить химикаты' },
  // ── Elektrische Geräte ──
  'Geräte vor Benutzung auf Schäden prüfen':
    { en:'Check devices for damage before use',  tr:'Kullanmadan önce cihazlarda hasar olup olmadığını kontrol edin', ar:'افحص الأجهزة بحثاً عن أضرار قبل الاستخدام', es:'Revisar los equipos en busca de daños antes de usarlos', ru:'Проверять оборудование на наличие повреждений перед использованием' },
  'Vor Reinigung Stecker ziehen':
    { en:'Unplug before cleaning',               tr:'Temizlemeden önce fişi çekin',    ar:'افصل القابس قبل التنظيف',       es:'Desenchufar antes de limpiar',   ru:'Отключать от сети перед уборкой' },
  'Defekte Geräte nicht benutzen':
    { en:'Do not use defective devices',         tr:'Arızalı cihazları kullanmayın',   ar:'لا تستخدم الأجهزة المعطوبة',    es:'No usar equipos defectuosos',    ru:'Не использовать неисправное оборудование' },
  'Schäden sofort melden':
    { en:'Report damage immediately',            tr:'Hasarı derhal bildirin',           ar:'أبلغ عن الأضرار فوراً',          es:'Informar daños de inmediato',    ru:'Немедленно сообщать о повреждениях' },
  'Keine Reparaturen selbst durchführen':
    { en:'Do not carry out repairs yourself',    tr:'Onarımları kendiniz yapmayın',    ar:'لا تُجرِ الإصلاحات بنفسك',      es:'No realizar reparaciones por cuenta propia', ru:'Не проводить ремонт самостоятельно' },
  // ── Gefahrstoffe ──
  'Sicherheitsdatenblätter bekannt':
    { en:'Safety data sheets are known',         tr:'Güvenlik veri sayfaları bilinmektedir', ar:'صحائف بيانات السلامة معروفة', es:'Fichas de datos de seguridad conocidas', ru:'Паспорта безопасности известны' },
  'Warnsymbole verstanden':
    { en:'Warning symbols understood',           tr:'Uyarı sembolleri anlaşılmıştır',  ar:'رموز التحذير مفهومة',           es:'Símbolos de advertencia comprendidos', ru:'Предупредительные символы понятны' },
  'Gefahrstoffe ordnungsgemäß lagern':
    { en:'Store hazardous substances properly',  tr:'Tehlikeli maddeleri uygun şekilde depolayın', ar:'خزّن المواد الخطرة بشكل صحيح', es:'Almacenar correctamente las sustancias peligrosas', ru:'Хранить опасные вещества надлежащим образом' },
  'Bei Kontakt mit Haut/Augen sofort handeln':
    { en:'Act immediately on skin/eye contact',  tr:'Deri/göz temasında derhal harekete geçin', ar:'تصرف فوراً عند ملامسة الجلد أو العينين', es:'Actuar de inmediato en caso de contacto con piel u ojos', ru:'Немедленно действовать при контакте с кожей / глазами' },
  'Vorgesetzte bei Vorfällen informieren':
    { en:'Inform supervisors of incidents',      tr:'Olaylar hakkında amirlerinizi bilgilendirin', ar:'أبلغ المشرفين عن الحوادث',  es:'Informar a los superiores sobre incidentes', ru:'Информировать руководство об инцидентах' },
  // ── Leitern und Tritte ──
  'Nur geprüfte Leitern/Tritte verwenden':
    { en:'Use only inspected ladders/steps',     tr:'Yalnızca denetimli merdiven/basamak kullanın', ar:'استخدم فقط السلالم المعتمدة', es:'Usar solo escaleras/peldaños inspeccionados', ru:'Использовать только проверенные лестницы / ступени' },
  'Standsicherheit prüfen':
    { en:'Check stability',                      tr:'Stabiliteyi kontrol edin',        ar:'تحقق من الاستقرار',              es:'Comprobar la estabilidad',       ru:'Проверять устойчивость' },
  'Nicht auf oberste Stufe steigen':
    { en:'Do not stand on the top step',         tr:'En üst basamağa çıkmayın',        ar:'لا تقف على الدرجة العليا',       es:'No subir al escalón superior',   ru:'Не становиться на верхнюю ступень' },
  'Leitern nicht zweckentfremden':
    { en:'Do not misuse ladders',                tr:'Merdivenleri yanlış amaçla kullanmayın', ar:'لا تستخدم السلالم لأغراض غير مقصودة', es:'No usar las escaleras de forma indebida', ru:'Не использовать лестницы не по назначению' },
  // ── Alkohol & Drogen ──
  'Alkoholverbot während der Arbeitszeit bekannt':
    { en:'Alcohol ban during working hours is known', tr:'Çalışma saatlerinde alkol yasağı bilinmektedir', ar:'حظر الكحول أثناء ساعات العمل معروف', es:'Prohibición de alcohol durante el horario laboral conocida', ru:'Запрет на алкоголь в рабочее время известен' },
  'Kein Arbeitsantritt unter Alkohol/Drogen/Cannabis':
    { en:'No starting work under alcohol/drugs/cannabis', tr:'Alkol/uyuşturucu/esrar etkisi altında işe başlamayın', ar:'لا تبدأ العمل تحت تأثير الكحول أو المخدرات أو الحشيش', es:'No comenzar a trabajar bajo los efectos de alcohol/drogas/cannabis', ru:'Не приступать к работе под воздействием алкоголя / наркотиков / каннабиса' },
  'Medikamente mit Wirkung melden':
    { en:'Report medication with side effects',  tr:'Etkisi olan ilaçları bildirin',   ar:'أبلغ عن الأدوية ذات الآثار الجانبية', es:'Informar sobre medicamentos con efectos', ru:'Сообщать о приёме лекарств с побочными эффектами' },
  'Sicherheitsrisiken bewusst':
    { en:'Aware of safety risks',                tr:'Güvenlik riskleri hakkında bilinçli', ar:'على دراية بمخاطر السلامة',    es:'Consciente de los riesgos de seguridad', ru:'Осведомлён о рисках безопасности' },
  // ── Datenschutz ──
  'Vertrauliche Informationen schützen':
    { en:'Protect confidential information',     tr:'Gizli bilgileri koruyun',         ar:'احمِ المعلومات السرية',          es:'Proteger información confidencial', ru:'Защищать конфиденциальную информацию' },
  'Keine Fotos im Kundenobjekt':
    { en:'No photos in customer premises',       tr:'Müşteri alanında fotoğraf çekmeyin', ar:'لا تلتقط صوراً في مواقع العملاء', es:'No tomar fotos en instalaciones del cliente', ru:'Не фотографировать на объектах клиентов' },
  'Keine Daten weitergeben':
    { en:'Do not pass on data',                  tr:'Verileri paylaşmayın',            ar:'لا تنقل البيانات',               es:'No transmitir datos',            ru:'Не передавать данные' },
  'Dokumente nicht lesen oder mitnehmen':
    { en:'Do not read or take documents',        tr:'Belgeleri okumayın veya almayın', ar:'لا تقرأ الوثائق ولا تأخذها',    es:'No leer ni llevarse documentos', ru:'Не читать и не уtnehmen документы' },
  // ── Fluchtwege & Brandschutz ──
  'Fluchtwege freihalten':
    { en:'Keep escape routes clear',             tr:'Kaçış yollarını açık tutun',      ar:'ابقِ مسارات الهروب خالية',       es:'Mantener despejadas las vías de evacuación', ru:'Держать пути эвакуации свободными' },
  'Notausgänge/Sammelplätze bekannt':
    { en:'Emergency exits / assembly points known', tr:'Acil çıkışlar / toplanma alanları bilinmektedir', ar:'مخارج الطوارئ ونقاط التجمع معروفة', es:'Salidas de emergencia / puntos de encuentro conocidos', ru:'Аварийные выходы / места сбора известны' },
  'Feuerlöscher nicht blockieren':
    { en:'Do not block fire extinguishers',      tr:'Yangın söndürücüleri engellemeyin', ar:'لا تعيق وصول طفايات الحريق',   es:'No bloquear los extintores',     ru:'Не загораживать огнетушители' },
  'Brandmeldeeinrichtungen nicht verstellen':
    { en:'Do not obstruct fire alarm devices',   tr:'Yangın alarm cihazlarını engellemeyin', ar:'لا تعترض أجهزة إنذار الحريق', es:'No obstruir los dispositivos de alarma contra incendios', ru:'Не загораживать пожарную сигнализацию' },
  'Verhalten im Brandfall bekannt':
    { en:'Behaviour in case of fire is known',   tr:'Yangın durumunda davranış bilinmektedir', ar:'سلوك الحريق معروف',        es:'Comportamiento en caso de incendio conocido', ru:'Поведение при пожаре известно' },
  // ── Erste Hilfe ──
  'Erste-Hilfe-Kasten / Ersthelfer bekannt':
    { en:'First aid kit / first aider known',    tr:'İlk yardım çantası / ilkyardımcı bilinmektedir', ar:'حقيبة الإسعافات الأولية والمسعف الأول معروفان', es:'Botiquín / primer interviniente conocidos', ru:'Аптечка / ответственный за первую помощь известны' },
  'Notrufnummern bekannt':
    { en:'Emergency numbers known',              tr:'Acil numaralar bilinmektedir',    ar:'أرقام الطوارئ معروفة',           es:'Números de emergencia conocidos', ru:'Номера экстренных служб известны' },
  'Unfälle sofort melden':
    { en:'Report accidents immediately',         tr:'Kazaları derhal bildirin',        ar:'أبلغ عن الحوادث فوراً',          es:'Informar accidentes de inmediato', ru:'Немедленно сообщать о несчастных случаях' },
  'Notruf 112 bei schweren Unfällen':
    { en:'Emergency call 112 for serious accidents', tr:'Ciddi kazalar için 112 arayın', ar:'اتصل بـ 112 للحوادث الخطيرة',  es:'Llamar al 112 en caso de accidentes graves', ru:'Звонить 112 при серьёзных несчастных случаях' },
  // ── Schäden & Mängel ──
  'Schäden sofort melden':
    { en:'Report damage immediately',            tr:'Hasarı derhal bildirin',          ar:'أبلغ عن الأضرار فوراً',          es:'Informar daños de inmediato',    ru:'Немедленно сообщать о повреждениях' },
  'Keine Vertuschung von Fehlern':
    { en:'No concealment of errors',             tr:'Hataları gizlemeyiniz',           ar:'لا تُخفِ الأخطاء',               es:'No ocultar errores',             ru:'Не скрывать ошибки' },
  'Mängel und Gefahrenstellen melden':
    { en:'Report defects and hazardous locations', tr:'Kusurları ve tehlikeli alanları bildirin', ar:'أبلغ عن العيوب والمواقع الخطرة', es:'Informar defectos y zonas peligrosas', ru:'Сообщать о дефектах и опасных местах' },
  // ── Qualitätsmanagement ──
  'Reinigungspläne/Leistungsverzeichnisse einhalten':
    { en:'Follow cleaning plans / service specifications', tr:'Temizlik planlarını / hizmet özelliklerini takip edin', ar:'اتبع خطط التنظيف / مواصفات الخدمة', es:'Cumplir planes de limpieza / pliegos de prestaciones', ru:'Соблюдать планы уборки / технические условия' },
  'Arbeitsanweisungen befolgen':
    { en:'Follow work instructions',             tr:'Çalışma talimatlarına uyun',      ar:'اتبع تعليمات العمل',             es:'Seguir instrucciones de trabajo', ru:'Следовать рабочим инструкциям' },
  'Sorgfältig und ordentlich arbeiten':
    { en:'Work carefully and tidily',            tr:'Dikkatli ve düzenli çalışın',     ar:'اعمل بعناية ونظام',              es:'Trabajar con cuidado y orden',   ru:'Работать аккуратно и организованно' },
  'Kundenanforderungen beachten':
    { en:'Observe customer requirements',        tr:'Müşteri gereksinimlerine uyun',   ar:'الالتزام بمتطلبات العميل',       es:'Cumplir con los requisitos del cliente', ru:'Соблюдать требования клиента' },
  'Verbesserungsvorschläge weitergeben':
    { en:'Pass on improvement suggestions',      tr:'İyileştirme önerilerini iletin',  ar:'أرسل اقتراحات التحسين',          es:'Transmitir sugerencias de mejora', ru:'Передавать предложения по улучшению' },
  // ── Bestätigung ──
  'Unterweisung vollständig durchgeführt':
    { en:'Instruction fully completed',          tr:'Eğitim eksiksiz tamamlandı',      ar:'تم تنفيذ التعليمات بالكامل',     es:'Instrucción completamente realizada', ru:'Инструктаж проведён в полном объёме' },
  'Inhalte verstanden':
    { en:'Contents understood',                  tr:'İçerikler anlaşılmıştır',         ar:'تم فهم المحتويات',               es:'Contenidos comprendidos',        ru:'Содержание усвоено' },
  'Fragen wurden beantwortet':
    { en:'Questions were answered',              tr:'Sorular yanıtlandı',              ar:'تمت الإجابة على الأسئلة',        es:'Preguntas respondidas',          ru:'Вопросы были отвечены' },
};

function uebersetzeFeldLabel(label, sprache) {
  if (sprache === 'de') return label;
  return FELD_UEBERSETZUNGEN[label]?.[sprache] || label;
}

function uebersetzeAbschnitt(titel, sprache) {
  if (sprache === 'de') return titel;
  return ABSCHNITT_UEBERSETZUNGEN[titel]?.[sprache] || titel;
}

function spracheWaehlen(lang, btn) {
  aktiveSprache = lang;
  document.querySelectorAll('.sprach-btn').forEach(b => b.classList.remove('active-lang'));
  if (btn) btn.classList.add('active-lang');
  // RTL-Support für Arabisch
  const body = document.getElementById('formular-body');
  if (body) body.dir = UEBERSETZUNGEN[lang]?.richtung || 'ltr';
  // Buttons übersetzen
  const btnSave  = document.querySelector('.form-actions .btn-secondary');
  const btnDone  = document.querySelector('.form-actions .btn-success');
  const t = UEBERSETZUNGEN[lang] || UEBERSETZUNGEN.de;
  if (btnSave) btnSave.textContent = t.zwischenspeichern;
  if (btnDone) btnDone.textContent = t.abschliessen;
  // Formular neu rendern
  if (activeZuwId) oeffneFormularMitSprache(activeZuwId, lang);
}

function vtTypWechseln(typ) {
  document.getElementById('vt-felder-bereich').style.display = typ === 'felder' ? '' : 'none';
  document.getElementById('vt-pdf-bereich').style.display    = typ === 'pdf'    ? '' : 'none';
}

function vtPdfGewaehlt(input) {
  const file = input.files[0];
  if (!file) return;
  vtPdfFile = file;
  document.getElementById('vt-pdf-name').textContent = `✅ ${file.name} (${(file.size/1024/1024).toFixed(1)} MB)`;
  document.getElementById('vt-pdf-zone').classList.add('has-file');
  // "Felder erkennen"-Button einblenden
  document.getElementById('vt-pdf-erkennen-btn').style.display = '';
  document.getElementById('vt-pdf-erkenne-status').style.display = 'none';
}

// PDF-Text auslesen und in Felder-Editor übertragen
async function vtPdfFelderErkennen() {
  if (!vtPdfFile) return;
  const statusEl = document.getElementById('vt-pdf-erkenne-status');
  const btn = document.getElementById('vt-pdf-erkennen-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Analysiere PDF…';
  statusEl.style.display = '';
  statusEl.textContent = 'Lese Text aus PDF…';

  try {
    // pdf.js Worker-URL setzen
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } else {
      throw new Error('pdf.js nicht geladen');
    }

    const arrayBuffer = await vtPdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;

    // Text seitenweise extrahieren
    let alleZeilen = [];
    for (let p = 1; p <= numPages; p++) {
      statusEl.textContent = `Lese Seite ${p} von ${numPages}…`;
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Zeilen aus Items zusammenbauen (nach Y-Position gruppieren)
      const itemsNachY = {};
      content.items.forEach(item => {
        if (!item.str?.trim()) return;
        const y = Math.round(item.transform[5]);
        if (!itemsNachY[y]) itemsNachY[y] = [];
        itemsNachY[y].push(item.str.trim());
      });
      // Sortiert nach Y (oben=groß → unten=klein)
      Object.keys(itemsNachY).sort((a,b)=>b-a).forEach(y => {
        const zeile = itemsNachY[y].join(' ').trim();
        if (zeile) alleZeilen.push(zeile);
      });
    }

    // Text intelligent in Abschnitte und Felder aufteilen
    const abschnitte = vtPdfTextZuAbschnitte(alleZeilen);

    if (!abschnitte.length) {
      statusEl.textContent = '⚠️ Kein Text erkannt. Das PDF enthält möglicherweise nur Bilder.';
      btn.disabled = false;
      btn.textContent = '🔍 Felder aus PDF erkennen & bearbeiten';
      return;
    }

    // Auf "Eigene Felder" umschalten und Abschnitte in den Editor laden
    const radioFelder = document.querySelector('input[name="vt-typ"][value="felder"]');
    if (radioFelder) { radioFelder.checked = true; vtTypWechseln('felder'); }

    const container = document.getElementById('vt-abschnitte');
    container.innerHTML = '';
    vtAbschnittCount = 0;

    abschnitte.forEach(ab => {
      vtAbschnittCount++;
      const abId = `ab_${vtAbschnittCount}`;
      const div = document.createElement('div');
      div.id = abId;
      div.className = 'card';
      div.style.cssText = 'margin-top:12px;background:#f8faff;border:1px solid #dde8ff';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <input type="text" placeholder="Abschnittsname" style="font-weight:700;font-size:.9rem;border:none;background:transparent;flex:1;outline:none" id="ab_titel_${abId}" value="${escHtml(ab.titel)}">
          <button class="btn btn-danger btn-sm" onclick="document.getElementById('${abId}').remove()">✕</button>
        </div>
        <div id="felder_${abId}"></div>
        <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="vtAddFeld('${abId}')">+ Feld hinzufügen</button>
      `;
      container.appendChild(div);

      ab.felder.forEach(f => {
        const feldId = `feld_${abId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const fDiv = document.createElement('div');
        fDiv.id = feldId;
        fDiv.style.cssText = 'display:grid;grid-template-columns:1fr 130px 60px 32px;gap:6px;align-items:center;margin-bottom:6px';
        fDiv.innerHTML = `
          <input type="text" placeholder="Feldbezeichnung *" id="label_${feldId}" style="font-size:.82rem" value="${escHtml(f.label)}">
          <select id="typ_${feldId}" style="font-size:.82rem">
            <option value="text">Texteingabe</option>
            <option value="textarea">Mehrzeilig</option>
            <option value="select">Auswahl</option>
            <option value="checkbox"${f.typ==='checkbox'?' selected':''}>Checkbox</option>
            <option value="signature"${f.typ==='signature'?' selected':''}>Unterschrift</option>
            <option value="upload">Datei-Upload</option>
          </select>
          <label style="font-size:.78rem;display:flex;align-items:center;gap:3px;cursor:pointer">
            <input type="checkbox" id="pfl_${feldId}"${f.pflicht?' checked':''}> Pflicht
          </label>
          <button class="btn btn-danger btn-sm" onclick="document.getElementById('${feldId}').remove()">✕</button>
        `;
        document.getElementById(`felder_${abId}`).appendChild(fDiv);
      });
    });

    const gesamt = abschnitte.reduce((s,a)=>s+a.felder.length,0);
    statusEl.textContent = `✅ ${abschnitte.length} Abschnitte, ${gesamt} Felder erkannt. Bitte prüfen und ggf. anpassen.`;
    statusEl.style.color = '#16a34a';
    btn.textContent = '🔄 Erneut erkennen';
    btn.disabled = false;

    // Nach Abschnitte scrollen
    container.scrollIntoView({ behavior:'smooth', block:'start' });

  } catch(e) {
    statusEl.textContent = '❌ Fehler: ' + e.message;
    statusEl.style.color = '#dc2626';
    btn.disabled = false;
    btn.textContent = '🔍 Felder aus PDF erkennen & bearbeiten';
  }
}

// Rohe PDF-Zeilen intelligent in Abschnitte + Felder aufteilen
function vtPdfTextZuAbschnitte(zeilen) {
  // Schlüsselwörter die auf Abschnittsüberschriften hinweisen
  const ABSCHNITT_MUSTER = /^(\d+[\.\)]\s+|[A-ZÄÖÜ]{3,}|[A-Z][a-zäöüßA-ZÄÖÜ]+\s*[:\/])/;
  // Zeilen die wahrscheinlich Checkboxen/Prüfpunkte sind
  const CHECKBOX_MUSTER = /^[□✓✗●○■☐☑▪•\-–—]\s+|^\d+[\.\)]\s+/;
  // Sehr kurze oder nur-Zahlen-Zeilen ignorieren
  const IGNORIEREN = /^[\d\s\.\-\/:,]+$|^.{1,2}$|^(Seite|Page|Datum|Date)\s*\d*/i;

  const abschnitte = [];
  let aktAbschnitt = null;

  zeilen.forEach(zeile => {
    zeile = zeile.trim();
    if (!zeile || IGNORIEREN.test(zeile)) return;

    // Unterschrift-Zeilen → eigener Abschnitt am Ende
    if (/unterschrift|signatur|signature/i.test(zeile)) {
      if (!abschnitte.find(a=>a.titel==='Unterschriften')) {
        abschnitte.push({ titel:'Unterschriften', felder:[
          {label:'Unterschrift Mitarbeiter', typ:'signature', pflicht:true},
          {label:'Unterschrift Unterweisender', typ:'signature', pflicht:false}
        ]});
      }
      return;
    }

    // Erkennt Abschnittsüberschrift
    const istUeberschrift = ABSCHNITT_MUSTER.test(zeile) && zeile.length < 80 && !CHECKBOX_MUSTER.test(zeile);

    if (istUeberschrift && zeile.length > 5) {
      aktAbschnitt = { titel: zeile.replace(/^\d+[\.\)]\s+/, '').replace(/:$/, '').trim(), felder: [] };
      abschnitte.push(aktAbschnitt);
    } else {
      // Kein Abschnitt noch → Allgemein anlegen
      if (!aktAbschnitt) {
        aktAbschnitt = { titel: 'Allgemeine Informationen', felder: [] };
        abschnitte.push(aktAbschnitt);
      }
      // Typ bestimmen
      let typ = 'checkbox';
      let pflicht = false;
      let label = zeile.replace(/^[□✓✗●○■☐☑▪•\-–—]\s+/, '').trim();

      if (/name|datum|ort|uhrzeit|objekt|bereich|abteilung|unterschrift|geburtsdatum/i.test(label)) {
        typ = 'text'; pflicht = true;
      } else if (/bemerkung|notiz|anmerkung|beschreibung/i.test(label)) {
        typ = 'textarea';
      } else if (/unterschrift|signatur/i.test(label)) {
        typ = 'signature'; pflicht = true;
      }

      if (label.length > 3 && label.length < 200) {
        aktAbschnitt.felder.push({ label, typ, pflicht });
      }
    }
  });

  // Leere Abschnitte entfernen, max 30 Felder pro Abschnitt
  return abschnitte
    .filter(a => a.felder.length > 0)
    .map(a => ({ ...a, felder: a.felder.slice(0, 30) }));
}

function vtAddSigFeld() {
  vtSigFeldExtra++;
  const idx = `extra_${vtSigFeldExtra}`;
  const div = document.createElement('div');
  div.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:6px';
  div.innerHTML = `<input type="text" placeholder="Bezeichnung Unterschrift" id="sig${idx}" style="font-size:.82rem;flex:1"><label style="font-size:.78rem;white-space:nowrap"><input type="checkbox" id="sigpfl${idx}"> Pflicht</label><button class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">✕</button>`;
  document.getElementById('vt-sig-felder').appendChild(div);
}

async function vtSpeichern() {
  const titel     = document.getElementById('vt-titel').value.trim();
  const beschr    = document.getElementById('vt-beschreibung').value.trim();
  const intervall = parseInt(document.getElementById('vt-intervall').value) || 12;
  const typ       = document.querySelector('input[name="vt-typ"]:checked')?.value || 'felder';
  const msgEl     = document.getElementById('vt-msg');
  msgEl.classList.remove('show');
  if (!titel) { msgEl.textContent='Bitte einen Titel eingeben.'; msgEl.classList.add('show'); return; }

  let pdf_url = null, abschnitte = [];

  if (typ === 'pdf') {
    if (!vtPdfFile) { msgEl.textContent='Bitte ein PDF auswählen.'; msgEl.classList.add('show'); return; }
    try {
      const pfad = `vorlagen/${Date.now()}_${vtPdfFile.name.replace(/\s+/g,'_')}`;
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/schulung-vorlagen/${pfad}`, {
        method:'POST', headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/pdf'}, body:vtPdfFile
      });
      if (!r.ok) throw new Error(await r.text());
      pdf_url = `${SUPABASE_URL}/storage/v1/object/public/schulung-vorlagen/${pfad}`;
    } catch(e) { msgEl.textContent='PDF-Upload Fehler: '+e.message; msgEl.classList.add('show'); return; }
    // Unterschriftsfelder
    const sigFelder = [];
    document.querySelectorAll('#vt-sig-felder > div').forEach((div,i) => {
      const inp = div.querySelector('input[type="text"]'), pfl = div.querySelector('input[type="checkbox"]');
      if (inp?.value.trim()) sigFelder.push({id:`sig_${i}`,label:inp.value.trim(),typ:'signature',pflicht:pfl?.checked||false});
    });
    abschnitte = [{titel:'Unterschriften', felder:sigFelder}];
  } else {
    document.querySelectorAll('#vt-abschnitte > div[id^="ab_"]').forEach(abDiv => {
      const abId=abDiv.id, abTitel=document.getElementById(`ab_titel_${abId}`)?.value.trim()||'Abschnitt', felder=[];
      abDiv.querySelectorAll('div[id^="feld_"]').forEach(fDiv => {
        const fId=fDiv.id, label=document.getElementById(`label_${fId}`)?.value.trim();
        const ftyp=document.getElementById(`typ_${fId}`)?.value||'text', pfl=document.getElementById(`pfl_${fId}`)?.checked||false;
        if (label) felder.push({id:`f_${Date.now()}_${Math.random().toString(36).slice(2)}`,label,typ:ftyp,pflicht:pfl});
      });
      if (felder.length) abschnitte.push({titel:abTitel,felder});
    });
    if (!abschnitte.length) { msgEl.textContent='Bitte mindestens einen Abschnitt mit Feldern anlegen.'; msgEl.classList.add('show'); return; }
  }

  const id = `vorlage_${titel.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')}_${Date.now()}`;
  const vorlage = {id,titel,beschreibung:beschr,intervall_monate:intervall,abschnitte,typ,pdf_url:pdf_url||null};
  try {
    if (vtEditId) {
      // ── Bearbeiten-Modus: PATCH (Update in Supabase) ──
      const updates = { titel, beschreibung: beschr, intervall_monate: intervall, abschnitte, typ: 'felder' };
      await fetch(`${SUPABASE_URL}/rest/v1/vorlagen?id=eq.${vtEditId}`, {
        method: 'PATCH',
        headers: { ...SB.h, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(updates)
      });
      const idx = SCHULUNG_VORLAGEN.findIndex(v => v.id === vtEditId);
      if (idx !== -1) SCHULUNG_VORLAGEN[idx] = { ...SCHULUNG_VORLAGEN[idx], ...updates, intervallMonate: intervall };
      await sbAudit('VORLAGE_EDIT', `Vorlage "${titel}" bearbeitet`);
      showToast(`✅ Vorlage "${titel}" aktualisiert`, '#16a34a');
    } else {
      // ── Neu-Modus: POST ──
      await SB.post('vorlagen', vorlage);
      SCHULUNG_VORLAGEN.push({...vorlage,intervallMonate:intervall});
      await sbAudit('VORLAGE_NEU',`Neue Vorlage "${titel}" (${typ}) erstellt`);
      showToast(`✅ Vorlage "${titel}" gespeichert`,'#16a34a');
    }
    // Editor zurücksetzen
    vtEditId = null;
    document.getElementById('vt-titel').value=''; document.getElementById('vt-beschreibung').value='';
    document.getElementById('vt-intervall').value='12'; document.getElementById('vt-abschnitte').innerHTML='';
    document.getElementById('vt-pdf-name').textContent='PDF auswählen (max. 10 MB)';
    document.getElementById('vt-pdf-zone').classList.remove('has-file');
    document.getElementById('vt-pdf-input').value='';
    document.getElementById('vt-card-titel').textContent = '➕ Neue Schulungsvorlage erstellen';
    document.getElementById('vt-speichern-btn').textContent = '💾 Vorlage speichern';
    document.getElementById('vt-abbrechen-btn').style.display = 'none';
    vtPdfFile=null; vtAbschnittCount=0;
    document.querySelector('input[name="vt-typ"][value="felder"]').checked=true; vtTypWechseln('felder');
    renderAdminVorlagen(); populateZuweisungsForm();
  } catch(e) { msgEl.textContent='Fehler: '+e.message; msgEl.classList.add('show'); }
}

function vtAddAbschnitt() {
  vtAbschnittCount++;
  const id = `ab_${vtAbschnittCount}`;
  const div = document.createElement('div');
  div.id = id;
  div.className = 'card';
  div.style.cssText = 'margin-top:12px;background:#f8faff;border:1px solid #dde8ff';
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <input type="text" placeholder="Abschnittsname (z.B. Persönliche Angaben)" style="font-weight:700;font-size:.9rem;border:none;background:transparent;flex:1;outline:none" id="ab_titel_${id}">
      <button class="btn btn-danger btn-sm" onclick="document.getElementById('${id}').remove()">✕</button>
    </div>
    <div id="felder_${id}"></div>
    <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="vtAddFeld('${id}')">+ Feld hinzufügen</button>
  `;
  document.getElementById('vt-abschnitte').appendChild(div);
}

function vtAddFeld(abId) {
  const feldId = `feld_${abId}_${Date.now()}`;
  const div = document.createElement('div');
  div.id = feldId;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 130px 60px 32px;gap:6px;align-items:center;margin-bottom:6px';
  div.innerHTML = `
    <input type="text" placeholder="Feldbezeichnung *" id="label_${feldId}" style="font-size:.82rem">
    <select id="typ_${feldId}" style="font-size:.82rem">
      <option value="text">Texteingabe</option>
      <option value="textarea">Mehrzeilig</option>
      <option value="select">Auswahl</option>
      <option value="checkbox">Checkbox</option>
      <option value="signature">Unterschrift</option>
      <option value="upload">Datei-Upload</option>
    </select>
    <label style="font-size:.78rem;display:flex;align-items:center;gap:3px;cursor:pointer">
      <input type="checkbox" id="pfl_${feldId}"> Pflicht
    </label>
    <button class="btn btn-danger btn-sm" onclick="document.getElementById('${feldId}').remove()">✕</button>
  `;
  document.getElementById(`felder_${abId}`).appendChild(div);
}


function renderAdminZuweisungen() {
  // Filter-Dropdown für Unternehmen befüllen (einmalig)
  const tenantSel = document.getElementById('zuw-filter-tenant');
  if (tenantSel && tenantSel.options.length <= 1) {
    APP_TENANTS.forEach(t => {
      const o = document.createElement('option');
      o.value = t.id; o.textContent = t.name;
      tenantSel.appendChild(o);
    });
  }
  const filterTenant = tenantSel ? tenantSel.value : '';
  const filterStatus = document.getElementById('zuw-filter-status') ? document.getElementById('zuw-filter-status').value : '';

  let gefiltert = zuweisungen;
  if (filterTenant) gefiltert = gefiltert.filter(z => z.tenantId === filterTenant);
  if (filterStatus) gefiltert = gefiltert.filter(z => {
    const s = berechneStatus(z);
    if (filterStatus === 'gruen') return s === 'gruen';
    if (filterStatus === 'gelb')  return s === 'gelb';
    if (filterStatus === 'rot')   return s === 'rot';
    return true;
  });

  const rows = gefiltert.map(z => {
    const v=SCHULUNG_VORLAGEN.find(vl=>vl.id===z.vorlagenId), t=APP_TENANTS.find(tn=>tn.id===z.tenantId), s=berechneStatus(z);
    const isLP = z.vorlagenId === LERNPFAD_VORLAGE_ID;
    const isPsaga = z.vorlagenId === '__psaga__';
    const titel = isLP ? '📚 Lernpfad (29 Kapitel)' : isPsaga ? '🪝 PSAgA-Schulung' : (v ? escHtml(v.titel) : z.vorlagenId);
    const titelStyle = isLP ? 'color:#6b21a8;font-weight:700' : isPsaga ? 'color:#166534;font-weight:700' : '';
    return `<div class="schulung-item">
      <div>
        <div class="titel" style="${titelStyle}">${titel}</div>
        <div class="meta">${t?escHtml(t.name):z.tenantId} • Frist: ${z.frist||'–'} ${z.pflicht?'• <strong>Pflicht</strong>':''}</div>
      </div>
      <div class="right" style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        ${statusBadgeHtml(s)}
        <button class="btn btn-danger btn-sm" onclick="deleteZuweisung('${z.id}')">🗑</button>
      </div>
    </div>`;
  }).join('') || '<div class="empty-state"><div class="icon">📭</div><p>Keine Zuweisungen</p></div>';
  document.getElementById('admin-zuw-list').innerHTML = rows;
}
function populateZuweisungsForm() {
  // Tenant-Dropdown füllen
  document.getElementById('az-tenant').innerHTML = `<option value="">— alle Unternehmen —</option>` +
    APP_TENANTS.map(t=>`<option value="${t.id}">${escHtml(t.name)}</option>`).join('');
  document.getElementById('az-frist').value = '';
  // Vorlage-Picker initialisieren (Auswahl zurücksetzen)
  document.getElementById('az-vorlage').value = '';
  azVorlagePicker(true);
  azVorlagenListeRendern('');
}

// Vorlagen-Picker: true = offen (Suche), false = Auswahl anzeigen
function azVorlagePicker(oeffnen) {
  const picker = document.getElementById('az-vorlage-picker');
  const sel    = document.getElementById('az-vorlage-selected');
  if (oeffnen) {
    picker.style.display = '';
    sel.style.display = 'none';
    setTimeout(() => document.getElementById('az-vorlage-suche')?.focus(), 100);
  } else {
    picker.style.display = 'none';
    sel.style.display = 'flex';
  }
}

// Vorlage aus Picker wählen
function azVorlageWaehlen(id, titel) {
  document.getElementById('az-vorlage').value = id;
  const icon = id === LERNPFAD_VORLAGE_ID ? '' : '📄 ';
  document.getElementById('az-vorlage-selected-label').textContent = `${icon}${titel}`;
  azVorlagePicker(false);
  document.getElementById('az-vorlage-suche').value = '';
}

// Suche in Picker-Liste
function azVorlageSuche(wert) {
  azVorlagenListeRendern(wert);
}

// Vorlagen-Liste im Picker rendern (gefiltert)
function azVorlagenListeRendern(suche) {
  const el = document.getElementById('az-vorlage-liste');
  if (!el) return;
  const s = (suche || '').toLowerCase().trim();
  const gefiltert = s
    ? SCHULUNG_VORLAGEN.filter(v => v.titel.toLowerCase().includes(s) || (v.beschreibung||'').toLowerCase().includes(s))
    : SCHULUNG_VORLAGEN;

  // Lernpfad-Eintrag immer oben (außer wenn Suchbegriff nicht passt)
  const lernpfadMatch = !s || 'lernpfad'.includes(s) || '29 kapitel'.includes(s) || 'lernpfad gebäudereinigung'.includes(s);
  const lernpfadHtml = lernpfadMatch ? `
    <div onclick="azVorlageWaehlen('${LERNPFAD_VORLAGE_ID}','📚 Lernpfad (29 Kapitel)')"
      style="padding:11px 14px;cursor:pointer;border-bottom:1px solid #f0f2f5;transition:background .12s;background:#f5f3ff"
      onmouseover="this.style.background='#ede9fe'" onmouseout="this.style.background='#f5f3ff'">
      <div style="font-weight:600;font-size:.88rem;color:#6b21a8">📚 Lernpfad (29 Kapitel)</div>
      <div style="font-size:.76rem;color:#7c3aed;margin-top:2px">
        Säulen A–D &nbsp;·&nbsp; Gesetzliche Basis, Chemie/GHS, DSGVO, 4-Farben-System &nbsp;·&nbsp; inkl. Unterschrift
      </div>
    </div>` : '';

  const psagaMatch = !s || 'psaga'.includes(s) || 'absturz'.includes(s) || 'höhe'.includes(s) || 'psa'.includes(s) || 'schulung'.includes(s) || '22 modul'.includes(s);
  const psagaHtml = psagaMatch ? `
    <div onclick="azVorlageWaehlen('__psaga__','🪝 PSAgA-Schulung (22 Module)')"
      style="padding:11px 14px;cursor:pointer;border-bottom:1px solid #f0f2f5;transition:background .12s;background:#f0fdf4"
      onmouseover="this.style.background='#dcfce7'" onmouseout="this.style.background='#f0fdf4'">
      <div style="font-weight:600;font-size:.88rem;color:#166534">🪝 PSAgA-Schulung (22 Module)</div>
      <div style="font-size:.76rem;color:#16a34a;margin-top:2px">
        Kapitel 00–21 &nbsp;·&nbsp; Audio + Quiz &nbsp;·&nbsp; DGUV 112-198 &nbsp;·&nbsp; Teilnahmebescheinigung nach Abschluss
      </div>
    </div>` : '';

  if (!gefiltert.length && !lernpfadMatch && !psagaMatch) {
    el.innerHTML = `<div style="padding:16px;text-align:center;color:#9ca3af;font-size:.85rem">${s ? `Keine Vorlage für „${escHtml(s)}"` : 'Keine Vorlagen vorhanden'}</div>`;
    return;
  }

  el.innerHTML = lernpfadHtml + psagaHtml + gefiltert.map((v, i) => `
    <div onclick="azVorlageWaehlen('${v.id}','${escHtml(v.titel).replace(/'/g,'&#39;')}')"
      style="padding:11px 14px;cursor:pointer;border-bottom:1px solid #f0f2f5;transition:background .12s;${i===gefiltert.length-1?'border-bottom:none':''}"
      onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''">
      <div style="font-weight:600;font-size:.88rem;color:#1a3a5c">📄 ${escHtml(v.titel)}</div>
      <div style="font-size:.76rem;color:#6b7280;margin-top:2px">
        🔁 ${v.intervallMonate||v.intervall_monate||'–'} Monate &nbsp;·&nbsp;
        📑 ${(v.abschnitte||[]).length} Abschnitte &nbsp;·&nbsp;
        🔢 ${(v.abschnitte||[]).reduce((s,a)=>s+a.felder.length,0)} Felder
        ${v.beschreibung ? `&nbsp;·&nbsp; ${escHtml(v.beschreibung)}` : ''}
      </div>
    </div>`).join('');
}
async function createZuweisung() {
  const vorlagenId=document.getElementById('az-vorlage').value, tenantSel=document.getElementById('az-tenant').value;
  const frist=document.getElementById('az-frist').value, pflicht=document.getElementById('az-pflicht').checked;
  const msgEl=document.getElementById('az-msg');
  if (!vorlagenId) { msgEl.textContent='Bitte eine Schulungsvorlage auswählen.'; msgEl.style.color='#dc2626'; msgEl.classList.add('show'); return; }
  if (!frist) { msgEl.textContent='Bitte eine Frist angeben.'; msgEl.style.color='#dc2626'; msgEl.classList.add('show'); return; }
  const tenants = tenantSel ? [tenantSel] : APP_TENANTS.map(t=>t.id);
  const ts = Date.now();

  // Duplikat-Check: Vorlage bereits diesem Tenant zugewiesen?
  const duplikate = tenants.filter(tid =>
    zuweisungen.some(z => z.tenantId === tid && z.vorlagenId === vorlagenId)
  );
  if (duplikate.length > 0) {
    const namen = duplikate.map(tid => {
      const t = APP_TENANTS.find(t => t.id === tid);
      return t ? t.name : tid;
    }).join(', ');
    msgEl.textContent = `⚠️ Diese Vorlage ist bereits zugewiesen an: ${namen}. Bitte zuerst die bestehende Zuweisung löschen.`;
    msgEl.style.color = '#dc2626';
    msgEl.classList.add('show');
    return;
  }

  const neu = tenants.map((tid, i) => ({ id:`zuw_${ts}_${i}_${Math.random().toString(36).slice(2,6)}`, vorlage_id:vorlagenId, tenant_id:tid, frist, pflicht }));
  try {
    await SB.post('zuweisungen', neu);
    neu.forEach(z => zuweisungen.push({ id:z.id, vorlagenId:z.vorlage_id, tenantId:z.tenant_id, frist:z.frist, pflicht:z.pflicht }));
    const label = vorlagenId === LERNPFAD_VORLAGE_ID ? 'Lernpfad (29 Kapitel)' : vorlagenId;
    await sbAudit('ZUWEISUNG', `Vorlage "${label}" → ${tenants.join(',')} (Frist: ${frist})`);
    msgEl.textContent=`${tenants.length} Zuweisung(en) erstellt.`; msgEl.style.color='';
    msgEl.classList.add('show'); setTimeout(()=>msgEl.classList.remove('show'),3000);
    renderAdminZuweisungen(); renderAdminStats(); renderAdminTenantTable();
  } catch(e) { msgEl.textContent='Fehler: '+e.message; msgEl.style.color='#dc2626'; msgEl.classList.add('show'); }
}
async function deleteZuweisung(id) {
  // Sicherheitsprüfung: abgeschlossene Formulare NICHT löschen
  const form = formulare[id];
  if (form && form.abgeschlossen) {
    showToast('⚠️ Zuweisung kann nicht gelöscht werden — abgeschlossener Nachweis vorhanden (Dokumentationspflicht)', '#7f1d1d');
    return;
  }
  const hatEintrag = form && form.gestartet;
  const warnung = hatEintrag
    ? 'Zuweisung löschen?<br><br>⚠️ Es gibt bereits einen begonnenen Eintrag. Dieser wird ebenfalls gelöscht.'
    : 'Zuweisung wirklich löschen?';
  showConfirmModal(warnung, async () => {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/zuweisungen?id=eq.${id}`, { method:'DELETE', headers:SB.h });
      await fetch(`${SUPABASE_URL}/rest/v1/formulare?id=eq.${id}`,   { method:'DELETE', headers:SB.h });
      zuweisungen = zuweisungen.filter(z=>z.id!==id);
      delete formulare[id];
      await sbAudit('LOESCHEN',`Zuweisung ${id} gelöscht`);
      showToast('🗑 Zuweisung gelöscht', '#6b7280');
      renderAdminZuweisungen(); renderAdminStats(); renderAdminTenantTable();
    } catch(e) { showToast('Fehler: '+e.message, '#dc2626'); }
  }, { jaLabel: 'Ja, löschen' });
}

// ══════════════════════════════════════════════════════════════
//  UNTERNEHMEN DASHBOARD
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
//  MITARBEITERLISTE (Verantwortlicher)
// ══════════════════════════════════════════════════════════════
// ── MITARBEITER: AKTIV/PASSIV/ARCHIV ───────────────────────────
async function mitarbeiterToggleAktiv(userId, jetztAktiv) {
  const text = jetztAktiv
    ? 'Mitarbeiter auf <strong>PASSIV</strong> setzen?<br>Er erhält dann keine neuen Schulungen.'
    : 'Mitarbeiter wieder auf <strong>AKTIV</strong> setzen?';
  showConfirmModal(text, async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { ...SB.h, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ aktiv: !jetztAktiv })
      });
      if (!r.ok) throw new Error(await r.text());
      sbAudit(jetztAktiv ? 'MITARBEITER_PASSIV' : 'MITARBEITER_AKTIV', { userId, tenantId: currentUser.tenantId });
      showToast(jetztAktiv ? '⏸ Mitarbeiter auf Passiv gesetzt' : '▶ Mitarbeiter wieder aktiv', '#2563eb');
      renderMitarbeiterListe();
    } catch(e) {
      showToast('Fehler: ' + e.message, '#dc2626');
    }
  }, { jaLabel: jetztAktiv ? 'Ja, deaktivieren' : 'Ja, aktivieren', jaColor: jetztAktiv ? '#b45309' : '#16a34a' });
}

async function mitarbeiterArchivieren(userId, name) {
  showConfirmModal(`Mitarbeiter <strong>${escHtml(name)}</strong> wirklich archivieren?<br><br>Er wird aus der aktiven Liste entfernt und im Archiv gespeichert.`, async () => {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { ...SB.h, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ archiviert: true, archiviert_am: new Date().toISOString(), aktiv: false })
      });
      if (!r.ok) throw new Error(await r.text());
      sbAudit('MITARBEITER_ARCHIVIERT', { userId, name, tenantId: currentUser.tenantId });
      showToast('📦 Mitarbeiter archiviert', '#6b7280');
      renderMitarbeiterListe();
    } catch(e) {
      showToast('Fehler: ' + e.message, '#dc2626');
    }
  }, { jaLabel: 'Ja, archivieren' });
}

async function renderMitarbeiterListe() {
  const section = document.getElementById('sub-mitarbeiter-section');
  const listEl  = document.getElementById('sub-mitarbeiter-list');
  const countEl = document.getElementById('sub-mitarbeiter-count');

  // Nur für Verantwortliche anzeigen
  if (!currentUser || currentUser.role !== 'verantwortlicher') {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  listEl.innerHTML = '<div style="color:#6b7280;font-size:.88rem;padding:12px 0">⏳ Mitarbeiter werden geladen …</div>';

  // Filter-State ermitteln (Standard: nur aktive)
  const filterEl = document.getElementById('ma-filter-select');
  const filter = filterEl ? filterEl.value : 'aktiv';

  try {
    // Alle nicht-archivierten Mitarbeiter laden (oder alle inkl. archiviert je nach Filter)
    let query = `tenant_id=eq.${encodeURIComponent(currentUser.tenantId)}&role=eq.mitarbeiter&order=name.asc`;
    if (filter === 'aktiv')          query += '&aktiv=eq.true&archiviert=eq.false';
    else if (filter === 'passiv')    query += '&aktiv=eq.false&archiviert=eq.false';
    else if (filter === 'archiviert') query += '&archiviert=eq.true';
    else if (filter.startsWith('bereich:')) {
      const b = filter.slice('bereich:'.length);
      query += `&archiviert=eq.false&bereich=eq.${encodeURIComponent(b)}`;
    }
    // 'alle' = kein weiterer Filter

    const mitarbeiter = await SB.get('users', query);

    // Filter-Zeile rendern (Header-Bereich)
    const headerEl = document.getElementById('sub-mitarbeiter-header');
    if (headerEl) {
      const currentVal = filter;
      // Eindeutige Bereiche aus geladener Mitarbeiterliste sammeln
      const bereiche = [...new Set((mitarbeiter||[]).map(m=>m.bereich).filter(Boolean))].sort();
      const bereichOptions = bereiche.map(b =>
        `<option value="bereich:${escHtml(b)}" ${currentVal===`bereich:${b}`?'selected':''}>${escHtml(b)}</option>`
      ).join('');
      headerEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <select id="ma-filter-select" onchange="renderMitarbeiterListe()"
            style="border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:.8rem;background:#fff;cursor:pointer">
            <option value="aktiv"      ${currentVal==='aktiv'?'selected':''}>👤 Aktive</option>
            <option value="passiv"     ${currentVal==='passiv'?'selected':''}>⏸ Passive</option>
            <option value="archiviert" ${currentVal==='archiviert'?'selected':''}>📦 Archivierte</option>
            <option value="alle"       ${currentVal==='alle'?'selected':''}>🔍 Alle</option>
            ${bereiche.length ? `<optgroup label="── Bereich ──">${bereichOptions}</optgroup>` : ''}
          </select>
        </div>`;
    }

    if (!mitarbeiter || mitarbeiter.length === 0) {
      const labels = { aktiv: 'aktive', passiv: 'passive', archiviert: 'archivierte', alle: '' };
      countEl.textContent = `0 ${labels[filter]||''} Mitarbeiter`.trim();
      listEl.innerHTML = `
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;text-align:center;color:#6b7280;font-size:.9rem">
          <div style="font-size:1.8rem;margin-bottom:8px">👤</div>
          Keine ${labels[filter]||''} Mitarbeiter vorhanden.<br>
          ${filter==='aktiv'?'<span style="font-size:.82rem">Nutzen Sie „➕ Mitarbeiter anlegen\" oder „👥 Importieren\".</span>':''}
        </div>`;
      return;
    }

    countEl.textContent = mitarbeiter.length + ' Mitarbeiter';

    // Alle Zuweisungen des Tenants
    const meineZuws = zuweisungen.filter(z => z.tenantId === currentUser.tenantId);

    // Lernpfad-Unterschriften aller Mitarbeiter dieses Tenants laden (Batch)
    let lpUnterschriften = {};
    try {
      const lpRows = await SB.select('lernpfad_unterschriften',
        `tenant_id=eq.${encodeURIComponent(currentUser.tenantId)}`);
      if (lpRows && lpRows.length) {
        lpRows.forEach(r => { lpUnterschriften[r.user_id] = r; });
        // Globalen Cache befüllen damit berechneStatus() Lernpfad-Status kennt
        window._lpUntCache = lpUnterschriften;
      }
    } catch(e) { /* ignorieren, kein Datenverlust */ }

    // Pro Mitarbeiter: Ampelstatus aus seinen abgeschlossenen Formularen ableiten
    const rows = mitarbeiter.map(m => {
      // SICHERHEIT: Nur Formulare aus Zuweisungen des eigenen Tenants zählen
      // Zuweisungen die für diesen MA relevant sind (global oder persönlich zugewiesen)
      const maZuws = meineZuws.filter(z =>
        !z.zugewiesenAn || z.zugewiesenAn === m.id
      );
      const mFormulare = Object.entries(formulare)
        .filter(([zuwId, f]) => {
          const zuw = maZuws.find(z => z.id === zuwId);
          return zuw && zuw.tenantId === currentUser.tenantId && f.abgeschlossenVon === m.id;
        });

      const gesamtZuws  = maZuws.length;
      const abgeschl    = mFormulare.filter(([,f]) => f.abgeschlossen).length;
      const gestartet   = mFormulare.filter(([,f]) => f.gestartet && !f.abgeschlossen).length;
      const offen       = Math.max(0, gesamtZuws - abgeschl - gestartet);

      // Pro Zuweisung: Status für diesen Mitarbeiter ermitteln (nur relevante Zuweisungen)
        const unterweisungsZeilen = maZuws.map(z => {
        const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
        const isLP = z.vorlagenId === LERNPFAD_VORLAGE_ID;
        const titel = isLP ? '📚 Lernpfad (29 Kapitel)' : (v ? v.titel : z.vorlagenId);
        const f = formulare[z.id] || {};
        const fristDate = z.frist ? new Date(z.frist) : null;
        const heute = new Date();
        let dot, ampelBg, ampelBorder;
        if (f.abgeschlossen && f.abgeschlossenVon === m.id) {
          dot = '🟢'; ampelBg = '#f0fdf4'; ampelBorder = '#86efac';
        } else if (fristDate && fristDate < heute) {
          dot = '🔴'; ampelBg = '#fef2f2'; ampelBorder = '#fca5a5';
        } else if (f.gestartet && f.abgeschlossenVon === m.id) {
          dot = '🟡'; ampelBg = '#fffbeb'; ampelBorder = '#fde68a';
        } else if (fristDate) {
          const tage = Math.ceil((fristDate - heute) / 86400000);
          dot = tage <= 14 ? '🔴' : '🟡';
          ampelBg = tage <= 14 ? '#fef2f2' : '#fffbeb';
          ampelBorder = tage <= 14 ? '#fca5a5' : '#fde68a';
        } else {
          dot = '🔴'; ampelBg = '#fef2f2'; ampelBorder = '#fca5a5';
        }
        const fristAnzeige = z.frist ? `Termin bis: ${datumStr(z.frist)}` : 'Kein Termin';
        return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;
                  margin-bottom:4px;border-radius:6px;
                  background:${ampelBg};border:1px solid ${ampelBorder}">
          <span style="font-size:1.1rem;flex-shrink:0">${dot}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:.8rem;font-weight:700;color:#1e3a5f;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(titel)}</div>
            <div style="font-size:.72rem;color:#6b7280">${fristAnzeige}</div>
            ${f.gestartet && !f.abgeschlossen && f.abgeschlossenVon !== m.id ? `<div style="margin-top:3px;font-size:.68rem;color:#92400e;font-weight:600">✏️ In Bearbeitung</div>` : ''}
          </div>
        </div>`;
      }).join('');

      let ampel = 'gruen';
      if (m.archiviert) {
        ampel = 'archiv';
      } else if (!m.aktiv) {
        ampel = 'passiv';
      } else if (gesamtZuws === 0) {
        ampel = 'grau';
      } else if (abgeschl === gesamtZuws) {
        ampel = 'gruen';
      } else if (offen > 0) {
        const hatUeberfaellig = meineZuws.some(z => {
          const f = formulare[z.id] || {};
          if (f.abgeschlossen) return false;
          const fristDate = z.frist ? new Date(z.frist) : null;
          return fristDate && fristDate < new Date();
        });
        ampel = hatUeberfaellig ? 'rot' : 'gelb';
      } else {
        ampel = 'gelb';
      }

      const ampelFarben = {
        gruen:  { bg: '#f0fdf4', border: '#86efac', dot: '🟢', label: 'Alle abgeschlossen',  text: '#166534' },
        gelb:   { bg: '#fffbeb', border: '#fde68a', dot: '🟡', label: 'In Bearbeitung',       text: '#92400e' },
        rot:    { bg: '#fef2f2', border: '#fca5a5', dot: '🔴', label: 'Offen / Überfällig',   text: '#991b1b' },
        grau:   { bg: '#f9fafb', border: '#e5e7eb', dot: '⚪', label: 'Keine Schulungen',      text: '#6b7280' },
        passiv: { bg: '#f5f3ff', border: '#c4b5fd', dot: '⏸', label: 'Passiv',                text: '#6d28d9' },
        archiv: { bg: '#f3f4f6', border: '#d1d5db', dot: '📦', label: 'Archiviert',            text: '#4b5563' }
      };
      const c = ampelFarben[ampel];
      const istAktiv     = !m.archiviert && m.aktiv !== false;
      const istPassiv    = !m.archiviert && m.aktiv === false;
      const istArchiviert = !!m.archiviert;

      // Aktionsbuttons je nach Status
      const btnToggle = !istArchiviert ? `
        <button onclick="event.stopPropagation();mitarbeiterToggleAktiv('${m.id}',${istAktiv})"
          style="font-size:.7rem;padding:3px 8px;border-radius:5px;border:1px solid #c4b5fd;background:#f5f3ff;color:#6d28d9;cursor:pointer;white-space:nowrap">
          ${istAktiv ? '⏸ Passiv' : '▶ Aktiv'}
        </button>` : '';
      const btnArchiv = !istArchiviert ? `
        <button onclick="event.stopPropagation();mitarbeiterArchivieren('${m.id}','${escHtml(m.name).replace(/'/g,"\\\'")}')"
          style="font-size:.7rem;padding:3px 8px;border-radius:5px;border:1px solid #d1d5db;background:#f9fafb;color:#6b7280;cursor:pointer;white-space:nowrap;margin-top:3px">
          📦 Archivieren
        </button>` : `<span style="font-size:.7rem;color:#9ca3af">Archiviert: ${m.archiviert_am ? dateStr(m.archiviert_am) : '–'}</span>`;
      const btnQr = `<button onclick="event.stopPropagation();qrLoginOeffnen('${m.id}')"
          style="font-size:.7rem;padding:3px 8px;border-radius:5px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;cursor:pointer;white-space:nowrap;margin-top:3px"
          title="QR-Login-Code generieren">🔑 QR-Login</button>`;
      const btnHistorie = `<button onclick="event.stopPropagation();zeigeSchulungshistorie('${m.id}')"
          style="font-size:.7rem;padding:3px 8px;border-radius:5px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;cursor:pointer;white-space:nowrap;margin-top:3px"
          title="Schulungshistorie anzeigen">📋 Historie</button>`;

      // ── Lernpfad-Unterschrift-Status für diesen Mitarbeiter ──
      const lpUnt = lpUnterschriften[m.id];
      let lpUntBlock = '';
      if (!istArchiviert) {
        if (lpUnt && lpUnt.unterzeichnet_am) {
          const maDatum = new Date(lpUnt.unterzeichnet_am).toLocaleString('de-DE',
            { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
          if (lpUnt.verantwortlicher_am) {
            // Beide haben unterzeichnet
            const vDatum = new Date(lpUnt.verantwortlicher_am).toLocaleString('de-DE',
              { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
            lpUntBlock = `
              <div style="margin-top:7px;padding:8px 10px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:7px">
                <div style="font-size:.72rem;font-weight:700;color:#0f5132;margin-bottom:4px">✅ Lernpfad vollständig unterzeichnet ${lpUnt.durchgang > 1 ? `(Durchgang ${lpUnt.durchgang})` : ''}</div>
                <div style="font-size:.7rem;color:#166534;line-height:1.6">
                  👤 MA: <b>${escHtml(lpUnt.vollname)}</b> · ${maDatum}<br>
                  🧑‍💼 Verantw.: <b>${escHtml(lpUnt.verantwortlicher_name)}</b> · ${vDatum}
                </div>
                <button onclick="event.stopPropagation();lernpfadNeuStartenOeffnen('${m.id}')"
                  style="margin-top:7px;font-size:.72rem;padding:4px 12px;border-radius:6px;border:1px solid #7c3aed;background:#f5f3ff;color:#7c3aed;cursor:pointer;font-weight:600;width:100%">
                  🔄 Neuen Durchgang starten
                </button>
              </div>`;
          } else {
            // Nur MA hat unterzeichnet — Verantwortlicher noch nicht
            lpUntBlock = `
              <div style="margin-top:7px;padding:8px 10px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:7px">
                <div style="font-size:.72rem;font-weight:700;color:#92400e;margin-bottom:4px">⚠️ Lernpfad: MA unterzeichnet — Ihre Gegenzeichnung fehlt</div>
                <div style="font-size:.7rem;color:#374151;margin-bottom:6px">
                  👤 <b>${escHtml(lpUnt.vollname)}</b> · ${maDatum}
                </div>
                <button onclick="event.stopPropagation();lernpfadVerantwortlicherUnterzeichnen('${m.id}')"
                  style="font-size:.75rem;padding:5px 12px;border-radius:6px;border:none;background:#0f5132;color:#fff;cursor:pointer;font-weight:700;width:100%">
                  ✍️ Jetzt gegenzeichnen
                </button>
              </div>`;
          }
        }
        // Hat MA noch gar nicht unterzeichnet → kein Block (nicht belasten)
      }

      return `
        <div style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;margin-bottom:8px;
                    ${istArchiviert?'opacity:0.7':''}">
          <!-- ── Kompakte Kopfzeile (immer sichtbar) — Klick klappt Details aus ── -->
          <div onclick="maNDetailToggle('${m.id}')"
               style="padding:10px 14px;display:flex;align-items:center;gap:12px;cursor:pointer;user-select:none">
            <div style="font-size:1.2rem;flex-shrink:0">${c.dot}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:700;font-size:.92rem;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${escHtml(m.name)}
              </div>
              ${(m.standort||m.bereich) ? `<div style="font-size:.72rem;color:#6b7280;margin-top:1px">
                ${m.standort ? `📍 ${escHtml(m.standort)}` : ''}${m.standort&&m.bereich?' · ':''}${m.bereich ? `🏷 ${escHtml(m.bereich)}` : ''}
              </div>` : `<div style="font-size:.72rem;color:#9ca3af">${escHtml(m.email)}</div>`}
            </div>
            <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:3px">
              <div style="font-size:.78rem;font-weight:700;color:${c.text}">${c.label}</div>
              ${gesamtZuws > 0 && !istArchiviert ? `<div style="font-size:.68rem;color:#6b7280" title="Abgeschlossen · Bald fällig · Überfällig">
                🟢 ${abgeschl} &nbsp;🟡 ${gestartet} &nbsp;🔴 ${offen}
              </div>` : ''}
              <div style="font-size:.7rem;color:#9ca3af" id="ma-pfeil-${m.id}">▼</div>
            </div>
          </div>

          <!-- ── Ausklapp-Details (standardmäßig verborgen) ── -->
          <div id="ma-detail-${m.id}" style="display:none;border-top:1px solid ${c.border}">
            <!-- Aktionsbuttons -->
            <div style="padding:8px 14px;display:flex;gap:6px;flex-wrap:wrap;background:rgba(255,255,255,.5)">
              ${btnToggle}${btnArchiv}${btnQr}${btnHistorie}
            </div>
            <!-- Schulungszeilen -->
            ${gesamtZuws > 0 && !istArchiviert ? `
            <div style="padding:8px 14px;border-top:1px solid rgba(0,0,0,.05)">
              ${unterweisungsZeilen}
            </div>` : ''}
            <!-- Lernpfad-Block -->
            ${lpUntBlock ? `<div style="padding:0 14px 10px">${lpUntBlock}</div>` : ''}
          </div>
        </div>
      `;
    });

    listEl.innerHTML = rows.join('');

    // Filter-Select wiederherstellen (nach innerHTML-Neuaufbau)
    const newFilter = document.getElementById('ma-filter-select');
    if (newFilter) newFilter.value = filter;

  } catch(e) {
    listEl.innerHTML = `<div style="color:#dc2626;font-size:.85rem;padding:8px">Fehler beim Laden: ${escHtml(e.message)}</div>`;
  }
}

// ── Mitarbeiterkarte aufklappen/zuklappen ────────────────────
function maNDetailToggle(userId) {
  const detail = document.getElementById(`ma-detail-${userId}`);
  const pfeil  = document.getElementById(`ma-pfeil-${userId}`);
  if (!detail) return;
  const offen = detail.style.display === 'none' || detail.style.display === '';
  detail.style.display = offen ? 'block' : 'none';
  if (pfeil) pfeil.textContent = offen ? '▲' : '▼';
}

// ── Intervall einer Zuweisung ändern (Verantwortlicher) ──────
async function zuwIntervallAendern(zuwId, wert) {
  const intervall = wert ? parseInt(wert) : null;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/zuweisungen?id=eq.${zuwId}`, {
      method: 'PATCH',
      headers: { ...SB.h, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ intervall_monate: intervall })
    });
    const z = zuweisungen.find(z => z.id === zuwId);
    if (z) z.intervallMonate = intervall;
    showToast(intervall
      ? `🔁 Intervall auf ${intervall} Monat${intervall > 1 ? 'e' : ''} gesetzt`
      : '🔁 Kein automatisches Intervall', '#1a3a5c');
    renderSubDashboard();
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

// ── Zuweisung neu starten: altes Formular archivieren + neue Frist setzen ──
async function zuwNeuStarten(zuwId) {
  const z = zuweisungen.find(zw => zw.id === zuwId);
  const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z?.vorlagenId);
  const f = formulare[zuwId] || {};
  if (!f.abgeschlossen) { showToast('Schulung noch nicht abgeschlossen.', '#dc2626'); return; }

  const intervall = z.intervallMonate || v?.intervallMonate || null;
  let neueFrist = '';
  if (intervall && f.abgeschlossenAm) {
    const d = new Date(f.abgeschlossenAm);
    d.setMonth(d.getMonth() + parseInt(intervall));
    neueFrist = d.toISOString().split('T')[0];
  } else {
    // Kein Intervall → Datum-Picker Modal (kein prompt — funktioniert nicht auf Android)
    const defaultDatum = new Date(Date.now() + 365*86400000).toISOString().split('T')[0];
    const eingabe = await zuwNeuStartenDatumModal(v?.titel || 'Schulung', defaultDatum);
    if (!eingabe) return;
    neueFrist = eingabe;
  }

  // Bestätigung per eigenem Modal (kein confirm — Android-Problem)
  const ok = await zuwNeuStartenBestaetigungModal(v?.titel || 'Schulung', neueFrist);
  if (!ok) return;

  try {
    const neueZuwId = `z_${z.tenantId}_${z.vorlagenId}_${Date.now()}`;
    // zugewiesen_an aus Original-Zuweisung übernehmen (individuelle Bindung erhalten!)
    const zugewiesenAn = z.zugewiesenAn || null;
    await fetch(`${SUPABASE_URL}/rest/v1/zuweisungen`, {
      method: 'POST',
      headers: { ...SB.h, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        id: neueZuwId,
        vorlage_id: z.vorlagenId,
        tenant_id: z.tenantId,
        frist: neueFrist,
        pflicht: z.pflicht,
        intervall_monate: z.intervallMonate || null,
        zugewiesen_an: zugewiesenAn   // ← individuelle Bindung erhalten!
      })
    });
    zuweisungen.push({
      id: neueZuwId,
      vorlagenId: z.vorlagenId,
      tenantId: z.tenantId,
      frist: neueFrist,
      pflicht: z.pflicht,
      intervallMonate: z.intervallMonate || null,
      zugewiesenAn: zugewiesenAn
    });
    formulare[neueZuwId] = {};
    await sbAudit('SCHULUNG_NEU_GESTARTET', `Neue Runde: ${v?.titel} (Frist: ${neueFrist})${zugewiesenAn ? ` für MA ${zugewiesenAn}` : ''}`);
    showToast(`✅ Neue Schulungsrunde gestartet — Frist: ${neueFrist}`, '#16a34a');
    renderSubDashboard();
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

// Hilfsfunktionen für Datum-Eingabe und Bestätigung ohne prompt/confirm
function zuwNeuStartenDatumModal(titel, defaultDatum) {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:20px;width:100%;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,.25)">
        <div style="font-size:.95rem;font-weight:700;color:#1e3a5f;margin-bottom:6px">📅 Neue Frist festlegen</div>
        <div style="font-size:.82rem;color:#6b7280;margin-bottom:12px">${escHtml(titel)}</div>
        <input type="date" id="_zns_datum" value="${defaultDatum}"
          style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:.95rem;margin-bottom:14px;box-sizing:border-box">
        <div style="display:flex;gap:10px">
          <button id="_zns_ab" style="flex:1;background:#f3f4f6;border:none;padding:11px;border-radius:9px;font-size:.9rem;font-weight:600;cursor:pointer">Abbrechen</button>
          <button id="_zns_ok" style="flex:2;background:#1e3a5f;color:#fff;border:none;padding:11px;border-radius:9px;font-size:.9rem;font-weight:700;cursor:pointer">✅ Bestätigen</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#_zns_ab').onclick = () => { document.body.removeChild(modal); resolve(null); };
    modal.querySelector('#_zns_ok').onclick = () => {
      const val = modal.querySelector('#_zns_datum').value;
      document.body.removeChild(modal);
      resolve(val || null);
    };
  });
}

function zuwNeuStartenBestaetigungModal(titel, frist) {
  return new Promise(resolve => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    const datumAnzeige = new Date(frist + 'T00:00').toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});
    modal.innerHTML = `
      <div style="background:#fff;border-radius:14px;padding:20px;width:100%;max-width:380px;box-shadow:0 8px 32px rgba(0,0,0,.25)">
        <div style="font-size:.95rem;font-weight:700;color:#1e3a5f;margin-bottom:8px">🔄 Neue Schulungsrunde starten?</div>
        <div style="font-size:.85rem;color:#374151;margin-bottom:6px">📋 ${escHtml(titel)}</div>
        <div style="font-size:.85rem;color:#374151;margin-bottom:14px">📅 Neue Frist: <strong>${datumAnzeige}</strong></div>
        <div style="font-size:.78rem;color:#6b7280;margin-bottom:14px">Das bisherige abgeschlossene Formular bleibt im Archiv erhalten.</div>
        <div style="display:flex;gap:10px">
          <button id="_znsb_ab" style="flex:1;background:#f3f4f6;border:none;padding:11px;border-radius:9px;font-size:.9rem;font-weight:600;cursor:pointer">Abbrechen</button>
          <button id="_znsb_ok" style="flex:2;background:#16a34a;color:#fff;border:none;padding:11px;border-radius:9px;font-size:.9rem;font-weight:700;cursor:pointer">✅ Jetzt starten</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#_znsb_ab').onclick = () => { document.body.removeChild(modal); resolve(false); };
modal.querySelector('#_znsb_ok').onclick = () => { document.body.removeChild(modal); resolve(true); };
  });
}

function renderSubDashboard() {
  const tenant = APP_TENANTS.find(t=>t.id===currentUser.tenantId);
  document.getElementById('sub-username').textContent   = currentUser.name;
  document.getElementById('sub-tenantname').textContent = tenant ? tenant.name : '';
  // Titel je nach Rolle
  const titelEl = document.getElementById('sub-page-title');
  if (titelEl) {
    titelEl.textContent = currentUser.role === 'mitarbeiter'
      ? '📋 Meine Schulungen'
      : '📋 Schulungsmanagement Mitarbeiter';
  }
  const meineZuws = zuweisungen.filter(z=>z.tenantId===currentUser.tenantId);
  const stati = meineZuws.map(z=>berechneStatus(z));
  const g=stati.filter(s=>s==='gruen').length;
  const y=stati.filter(s=>s==='gelb').length;
  const r=stati.filter(s=>s==='rot').length;
  const gr=stati.filter(s=>s==='grau').length;
  const isMitarbeiterStats = currentUser.role === 'mitarbeiter';
  document.getElementById('sub-stats').innerHTML = `
    <div class="stat-tile gruen"><div class="zahl">${g}</div><div class="label">Abgeschlossen</div></div>
    <div class="stat-tile gelb"><div class="zahl">${y}</div><div class="label">Bald fällig</div></div>
    <div class="stat-tile rot"><div class="zahl">${r}</div><div class="label">Überfällig</div></div>
    ${isMitarbeiterStats ? '' : `<div class="stat-tile grau"><div class="zahl">${gr}</div><div class="label">Ausstehend</div></div>`}`;
  // Buttons für Mitarbeiter- und Verantwortlicher-Rolle ausblenden
  const isMitarbeiter = currentUser.role === 'mitarbeiter';
  const isVerantwortlicher = currentUser.role === 'verantwortlicher';
  const maBtns = document.getElementById('sub-ma-buttons');
  const maImport = document.getElementById('sub-ma-import');
  const kalBtns = document.getElementById('sub-kalender-buttons');
  if (maBtns) maBtns.style.display = isMitarbeiter ? 'none' : '';
  // Mitarbeiter-Import nur für firma und admin sichtbar
  const kannImportieren = currentUser.role === 'firma' || currentUser.role === 'admin';
  if (maImport) maImport.style.display = kannImportieren ? '' : 'none';
  if (kalBtns) {
    if (isMitarbeiter) {
      // Für Mitarbeiter: weder Kalender noch Anleitung anzeigen
      kalBtns.style.display = 'none';
    } else {
      kalBtns.style.display = '';
      kalBtns.style.gap = '10px';
    }
  }

  // Kalender rendern
  renderSubKalender();
  // Lernpfad initialisieren (lädt Fortschritt aus DB/localStorage)
  lernpfadInitialisieren();
  // PSAgA Schulungsmodule anzeigen
  psagaSchulungenInit();
  // Mitarbeiterliste rendern (nur für Verantwortliche)
  renderMitarbeiterListe();

  // Schulungsliste für Mitarbeiter: eigene Zuweisungen kompakt anzeigen
  const slEl = document.getElementById('sub-schulungen-list');
  if (slEl) {
    if (isMitarbeiter && meineZuws.length) {
      slEl.innerHTML = `
        <div style="margin-bottom:8px;font-size:.82rem;font-weight:700;color:#1e3a5f">📋 Meine Schulungen</div>` +
        meineZuws.map(z => {
          const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
          const isLP = z.vorlagenId === LERNPFAD_VORLAGE_ID;
          const titel = isLP ? '📚 Lernpfad (29 Kapitel)' : (v ? escHtml(v.titel) : z.vorlagenId);
          const s = berechneStatus(z);
          const farbe = {gruen:'#f0fdf4',gelb:'#fffbeb',rot:'#fef2f2',grau:'#f9fafb'}[s]||'#f9fafb';
          const border = {gruen:'#86efac',gelb:'#fde68a',rot:'#fca5a5',grau:'#e5e7eb'}[s]||'#e5e7eb';
          const dot = {gruen:'🟢',gelb:'🟡',rot:'🔴',grau:'⚪'}[s]||'⚪';
          const fristText = z.frist ? `Frist: ${datumStr(z.frist)}` : 'Kein Termin';
          return `<div onclick="${isLP ? 'lernpfadToggle()' : `oeffneFormular('${z.id}')`}"
            style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;
                   background:${farbe};border:1px solid ${border};border-radius:9px;cursor:pointer">
            <span style="font-size:1.1rem;flex-shrink:0">${dot}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:.85rem;font-weight:700;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${titel}</div>
              <div style="font-size:.72rem;color:#6b7280">${fristText}</div>
            </div>
            <span style="font-size:.8rem;color:#9ca3af">›</span>
          </div>`;
        }).join('');
    } else {
      slEl.innerHTML = '';
    }
  }
  if (!meineZuws.length) return;
}

function unterweisungenToggle() {
  // Funktion bleibt als Stub um JS-Fehler bei alten Referenzen zu vermeiden
}




function unterweisungenToggle() {
  // Stub — Button wurde entfernt
}

// ══════════════════════════════════════════════════════════════
//  FORMULAR
// ══════════════════════════════════════════════════════════════
function oeffneFormular(zuwId) {
  // Lernpfad-Zuweisung → direkt zum Lernpfad-Abschnitt scrollen
  const zuwCheck = zuweisungen.find(z => z.id === zuwId);
  if (zuwCheck && zuwCheck.vorlagenId === LERNPFAD_VORLAGE_ID) {
    // Lernpfad aufklappen falls noch zu
    const cont = document.getElementById('lernpfad-container');
    if (cont && cont.style.display !== 'block') lernpfadToggle();
    // Zum Lernpfad-Button scrollen
    const lpBtn = document.getElementById('btn-lernpfad-pfeil')?.closest('[id^="btn-lernpfad"]') ||
                  document.getElementById('lernpfad-container');
    if (lpBtn) lpBtn.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  // Passiv/archivierte Mitarbeiter dürfen keine neuen Formulare starten
  if (currentUser && currentUser.role === 'mitarbeiter') {
    const userAktiv = currentUser.aktiv !== false;
    const userArchiviert = !!currentUser.archiviert;
    if (userArchiviert) {
      showToast('📦 Archivierte Mitarbeiter können keine Formulare öffnen.', '#6b7280');
      return;
    }
    if (!userAktiv) {
      const form = formulare[zuwId] || {};
      if (!form.abgeschlossen) {
        showToast('⏸ Passive Mitarbeiter können keine neuen Schulungen starten.', '#6d28d9');
        return;
      }
    }
  }
  aktiveSprache = 'de';
  document.querySelectorAll('.sprach-btn').forEach(b => b.classList.remove('active-lang'));
  const deBtn = document.querySelector('.sprach-btn[data-lang="de"]');
  if (deBtn) deBtn.classList.add('active-lang');
  oeffneFormularMitSprache(zuwId, 'de');
}

function oeffneFormularMitSprache(zuwId, sprache) {
  activeZuwId = zuwId;
  if (sprache === 'de') { sigPads={}; uploadFiles={}; }

  const zuw     = zuweisungen.find(z=>z.id===zuwId);
  const vorlage = SCHULUNG_VORLAGEN.find(v=>v.id===zuw.vorlagenId);
  const form    = formulare[zuwId]||{};
  const status  = berechneStatus(zuw);
  const readOnly = !!form.abgeschlossen;
  const t = UEBERSETZUNGEN[sprache] || UEBERSETZUNGEN.de;

  document.getElementById('formular-titel').textContent      = vorlage?vorlage.titel:zuwId;
  document.getElementById('formular-user-info').textContent  = currentUser.name;
  document.getElementById('formular-status-bar').innerHTML   = `
    ${statusBadgeHtml(status)}
    <span style="font-size:.8rem;color:#6b7280;margin-left:8px">Frist: ${zuw.frist||'–'}</span>
    ${readOnly?'<span style="font-size:.8rem;color:#16a34a;margin-left:8px">🔒 Schreibgeschützt</span>':''}`;

  const btnArea = document.querySelector('#screen-formular .form-actions');
  if (btnArea) {
    btnArea.style.display = readOnly ? 'none' : 'flex';
    const btnSave = btnArea.querySelector('.btn-secondary');
    const btnDone = btnArea.querySelector('.btn-success');
    if (btnSave) btnSave.textContent = t.zwischenspeichern;
    if (btnDone) btnDone.textContent = t.abschliessen;

    // PSAgA-Zuweisung: Abschließen-Button sperren bis mindestens ein Modul bestanden
    const isPsaga = zuw.vorlagenId === '__psaga__';
    const hinweis = document.getElementById('psaga-schulung-hinweis');
    if (hinweis) hinweis.style.display = 'none'; // Reset
    if (btnDone && isPsaga && !readOnly) {
      const userId = currentUser && currentUser.userId || '';
      const modulBestanden = PSAGA_MODULE.some(m =>
        localStorage.getItem(`psaga_bestanden_${m.id}_${userId}`)
      );
      btnDone.disabled = !modulBestanden;
      btnDone.title = modulBestanden ? '' : 'Bitte zuerst die PSAgA-Schulungsmodule absolvieren';
      btnDone.style.opacity = modulBestanden ? '1' : '0.4';
      btnDone.style.cursor = modulBestanden ? 'pointer' : 'not-allowed';
      if (hinweis) hinweis.style.display = modulBestanden ? 'none' : '';
    }
  }

  const body = document.getElementById('formular-body');
  body.dir = t.richtung || 'ltr';

  // PDF-Vorlage oder Felder anzeigen
  if (vorlage?.typ === 'pdf' && vorlage?.pdf_url) {
    let html = `<p class="pflicht-hinweis"><span>*</span> ${t.pflichtHinweis.replace('* ','')}</p>`;
    // PDF einbetten
    html += `
      <div style="margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #dde2e9">
        <div style="background:#1a3a5c;color:#fff;padding:8px 14px;font-size:.82rem;font-weight:600">📄 ${escHtml(vorlage.titel)}</div>
        <iframe src="https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(vorlage.pdf_url)}" style="width:100%;height:70vh;border:none;display:block" title="${escHtml(vorlage.titel)}" id="pdf-iframe-main"></iframe>
        <div style="padding:6px 14px;background:#f0f4ff;font-size:.75rem;color:#4b5563;display:flex;align-items:center;gap:8px">
          📄 PDF wird nicht angezeigt?
          <a href="${vorlage.pdf_url}" target="_blank" style="color:#1a3a5c;font-weight:600;text-decoration:underline">Direkt öffnen ↗</a>
        </div>
        <div style="padding:8px 14px;background:#f8faff;font-size:.75rem;color:#6b7280">
          📄 ${escHtml(vorlage.titel)}
        </div>
      </div>`;
    // Unterschriftsfelder darunter
    html += `<div class="form-section"><div class="form-section-title">✍️ ${uebersetzeAbschnitt('Unterschriften', sprache)}</div>`;
    (vorlage.abschnitte||[]).forEach(ab => {
      ab.felder.forEach(feld => {
        const label = uebersetzeFeldLabel(feld.label, sprache);
        html += renderFeld({...feld, label}, (form.felder||{})[feld.id]||'', readOnly);
      });
    });
    html += '</div>';
    body.innerHTML = html;
  } else {
    // Standard-Felder-Formular
    let html = `<p class="pflicht-hinweis"><span>*</span> ${t.pflichtHinweis.replace('* ','')}</p>`;
    if (vorlage) vorlage.abschnitte.forEach(ab => {
      html += `<div class="form-section"><div class="form-section-title">${escHtml(uebersetzeAbschnitt(ab.titel, sprache))}</div>`;
      ab.felder.forEach(feld => {
        const label = uebersetzeFeldLabel(feld.label, sprache);
        html += renderFeld({...feld, label}, (form.felder||{})[feld.id]||'', readOnly);
      });
      html += '</div>';
    });
    body.innerHTML = html;
  }

  document.getElementById('formular-fehler').classList.remove('show');
  document.getElementById('formular-success').classList.remove('show');

  // Sig-Pads + Upload-Events nur beim ersten Laden (de) initialisieren
  if (!readOnly && vorlage && sprache === 'de') {
    sigPads={}; uploadFiles={};
  }
  if (!readOnly && vorlage) {
    vorlage.abschnitte.forEach(ab => {
      ab.felder.filter(f=>f.typ==='signature').forEach(f=>initSigPad(f.id,(form.felder||{})[f.id]));
      ab.felder.filter(f=>f.typ==='upload').forEach(f=>{
        const inp=document.getElementById(`upload_${f.id}`);
        if(inp) inp.addEventListener('change',e=>{
          const file=e.target.files[0];
          if(file){uploadFiles[f.id]=file;const zone=document.getElementById(`zone_${f.id}`);if(zone){zone.classList.add('has-file');zone.querySelector('p').textContent=file.name;}}
        });
      });
    });
  }

  showScreen('screen-formular');
}

function renderFeld(feld, val, readOnly) {
  const pfl = feld.pflicht ? `<span class="pflicht-mark">*</span>` : '';
  if (feld.typ==='text')     return `<div class="form-group"><label>${escHtml(feld.label)} ${pfl}</label><input type="text" id="feld_${feld.id}" value="${escHtml(val)}" placeholder="${escHtml(feld.placeholder||'')}" ${readOnly?'readonly':''}></div>`;
  if (feld.typ==='textarea') return `<div class="form-group"><label>${escHtml(feld.label)} ${pfl}</label><textarea id="feld_${feld.id}" ${readOnly?'readonly':''}>${escHtml(val)}</textarea></div>`;
  if (feld.typ==='select') {
    const opts=(feld.optionen||[]).map(o=>`<option value="${escHtml(o)}" ${val===o?'selected':''}>${escHtml(o)}</option>`).join('');
    return `<div class="form-group"><label>${escHtml(feld.label)} ${pfl}</label><select id="feld_${feld.id}" ${readOnly?'disabled':''}><option value="">— bitte wählen —</option>${opts}</select></div>`;
  }
  if (feld.typ==='checkbox') return `<div class="form-group"><div class="checkbox-field ${val?'checked':''}"><input type="checkbox" id="feld_${feld.id}" ${val?'checked':''} ${readOnly?'disabled':''} onchange="this.closest('.checkbox-field').classList.toggle('checked',this.checked)"><label for="feld_${feld.id}">${escHtml(feld.label)} ${pfl}</label></div></div>`;
  if (feld.typ==='signature') {
    if (readOnly&&val) return `<div class="form-group"><label>${escHtml(feld.label)}</label><img src="${val}" style="max-width:300px;border:1px solid #dde2e9;border-radius:8px;display:block"></div>`;
    return `<div class="form-group"><label>${escHtml(feld.label)} ${pfl}</label><div class="sig-container"><canvas id="sig_${feld.id}" class="sig-canvas"></canvas></div><div class="sig-actions"><button type="button" class="btn btn-secondary btn-sm" onclick="clearSig('${feld.id}')">✕ Löschen</button><span style="font-size:.75rem;color:#6b7280">Mit Finger oder Maus unterschreiben</span></div></div>`;
  }
  if (feld.typ==='upload') {
    if (readOnly&&val) return `<div class="form-group"><label>${escHtml(feld.label)}</label><span style="color:#16a34a;font-size:.88rem">✓ ${escHtml(val)}</span></div>`;
    return `<div class="form-group"><label>${escHtml(feld.label)} ${pfl}</label><div class="upload-zone" id="zone_${feld.id}" onclick="document.getElementById('upload_${feld.id}').click()"><div class="upload-icon">📎</div><p>Tippen zum Hochladen (PDF, Bild)</p><input type="file" id="upload_${feld.id}" accept=".pdf,.png,.jpg,.jpeg"></div></div>`;
  }
  return '';
}

// ── SIG PAD ──────────────────────────────────────────────────
function initSigPad(feldId, existingDataUrl) {
  const canvas=document.getElementById(`sig_${feldId}`); if(!canvas) return;
  // Canvas nach einem Frame initialisieren, damit offsetWidth korrekt ist (CSS muss zuerst rendern)
  requestAnimationFrame(() => {
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.offsetWidth  || 320;
    const h   = canvas.offsetHeight || 150;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle='#0047CC'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round';
    if (existingDataUrl) { const img=new Image(); img.onload=()=>ctx.drawImage(img,0,0,w,h); img.src=existingDataUrl; }
    let drawing=false, lastX=0, lastY=0;
    function getPos(e) { const rect=canvas.getBoundingClientRect(), src=e.touches?e.touches[0]:e; return {x:(src.clientX-rect.left), y:(src.clientY-rect.top)}; }
    function start(e) { drawing=true; const p=getPos(e); lastX=p.x; lastY=p.y; e.preventDefault(); }
    function move(e)  { if(!drawing) return; e.preventDefault(); const p=getPos(e); ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(p.x,p.y); ctx.stroke(); lastX=p.x; lastY=p.y; }
    function end()    { drawing=false; }
    canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',move); canvas.addEventListener('mouseup',end); canvas.addEventListener('mouseleave',end);
    canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false}); canvas.addEventListener('touchend',end,{passive:false});
    sigPads[feldId]={canvas,ctx,w,h,dpr};
  });
}
function clearSig(feldId) { const p=sigPads[feldId]; if(!p) return; p.ctx.clearRect(0,0,p.w||p.canvas.offsetWidth||320, p.h||p.canvas.offsetHeight||150); }
function isSigEmpty(feldId) {
  const p=sigPads[feldId]; if(!p) return true;
  const b=document.createElement('canvas'); b.width=p.canvas.width; b.height=p.canvas.height;
  return p.canvas.toDataURL()===b.toDataURL();
}
function getSigDataUrl(feldId) { const p=sigPads[feldId]; if(!p||isSigEmpty(feldId)) return null; return p.canvas.toDataURL('image/png'); }

// ── FORMULAR SPEICHERN ───────────────────────────────────────
function formularSpeichern(abschliessen) {
  const zuw=zuweisungen.find(z=>z.id===activeZuwId); if(!zuw) return;
  const vorlage=SCHULUNG_VORLAGEN.find(v=>v.id===zuw.vorlagenId);
  const fehlEl=document.getElementById('formular-fehler'); fehlEl.classList.remove('show');
  const felder={}, fehler=[];
  vorlage.abschnitte.forEach(ab => {
    ab.felder.forEach(feld => {
      if (feld.typ==='text'||feld.typ==='textarea') { const el=document.getElementById(`feld_${feld.id}`); if(el) felder[feld.id]=el.value.trim(); if(feld.pflicht&&abschliessen&&!felder[feld.id]) fehler.push(feld.label); }
      else if (feld.typ==='select')   { const el=document.getElementById(`feld_${feld.id}`); if(el) felder[feld.id]=el.value; if(feld.pflicht&&abschliessen&&!felder[feld.id]) fehler.push(feld.label); }
      else if (feld.typ==='checkbox') { const el=document.getElementById(`feld_${feld.id}`); if(el) felder[feld.id]=el.checked; if(feld.pflicht&&abschliessen&&!felder[feld.id]) fehler.push(feld.label); }
      else if (feld.typ==='signature'){ const dUrl=getSigDataUrl(feld.id), ex=(formulare[activeZuwId]||{}).felder?.[feld.id]; felder[feld.id]=dUrl||ex||null; if(feld.pflicht&&abschliessen&&!felder[feld.id]) fehler.push(feld.label+' (Unterschrift)'); }
      else if (feld.typ==='upload')   { const file=uploadFiles[feld.id], ex=(formulare[activeZuwId]||{}).felder?.[feld.id]; felder[feld.id]=file?file.name:(ex||null); if(feld.pflicht&&abschliessen&&!felder[feld.id]) fehler.push(feld.label); }
    });
  });
  if (fehler.length) { fehlEl.textContent='Bitte ausfüllen: '+fehler.join(', '); fehlEl.classList.add('show'); return; }
  if (abschliessen) { abschlussCallback=()=>doAbschluss(felder); document.getElementById('modal-abschluss').classList.add('active'); }
  else { saveFormularToDB(felder, false); }
}

async function saveFormularToDB(felder, abschliessen, abgeschlossenAm, abgeschlossenVon) {
  const data = {
    id:                activeZuwId,
    zuweisung_id:      activeZuwId,
    felder:            felder,
    gestartet:         true,
    abgeschlossen:     abschliessen,
    abgeschlossen_am:  abschliessen ? abgeschlossenAm : null,
    abgeschlossen_von: abschliessen ? abgeschlossenVon : null,
    gespeichert_am:    now()
  };
  await SB.upsert('formulare', data);
  formulare[activeZuwId] = {
    felder, gestartet:true, abgeschlossen:abschliessen,
    abgeschlossenAm: abschliessen?abgeschlossenAm:null,
    abgeschlossenVon: abschliessen?abgeschlossenVon:null
  };
  if (!abschliessen) {
    await sbAudit('ZWISCHENSPEICHERN', `Schulung gespeichert (${activeZuwId})`);
    const succ=document.getElementById('formular-success');
    succ.textContent='✅ In Datenbank gespeichert!'; succ.classList.add('show');
    setTimeout(()=>succ.classList.remove('show'),2500);
  }
}

async function doAbschluss(felder) {
  // Schutz gegen Doppelklick
  const abschlussBtn = document.querySelector('.btn-abschluss-bestaetigen, [onclick*="doAbschluss"]');
  if (abschlussBtn) { abschlussBtn.disabled = true; abschlussBtn.textContent = 'Wird gespeichert…'; }
  const zuw=zuweisungen.find(z=>z.id===activeZuwId), vorlage=SCHULUNG_VORLAGEN.find(v=>v.id===zuw.vorlagenId);
  const tenant=APP_TENANTS.find(t=>t.id===zuw.tenantId);
  const ts=now();
  closeModal();
  try {
  await saveFormularToDB(felder, true, ts, currentUser.userId);
  await sbAudit('ABSCHLUSS', `Schulung "${vorlage.titel}" abgeschlossen (${zuw.tenantId})`);
  // Push-Benachrichtigung senden
  pushSchulungsAbschluss(vorlage, tenant);
  // PDF generieren und zu Supabase Storage hochladen
  generatePdf(activeZuwId, false);
  setTimeout(() => {
    if (currentUser.role==='admin') { renderAdminDashboard(); showScreen('screen-admin'); }
    else { renderSubDashboard(); showScreen('screen-sub'); }
  }, 1500);
  if (abschlussBtn) { abschlussBtn.disabled = false; abschlussBtn.textContent = 'Bestätigen'; }
  } catch(e) {
    if (abschlussBtn) { abschlussBtn.disabled = false; abschlussBtn.textContent = 'Bestätigen'; }
    throw e;
  }
}

function backFromFormular() { if(currentUser.role==='admin') showScreen('screen-admin'); else showScreen('screen-sub'); }
function closeModal() { document.getElementById('modal-abschluss').classList.remove('active'); }
function abschlussBestaetigt() { if(abschlussCallback) abschlussCallback(); abschlussCallback=null; }

// ══════════════════════════════════════════════════════════════
//  PDF EXPORT + SUPABASE STORAGE UPLOAD
// ══════════════════════════════════════════════════════════════
function generatePdf(zuwId, downloadOnly) {
  const zuw=zuweisungen.find(z=>z.id===zuwId); if(!zuw) return;
  const vorlage=SCHULUNG_VORLAGEN.find(v=>v.id===zuw.vorlagenId), tenant=APP_TENANTS.find(t=>t.id===zuw.tenantId);
  const form=formulare[zuwId]||{}, status=berechneStatus(zuw);
  if (typeof window.jspdf==='undefined') { alert('PDF-Bibliothek nicht geladen.'); return; }
  const {jsPDF}=window.jspdf, doc=new jsPDF({unit:'mm',format:'a4'});
  const PL=18,PW=174; let y=18;
  function checkY(n){if(y+n>275){doc.addPage();y=18;}}

  doc.setFillColor(26,58,92); doc.rect(0,0,210,22,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('Schulungsnachweis',PL,13);
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(new Date().toLocaleString('de-DE'),210-PL,13,{align:'right'}); y=30;

  doc.setTextColor(26,58,92); doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text(vorlage?vorlage.titel:zuwId,PL,y); y+=8;
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
  doc.text(`Unternehmen: ${tenant?tenant.name:zuw.tenantId}`,PL,y); y+=5;
  doc.text(`Frist: ${zuw.frist||'–'}  •  Pflichtschulung: ${zuw.pflicht?'Ja':'Nein'}`,PL,y); y+=5;
  if (form.abgeschlossen) { doc.text(`Abgeschlossen: ${dateStr(form.abgeschlossenAm)} von ${userNameVonId(form.abgeschlossenVon, zuw.tenantId)}`,PL,y); y+=5; }
  const ac=status==='gruen'?[22,163,74]:status==='gelb'?[202,138,4]:[220,38,38];
  doc.setFillColor(...ac); doc.roundedRect(PL,y,38,7,2,2,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
  doc.text(statusLabel(status).toUpperCase(),PL+19,y+4.5,{align:'center'}); y+=13;
  doc.setDrawColor(200,200,200); doc.line(PL,y,210-PL,y); y+=8;

  // ── Formularinhalt: alle Abschnitte + Felder ──
  if (form.felder && vorlage && vorlage.abschnitte) {
    vorlage.abschnitte.forEach(ab => {
      checkY(14);
      // Abschnittsüberschrift — blauer Balken
      doc.setFillColor(26,58,92);
      doc.rect(PL, y-4, PW, 7, 'F');
      doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
      doc.text(ab.titel.toUpperCase(), PL+2, y+0.5);
      y += 8;

      ab.felder.forEach(feld => {
        const val = form.felder[feld.id];
        checkY(14);

        // Feldbezeichnung
        doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(80,80,80);
        doc.text(feld.label + (feld.pflicht ? ' *' : ''), PL+2, y);
        y += 4;

        // Feldwert
        doc.setFont('helvetica','normal'); doc.setTextColor(20,20,20);

        if (feld.typ === 'signature') {
          if (val) {
            checkY(30);
            try {
              // Rahmen für Unterschrift
              doc.setDrawColor(200,200,200); doc.setFillColor(252,252,252);
              doc.roundedRect(PL+2, y, 70, 24, 1, 1, 'FD');
              doc.addImage(val, 'PNG', PL+3, y+1, 68, 22);
              y += 27;
            } catch(e) {
              doc.setTextColor(150,150,150); doc.text('[Unterschrift vorhanden]', PL+2, y); y += 6;
            }
          } else {
            doc.setTextColor(180,180,180); doc.text('– keine Unterschrift –', PL+2, y); y += 5;
          }
        } else if (feld.typ === 'checkbox') {
          // Checkbox als Kästchen zeichnen (kein Unicode)
          doc.setDrawColor(80,80,80);
          doc.rect(PL+2, y-3.5, 4, 4);
          if (val) {
            doc.setLineWidth(0.6); doc.setDrawColor(22,163,74);
            doc.line(PL+2.7, y-1.8, PL+4, y-3.2);
            doc.line(PL+4, y-3.2, PL+5.5, y-5);
            doc.setLineWidth(0.2); doc.setDrawColor(80,80,80);
          }
          doc.setTextColor(20,20,20); doc.setFontSize(8);
          doc.text(val ? 'Ja' : 'Nein', PL+8, y-0.5);
          y += 5;
        } else if (feld.typ === 'upload') {
          doc.setTextColor(100,100,200); doc.text(val ? val : '–', PL+2, y); y += 5;
        } else {
          const anzeigeVal = (val !== undefined && val !== null && val !== '') ? String(val) : '–';
          const lines = doc.splitTextToSize(anzeigeVal, PW-4);
          if (!val) doc.setTextColor(180,180,180);
          doc.text(lines, PL+2, y);
          y += lines.length * 4.5 + 1;
        }
        y += 2; // Abstand zwischen Feldern
      });
      y += 5; // Abstand nach Abschnitt
    });
  } else if (!vorlage) {
    checkY(10);
    doc.setFontSize(8); doc.setTextColor(150,150,150);
    doc.text('(Vorlage nicht mehr verfügbar – Inhalt im PDF-Nachweis gespeichert)', PL, y); y += 8;
  }
  const pc=doc.internal.getNumberOfPages();
  for(let i=1;i<=pc;i++){doc.setPage(i);doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text(`Seite ${i}/${pc}  •  ${new Date().toLocaleString('de-DE')}`,105,290,{align:'center'});doc.line(PL,285,210-PL,285);}

  // Lokaler Download nur für Admin und Verantwortlicher (nicht für Mitarbeiter)
  const dt  = new Date().toISOString().slice(0,10);
  const fn  = `${dt}_${(vorlage?.titel||zuwId).replace(/\s+/g,'_')}_${zuw.tenantId}.pdf`;
  if (downloadOnly || currentUser?.role === 'admin' || currentUser?.role === 'verantwortlicher') {
    doc.save(fn);
  }

  // Parallel zu Supabase Storage UND Google Drive hochladen
  // WICHTIG: Immer hochladen (nicht nur wenn form.abgeschlossen bereits true ist —
  // beim ersten Abschluss ist das local-state noch false)
  if (!downloadOnly) {
    const pdfBlob   = doc.output('blob');
    const pdfBase64 = doc.output('datauristring').split(',')[1];
    uploadPdfToSupabase(pdfBlob, fn, zuwId, zuw.tenantId);
    uploadPdfToDrive(pdfBase64, fn, zuw.tenantId, zuwId);
  }
}

// ── SUPABASE STORAGE UPLOAD ──────────────────────────────────
async function uploadPdfToSupabase(pdfBlob, filename, zuwId, tenantId) {
  try {
    const path = `${tenantId}/${filename}`;
    // PUT mit x-upsert:true — überschreibt existierende Datei ohne 409-Fehler
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/schulung-pdfs/${path}`, {
      method: 'PUT',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/pdf',
        'x-upsert': 'true'
      },
      body: pdfBlob
    });
    if (!r.ok) throw new Error(await r.text());
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/schulung-pdfs/${path}`;
    await SB.patch('formulare', `id=eq.${zuwId}`, { pdf_path: publicUrl });
    if (formulare[zuwId]) formulare[zuwId].pdfPath = publicUrl;
    showToast('🗄️ PDF gespeichert', '#0047cc');
  } catch(e) {
    console.warn('Supabase PDF Upload:', e.message);
    showToast('⚠️ PDF-Upload fehlgeschlagen: ' + e.message.substring(0,80), '#dc2626');
  }
}

// ── LOKALER BACKUP-UPLOAD (läuft nur auf dem Server, nicht vom Smartphone) ───
async function uploadPdfToDrive(pdfBase64, filename, tenantId, zuwId) {
  try {
    const resp = await fetch('http://localhost:8765/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf: pdfBase64, filename, tenantId })
    });
    const result = await resp.json();
    if (result.status === 'ok') {
      await SB.patch('formulare', `id=eq.${zuwId}`, { drive_link: result.link });
      if (formulare[zuwId]) formulare[zuwId].driveLink = result.link;
      // Kein Toast — PDF ist bereits via Supabase gesichert
      return result.link;
    } else {
      console.warn('Drive Upload Fehler:', result.message);
      return null;
    }
  } catch(e) {
    // Nicht erreichbar (z.B. vom Smartphone) — kein Fehler-Toast, PDF ist in Supabase
    console.warn('Backup-Upload nicht erreichbar:', e.message);
    return null;
  }
}

// ── GOOGLE DRIVE SYNC (fehlende Uploads nachholen) ───────────
async function syncMissingToDrive() {
  const btn = document.getElementById('drive-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Synchronisiere…'; }

  try {
    // Alle abgeschlossenen Formulare ohne Drive-Link laden
    const missing = await SB.get('formulare',
      'abgeschlossen=eq.true&drive_link=is.null&pdf_path=not.is.null'
    );

    if (!missing.length) {
      showToast('✅ Alle Formulare bereits in Google Drive', '#16a34a');
      if (btn) { btn.disabled = false; btn.textContent = '☁️ Drive-Sync'; }
      return;
    }

    showToast(`🔄 ${missing.length} Formular(e) werden nachgesendet…`, '#0047cc');
    let ok = 0, fehler = 0;

    for (const form of missing) {
      try {
        // PDF von Supabase Storage laden
        const pdfResp = await fetch(form.pdf_path);
        if (!pdfResp.ok) throw new Error('PDF nicht ladbar');
        const pdfBlob   = await pdfResp.blob();
        const pdfBase64 = await blobToBase64(pdfBlob);

        // Dateiname aus pdf_path extrahieren
        const filename = form.pdf_path.split('/').pop();
        const tenantId = form.id.includes('tenant_a') ? 'tenant_a' :
                         form.id.includes('tenant_b') ? 'tenant_b' :
                         form.id.includes('tenant_c') ? 'tenant_c' :
                         form.pdf_path.split('/').slice(-2,-1)[0] || 'tenant_a';

        const link = await uploadPdfToDrive(pdfBase64, filename, tenantId, form.id);
        if (link) ok++; else fehler++;
      } catch(e) {
        console.warn('Sync Fehler für', form.id, e.message);
        fehler++;
      }
    }

    if (fehler === 0) {
      showToast(`✅ ${ok} Formular(e) erfolgreich zu Google Drive gesendet`, '#16a34a');
    } else {
      showToast(`⚠️ ${ok} OK, ${fehler} fehlgeschlagen — Drive evtl. offline`, '#dc2626');
    }
  } catch(e) {
    showToast('❌ Sync-Fehler: ' + e.message, '#dc2626');
  }

  if (btn) { btn.disabled = false; btn.textContent = '☁️ Drive-Sync'; }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror  = reject;
    reader.readAsDataURL(blob);
  });
}

// ── TOAST HELPER ─────────────────────────────────────────────
function showToast(text, color='#16a34a') {
  const msg = document.createElement('div');
  msg.style.cssText = `position:fixed;bottom:${20 + document.querySelectorAll('.toast-msg').length * 55}px;right:20px;background:${color};color:#fff;padding:12px 18px;border-radius:10px;font-size:0.85rem;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2)`;
  msg.className = 'toast-msg';
  msg.textContent = text;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 4000);
}

// Ersatz für confirm() — PWA-sicher (kein nativer Dialog)
function showConfirmModal(text, onJa, optionen = {}) {
  const vorhandenes = document.getElementById('_confirm_modal');
  if (vorhandenes) vorhandenes.remove();
  const jaLabel  = optionen.jaLabel  || 'Ja, fortfahren';
  const neinLabel= optionen.neinLabel|| 'Abbrechen';
  const jaColor  = optionen.jaColor  || '#dc2626';
  const overlay = document.createElement('div');
  overlay.id = '_confirm_modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px;max-width:340px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.25)">
      <div style="font-size:.95rem;color:#1e293b;line-height:1.5;margin-bottom:20px">${text}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="_cm_nein" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:8px;background:#f9fafb;color:#374151;font-size:.88rem;cursor:pointer">${neinLabel}</button>
        <button id="_cm_ja"   style="padding:9px 18px;border:none;border-radius:8px;background:${jaColor};color:#fff;font-size:.88rem;font-weight:600;cursor:pointer">${jaLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('_cm_nein').onclick = () => overlay.remove();
  document.getElementById('_cm_ja').onclick   = () => { overlay.remove(); onJa(); };
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// ── SERVICE WORKER REGISTRIERUNG (Offline-Modus) ─────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW:', e));
  });
}

// ══════════════════════════════════════════════════════════════
//  UNTERNEHMEN VERWALTEN
// ══════════════════════════════════════════════════════════════

function nuGenerierePasswort() {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!#';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += zeichen[Math.floor(Math.random() * zeichen.length)];
  document.getElementById('nu-passwort').value = pw;
}

async function nuAnlegen() {
  const msgEl = document.getElementById('nu-msg');
  msgEl.textContent = '';
  msgEl.style.color = '#dc2626';

  const name     = document.getElementById('nu-name').value.trim();
  const email    = document.getElementById('nu-email').value.trim().toLowerCase();
  const kontakt  = document.getElementById('nu-kontakt').value.trim();
  const passwort = document.getElementById('nu-passwort').value.trim();

  if (!name || !email || !kontakt || !passwort) {
    msgEl.textContent = '⚠️ Bitte alle Felder ausfüllen.'; return;
  }
  if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    msgEl.textContent = '⚠️ Ungültige E-Mail-Adresse.'; return;
  }
  if (passwort.length < 8) {
    msgEl.textContent = '⚠️ Passwort muss mindestens 8 Zeichen haben.'; return;
  }

  msgEl.style.color = '#2563eb';
  msgEl.textContent = '⏳ Wird geprüft …';

  let tenantId = null;
  try {
    // 0. Duplicate-Check: E-Mail bereits vergeben?
    const existing = await SB.get('users', `email=eq.${encodeURIComponent(email)}&select=id`);
    if (existing && existing.length > 0) {
      msgEl.style.color = '#dc2626';
      msgEl.textContent = `⚠️ Die E-Mail-Adresse „${email}" ist bereits vergeben. Bitte eine andere verwenden.`;
      return;
    }

    // Duplicate-Check: Unternehmensname bereits vorhanden?
    const existingTenant = APP_TENANTS.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existingTenant) {
      msgEl.style.color = '#dc2626';
      msgEl.textContent = `⚠️ Ein Unternehmen mit dem Namen „${name}" existiert bereits.`;
      return;
    }

    msgEl.textContent = '⏳ Wird angelegt …';

    // 1. Tenant anlegen
    tenantId = 'tenant_' + Date.now();
    const tRes = await SB.post('tenants', { id: tenantId, name });
    if (tRes && tRes.error) throw new Error('Tenant: ' + (tRes.error.message || JSON.stringify(tRes.error)));

    // 2. Passwort hashen (bcrypt)
    const hash = await hashPasswort(passwort);

    // 3. User (Unternehmens-Account mit firma-Rolle) anlegen
    const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const uRes = await SB.post('users', {
      id: userId,
      name: kontakt,
      email,
      password_hash: hash,
      role: 'firma',
      tenant_id: tenantId,
      aktiv: true,
      archiviert: false
    });
    if (uRes && uRes.error) {
      // Rollback: Tenant wieder löschen damit keine Geisterfirma entsteht
      try { await SB.delete('tenants', `id=eq.${tenantId}`); } catch(re) { console.warn('Rollback Fehler:', re.message); }
      throw new Error('Benutzer: ' + (uRes.error.message || JSON.stringify(uRes.error)));
    }

    // 4. App-State aktualisieren
    APP_TENANTS.push({ id: tenantId, name });
    try { await sbAudit('UNTERNEHMEN_NEU', `Unternehmen "${name}" angelegt, Login: ${email}`); } catch(ae) { console.warn('Audit Fehler:', ae.message); }

    msgEl.style.color = '#16a34a';
    msgEl.textContent = `✅ „${name}" erfolgreich angelegt! Login: ${email} / ${passwort}`;

    // E-Mail mit Zugangsdaten versenden
    const emailOk = await sendLoginEmail({ an: email, name: kontakt, rolle: 'firma', passwort, unternehmen: name });
    if (emailOk) {
      msgEl.textContent += ` — ✉️ Zugangsdaten per E-Mail gesendet`;
    } else {
      msgEl.textContent += ` — ⚠️ E-Mail konnte nicht gesendet werden (Passwort oben notieren!)`;
    }

    // Felder leeren
    ['nu-name','nu-email','nu-kontakt','nu-passwort'].forEach(id => document.getElementById(id).value = '');

    // Listen aktualisieren
    renderAdminTenantTable();
    renderAdminStats();
    nuRenderListe();
    populateZuweisungsForm();

  } catch(e) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = '❌ Fehler: ' + e.message;
    console.error('nuAnlegen Fehler:', e);
  }
}

function nuRenderListe() {
  const el = document.getElementById('nu-liste');
  if (!el) return;
  const suche = (document.getElementById('nu-filter')?.value || '').toLowerCase().trim();
  if (!APP_TENANTS.length) {
    el.innerHTML = '<p style="color:#6b7280;font-size:.85rem">Noch keine Unternehmen angelegt.</p>';
    return;
  }
  const gefiltert = suche ? APP_TENANTS.filter(t => t.name.toLowerCase().includes(suche)) : APP_TENANTS;
  if (!gefiltert.length) {
    el.innerHTML = '<p style="color:#6b7280;font-size:.85rem">Keine Treffer.</p>';
    return;
  }
  el.innerHTML = gefiltert.map(t => {
    const zuws = zuweisungen.filter(z => z.tenantId === t.id);
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f3f4f6">
      <div>
        <strong>${escHtml(t.name)}</strong>
        <span style="font-size:.78rem;color:#6b7280;margin-left:8px">${zuws.length} Zuweisung(en)</span>
      </div>
      <button class="btn btn-outline btn-sm" onclick="adminZeigeTenant('${t.id}')">Details</button>
    </div>`;
  }).join('');
}

// Beim Öffnen des Tabs die Liste rendern — bereits in adminTab() eingebaut

function zuwListeToggle() {
  const b = document.getElementById('zuw-liste-bereich');
  const icon = document.getElementById('zuw-toggle-icon');
  const open = b.style.display === 'none' || b.style.display === '';
  b.style.display = open ? 'block' : 'none';
  icon.textContent = open ? '▼' : '▶';
  if (open) renderAdminZuweisungen();
}

function nuListeToggle() {
  const b = document.getElementById('nu-liste-bereich');
  const icon = document.getElementById('nu-liste-toggle-icon');
  const open = b.style.display === 'none' || b.style.display === '';
  b.style.display = open ? 'block' : 'none';
  icon.textContent = open ? '▼' : '▶';
  if (open) nuRenderListe();
}

function nuFormularToggle() {} // veraltet, kein Toggle mehr
function azFormularToggle() {} // veraltet, kein Toggle mehr

// ══════════════════════════════════════════════════════════════
//  EINLADUNG: Link + QR-Code generieren (Verantwortlicher)
// ══════════════════════════════════════════════════════════════

let aktiveEinladungZuwId = null;

async function einladungOeffnen(zuwId) {
  aktiveEinladungZuwId = zuwId;
  const zuw = zuweisungen.find(z=>z.id===zuwId);
  const v   = SCHULUNG_VORLAGEN.find(vl=>vl.id===zuw?.vorlagenId);
  const titel = v ? v.titel : zuwId;

  // Modal erstellen
  const overlay = document.createElement('div');
  overlay.id = 'einladung-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:24px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <h3 style="margin:0 0 6px;font-size:1.1rem">🔗 Mitarbeiter einladen</h3>
      <p style="font-size:.82rem;color:#6b7280;margin:0 0 16px">${escHtml(titel)}</p>

      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-primary" style="flex:1" onclick="einladungGenerieren()">🔗 Link generieren</button>
        <button class="btn btn-outline" onclick="document.getElementById('einladung-modal').remove()">✕ Schließen</button>
      </div>

      <div id="einl-result" style="display:none">
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;margin-bottom:12px">
          <div style="font-size:.78rem;color:#6b7280;margin-bottom:4px">Einladungslink (7 Tage gültig):</div>
          <div id="einl-link-text" style="font-size:.8rem;word-break:break-all;color:#1e40af;font-weight:600"></div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-outline btn-sm" style="flex:1" onclick="einlLinkKopieren()">📋 Kopieren</button>
            <button class="btn btn-outline btn-sm" style="flex:1" onclick="einlTeilen()">📤 Teilen</button>
          </div>
        </div>
        <div style="text-align:center">
          <div style="font-size:.78rem;color:#6b7280;margin-bottom:8px">QR-Code zum Scannen:</div>
          <div id="einl-qr" style="display:inline-block;background:#fff;padding:8px;border:1px solid #e5e7eb;border-radius:8px"></div>
          <div style="margin-top:10px">
            <button class="btn btn-outline btn-sm" onclick="einlQrDrucken()">🖨️ QR-Code drucken</button>
          </div>
        </div>
      </div>
      <div id="einl-msg" class="error-msg" style="margin-top:8px"></div>
    </div>`;
  document.body.appendChild(overlay);
}

async function einladungGenerieren() {
  const msgEl = document.getElementById('einl-msg');
  msgEl.textContent = '⏳ Link wird erstellt …';
  msgEl.style.color = '#2563eb';

  try {
    // Zufälligen Token erzeugen
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    const token = Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');

    const zuw = zuweisungen.find(z=>z.id===aktiveEinladungZuwId);
    const gueltigBis = new Date(Date.now() + 7*24*60*60*1000).toISOString();
    const id = 'einl_' + Date.now();

    const res = await SB.post('einladungen', {
      id, token,
      zuweisung_id: aktiveEinladungZuwId,
      tenant_id:    zuw.tenantId,
      erstellt_von: currentUser.name,
      gueltig_bis:  gueltigBis,
      genutzt:      false
    });
    if (res.error) throw new Error(res.error.message || JSON.stringify(res.error));

    const baseUrl = window.location.href.split('?')[0].split('#')[0].replace(/^http:\/\//i, 'https://');
    const link = `${baseUrl}?einladung=${token}`;

    // Link anzeigen
    document.getElementById('einl-link-text').textContent = link;
    document.getElementById('einl-result').style.display = '';
    msgEl.textContent = '';

    // QR-Code erzeugen
    await einlQrErzeugen(link);

  } catch(e) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = '❌ Fehler: ' + e.message;
  }
}

async function einlQrErzeugen(link) {
  const el = document.getElementById('einl-qr');
  el.innerHTML = '';
  // QR via externe API (kostenlos, kein Tracking)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
  const img = document.createElement('img');
  img.src = qrUrl;
  img.style.cssText = 'width:200px;height:200px;display:block';
  img.alt = 'QR-Code';
  el.appendChild(img);
}

function einlLinkKopieren() {
  const link = document.getElementById('einl-link-text').textContent;
  navigator.clipboard.writeText(link).then(()=>showToast('✅ Link kopiert!')).catch(()=>{
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = link; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    showToast('✅ Link kopiert!');
  });
}

function einlTeilen() {
  const link = document.getElementById('einl-link-text').textContent;
  const zuw  = zuweisungen.find(z=>z.id===aktiveEinladungZuwId);
  const v    = SCHULUNG_VORLAGEN.find(vl=>vl.id===zuw?.vorlagenId);
  if (navigator.share) {
    navigator.share({ title: v?.titel || 'Schulungsunterweisung', text: 'Bitte folgende Schulung unterzeichnen:', url: link });
  } else {
    einlLinkKopieren();
  }
}

function einlQrDrucken() {
  const img = document.querySelector('#einl-qr img');
  if (!img) return;
  const zuw = zuweisungen.find(z=>z.id===aktiveEinladungZuwId);
  const v   = SCHULUNG_VORLAGEN.find(vl=>vl.id===zuw?.vorlagenId);
  const w = window.open('','_blank','width=400,height=500');
  w.document.write(`<html><body style="text-align:center;font-family:sans-serif;padding:30px">
    <img src="${img.src}" style="width:220px;height:220px"><br>
    <p style="font-size:1rem;margin-top:12px"><strong>${escHtml(v?.titel||'Schulungsunterweisung')}</strong></p>
    <p style="font-size:.85rem;color:#666">Mit Smartphone scannen und Schulung unterzeichnen</p>
    <p style="font-size:.75rem;color:#999">SIBEDA · www.sibeda.de</p>
  </body></html>`);
  w.document.close();
  setTimeout(()=>w.print(), 500);
}

// ══════════════════════════════════════════════════════════════
//  GAST-FLOW: Einladungslink ohne Login
// ══════════════════════════════════════════════════════════════

let gastToken       = null;
let gastEinladung   = null;
let gastZuweisung   = null;
let gastVorlage     = null;
let gastSigPads     = {};

async function pruefeEinladungsToken() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('einladung');
  if (!token) return false;

  gastToken = token;

  try {
    // Token in Supabase nachschlagen
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/einladungen?token=eq.${token}&select=*`,
      { headers: SB.h }
    );
    const data = await res.json();
    if (!data || !data.length) { gastFehler('Dieser Einladungslink ist ungültig.'); return true; }

    const einl = data[0];
    if (einl.genutzt) { gastFehler('Dieser Link wurde bereits verwendet.'); return true; }
    if (new Date(einl.gueltig_bis) < new Date()) { gastFehler('Dieser Einladungslink ist abgelaufen.'); return true; }

    gastEinladung = einl;

    // Zuweisung + Vorlage laden
    const [zuws, vorls] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/zuweisungen?id=eq.${einl.zuweisung_id}&select=*`,{headers:SB.h}).then(r=>r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/vorlagen?select=*`,{headers:SB.h}).then(r=>r.json())
    ]);

    gastZuweisung = zuws?.[0];
    gastVorlage   = vorls?.find(v=>v.id===gastZuweisung?.vorlage_id);

    if (!gastZuweisung || !gastVorlage) { gastFehler('Schulung nicht gefunden.'); return true; }

    // Gast-Screen anzeigen
    document.getElementById('gast-schulung-titel').textContent = gastVorlage.titel || 'Schulungsunterweisung';
    document.getElementById('gast-schulung-info').textContent  =
      `Frist: ${gastZuweisung.frist||'–'} · Bitte geben Sie Ihren Namen ein und schließen Sie die Unterweisung ab.`;

    document.querySelectorAll('.screen').forEach(s=>s.style.display='none');
    document.getElementById('screen-gast').style.display='';
    return true;

  } catch(e) {
    gastFehler('Verbindungsfehler: ' + e.message);
    return true;
  }
}

function gastFehler(msg) {
  document.querySelectorAll('.screen').forEach(s=>s.style.display='none');
  document.getElementById('screen-gast').style.display='';
  document.getElementById('gast-name-screen').innerHTML = `
    <div class="card" style="margin-top:20px;text-align:center">
      <div style="font-size:3rem">❌</div>
      <h3 style="color:#dc2626;margin:12px 0 8px">Link ungültig</h3>
      <p style="color:#6b7280;font-size:.9rem">${escHtml(msg)}</p>
    </div>`;
}

function gastWeiter() {
  const name = document.getElementById('gast-name-input').value.trim();
  const msg  = document.getElementById('gast-name-msg');
  if (!name) { msg.textContent = '⚠️ Bitte Ihren Namen eingeben.'; return; }
  msg.textContent = '';

  // Formular rendern
  const abschnitte = gastVorlage.abschnitte || [];
  let html = '';
  gastSigPads = {};

  if (gastVorlage.typ === 'pdf' && gastVorlage.pdf_url) {
    html += `<div class="card">
      <iframe src="https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(gastVorlage.pdf_url)}" style="width:100%;height:500px;border:none;border-radius:8px;display:block"></iframe>
      <div style="padding:6px 12px;background:#f0f4ff;font-size:.75rem;color:#4b5563;display:flex;align-items:center;gap:8px;border-top:1px solid #dde2e9">
        📄 PDF wird nicht angezeigt?
        <a href="${gastVorlage.pdf_url}" target="_blank" style="color:#1a3a5c;font-weight:600;text-decoration:underline">Direkt öffnen ↗</a>
      </div>
    </div>`;
  }

  abschnitte.forEach((ab, ai) => {
    html += `<div class="card"><div class="card-title">${escHtml(ab.titel||'')}</div>`;
    (ab.felder||[]).forEach((f, fi) => {
      const fid = `gast_f_${ai}_${fi}`;
      if (f.typ==='signature') {
        html += `<div class="form-group"><label>${escHtml(f.label||'Unterschrift')}${f.pflicht?' *':''}</label>
          <canvas id="${fid}" style="border:2px solid #d1d5db;border-radius:8px;touch-action:none;width:100%;height:120px;background:#fff"></canvas>
          <button class="btn btn-outline btn-sm" style="margin-top:4px" onclick="gastSigClear('${fid}')">✕ Löschen</button></div>`;
        gastSigPads[fid] = { pflicht: !!f.pflicht, label: f.label };
      } else if (f.typ==='checkbox') {
        html += `<div class="form-group" style="display:flex;gap:10px;align-items:flex-start">
          <input type="checkbox" id="${fid}" style="width:auto;margin-top:3px">
          <label for="${fid}" style="margin:0;font-weight:400">${escHtml(f.label||'')}${f.pflicht?' *':''}</label></div>`;
      } else if (f.typ==='select') {
        const opts = (f.optionen||'').split(',').map(o=>`<option>${escHtml(o.trim())}</option>`).join('');
        html += `<div class="form-group"><label>${escHtml(f.label||'')}${f.pflicht?' *':''}</label>
          <select id="${fid}"><option value="">— bitte wählen —</option>${opts}</select></div>`;
      } else if (f.typ==='textarea') {
        html += `<div class="form-group"><label>${escHtml(f.label||'')}${f.pflicht?' *':''}</label>
          <textarea id="${fid}" rows="3" placeholder="${escHtml(f.platzhalter||'')}"></textarea></div>`;
      } else {
        html += `<div class="form-group"><label>${escHtml(f.label||'')}${f.pflicht?' *':''}</label>
          <input type="text" id="${fid}" placeholder="${escHtml(f.platzhalter||'')}"></div>`;
      }
    });
    html += '</div>';
  });

  document.getElementById('gast-formular-content').innerHTML = html;
  document.getElementById('gast-name-screen').style.display    = 'none';
  document.getElementById('gast-formular-screen').style.display = '';

  // Signature Pads initialisieren
  setTimeout(() => {
    Object.keys(gastSigPads).forEach(fid => {
      const canvas = document.getElementById(fid);
      if (!canvas) return;
      // Canvas-Größe setzen
      canvas.width  = canvas.offsetWidth  || 320;
      canvas.height = canvas.offsetHeight || 120;
      const ctx = canvas.getContext('2d');
      const pad = { drawing: false, ctx, canvas, data: null };
      canvas.addEventListener('mousedown',  e => { pad.drawing=true; ctx.beginPath(); ctx.moveTo(e.offsetX,e.offsetY); });
      canvas.addEventListener('mousemove',  e => { if(!pad.drawing)return; ctx.lineTo(e.offsetX,e.offsetY); ctx.strokeStyle='#1e3a5f'; ctx.lineWidth=2; ctx.stroke(); });
      canvas.addEventListener('mouseup',    ()=> { pad.drawing=false; pad.data=canvas.toDataURL(); });
      canvas.addEventListener('touchstart', e => { e.preventDefault(); pad.drawing=true; const t=e.touches[0],r=canvas.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(t.clientX-r.left,t.clientY-r.top); });
      canvas.addEventListener('touchmove',  e => { e.preventDefault(); if(!pad.drawing)return; const t=e.touches[0],r=canvas.getBoundingClientRect(); ctx.lineTo(t.clientX-r.left,t.clientY-r.top); ctx.strokeStyle='#1e3a5f'; ctx.lineWidth=2; ctx.stroke(); });
      canvas.addEventListener('touchend',   ()=> { pad.drawing=false; pad.data=canvas.toDataURL(); });
      gastSigPads[fid].pad = pad;
    });
  }, 100);
}

function gastSigClear(fid) {
  const p = gastSigPads[fid];
  if (!p?.pad) return;
  p.pad.ctx.clearRect(0,0,p.pad.canvas.width,p.pad.canvas.height);
  p.pad.data = null;
}

function gastZurueck() {
  document.getElementById('gast-formular-screen').style.display = 'none';
  document.getElementById('gast-name-screen').style.display     = '';
}

async function gastAbschliessen() {
  const msgEl = document.getElementById('gast-formular-msg');
  msgEl.textContent = '';

  const name = document.getElementById('gast-name-input').value.trim();

  // Pflicht-Unterschriften prüfen
  for (const [fid, info] of Object.entries(gastSigPads)) {
    if (info.pflicht) {
      const data = info.pad?.data;
      if (!data) { msgEl.style.color='#dc2626'; msgEl.textContent=`⚠️ Bitte "${info.label}" unterschreiben.`; return; }
    }
  }

  msgEl.style.color='#2563eb'; msgEl.textContent='⏳ Wird gespeichert …';

  try {
    // Felder sammeln
    const content = document.getElementById('gast-formular-content');
    const inputs  = content.querySelectorAll('input,select,textarea,canvas');
    const antworten = {};
    inputs.forEach(el => {
      if (!el.id) return;
      if (el.tagName==='CANVAS') { antworten[el.id] = gastSigPads[el.id]?.pad?.data || ''; }
      else if (el.type==='checkbox') { antworten[el.id] = el.checked; }
      else { antworten[el.id] = el.value; }
    });

    const jetzt = new Date().toISOString();
    const formId = gastEinladung.zuweisung_id;

    // Formular in Supabase speichern
    const payload = {
      id:              formId,
      zuweisung_id:    formId,
      felder:          antworten,
      abgeschlossen:   true,
      abgeschlossen_am: jetzt,
      abgeschlossen_von: name,
      mitarbeiter_name: name,
      einladung_token: gastToken
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/formulare`, {
      method:  'POST',
      headers: { ...SB.h, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body:    JSON.stringify(payload)
    });

    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.message || r.statusText);
    }

    // Token als genutzt markieren
    await fetch(`${SUPABASE_URL}/rest/v1/einladungen?id=eq.${gastEinladung.id}`, {
      method:  'PATCH',
      headers: { ...SB.h, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ genutzt: true, mitarbeiter_name: name })
    });

    // Erfolg
    document.getElementById('gast-formular-screen').style.display = 'none';
    document.getElementById('gast-fertig-screen').style.display   = '';

  } catch(e) {
    msgEl.style.color='#dc2626'; msgEl.textContent='❌ Fehler: '+e.message;
  }
}

// ══════════════════════════════════════════════════════════════
//  MITARBEITER EXCEL-IMPORT (Sub-Dashboard / Verantwortlicher)
// ══════════════════════════════════════════════════════════════

let importDaten = []; // Parsed rows from Excel

// ══════════════════════════════════════════════════════════
// Einzelnen Mitarbeiter anlegen
// ══════════════════════════════════════════════════════════
function mitarbeiterEinzelnOeffnen() {
  if (currentUser && currentUser.role === 'mitarbeiter') {
    alert('Diese Funktion steht nur Verantwortlichen zur Verfügung.');
    return;
  }
  // Reset
  document.getElementById('einzel-name').value = '';
  document.getElementById('einzel-email').value = '';
  document.getElementById('einzel-standort').value = '';
  document.getElementById('einzel-bereich').value = '';
  document.getElementById('einzel-passwort').value = '';
  document.getElementById('einzel-fehler').style.display = 'none';
  document.getElementById('einzel-formular').style.display = 'block';
  document.getElementById('einzel-ergebnis').style.display = 'none';
  document.getElementById('einzel-speichern-btn').disabled = false;
  document.getElementById('einzel-speichern-btn').textContent = '✅ Anlegen';
  document.getElementById('mitarbeiter-einzel-modal').style.display = 'flex';
}

function mitarbeiterEinzelnSchliessen() {
  document.getElementById('mitarbeiter-einzel-modal').style.display = 'none';
}

function mitarbeiterEinzelnGenerierePasswort() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
  let pw = '';
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  arr.forEach(b => { pw += chars[b % chars.length]; });
  document.getElementById('einzel-passwort').value = pw;
}

async function mitarbeiterEinzelnSpeichern() {
  const name     = document.getElementById('einzel-name').value.trim();
  const email    = document.getElementById('einzel-email').value.trim().toLowerCase();
  const standort = document.getElementById('einzel-standort').value.trim();
  const bereich  = document.getElementById('einzel-bereich').value.trim();
  let   pw       = document.getElementById('einzel-passwort').value.trim();

  const fehlerEl = document.getElementById('einzel-fehler');
  fehlerEl.style.display = 'none';

  // Validierung
  if (!name) {
    fehlerEl.textContent = 'Bitte einen Namen eingeben.';
    fehlerEl.style.display = 'block';
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fehlerEl.textContent = 'Bitte eine gültige E-Mail-Adresse eingeben.';
    fehlerEl.style.display = 'block';
    return;
  }

  // Passwort auto-generieren wenn leer
  if (!pw) {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
    const arr = new Uint8Array(10);
    crypto.getRandomValues(arr);
    arr.forEach(b => { pw += chars[b % chars.length]; });
  }

  const btn = document.getElementById('einzel-speichern-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Wird angelegt …';

  try {
    const hash = await hashPasswort(pw);
    const res = await SB.post('users', {
      id: 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
      name,
      email,
      password_hash: hash,
      role: 'mitarbeiter',
      tenant_id: currentUser.tenantId,
      standort: standort || null,
      bereich:  bereich  || null
    });

    if (res && res.error) {
      const msg = res.error.message || JSON.stringify(res.error);
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
        fehlerEl.textContent = 'Diese E-Mail-Adresse ist bereits registriert.';
      } else {
        fehlerEl.textContent = 'Fehler beim Anlegen: ' + msg;
      }
      fehlerEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = '✅ Anlegen';
      return;
    }

    sbAudit('MITARBEITER_EINZEL', { name, email, tenantId: currentUser.tenantId });

    // E-Mail mit Zugangsdaten versenden
    const tenantObjMA = APP_TENANTS.find(t => t.id === currentUser.tenantId);
    const mailOkMA = await sendLoginEmail({ an: email, name, rolle: 'mitarbeiter', passwort: pw, unternehmen: tenantObjMA?.name || '' });

    // Mitarbeiterliste aktualisieren
    renderMitarbeiterListe();

    // Ergebnis anzeigen
    document.getElementById('einzel-formular').style.display = 'none';
    document.getElementById('einzel-ergebnis-daten').innerHTML =
      `<div style="margin-bottom:6px"><strong>Name:</strong> ${name}</div>` +
      `<div style="margin-bottom:6px"><strong>E-Mail:</strong> ${email}</div>` +
      (standort ? `<div style="margin-bottom:6px"><strong>Standort:</strong> ${escHtml(standort)}</div>` : '') +
      (bereich  ? `<div style="margin-bottom:6px"><strong>Bereich:</strong> ${escHtml(bereich)}</div>` : '') +
      `<div style="margin-bottom:6px"><strong>Passwort:</strong> <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:.9rem">${pw}</code></div>` +
      (mailOkMA ? `<div style="color:#16a34a;margin-top:8px">✉️ Zugangsdaten wurden per E-Mail gesendet.</div>`
                : `<div style="color:#f59e0b;margin-top:8px">⚠️ E-Mail konnte nicht gesendet werden – Passwort bitte notieren!</div>`);
    document.getElementById('einzel-ergebnis').style.display = 'block';

  } catch(e) {
    fehlerEl.textContent = 'Fehler: ' + e.message;
    fehlerEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = '✅ Anlegen';
  }
}


  function mitarbeiterImportOeffnen() {
  // Nur für Verantwortliche (nicht Mitarbeiter-Rolle)
  if (currentUser && currentUser.role === 'mitarbeiter') {
    alert('Diese Funktion steht nur Verantwortlichen zur Verfügung.');
    return;
  }
  importDaten = [];
  // Reset Modal-Schritte
  document.getElementById('import-step-upload').style.display   = '';
  document.getElementById('import-step-vorschau').style.display = 'none';
  document.getElementById('import-step-ergebnis').style.display = 'none';
  document.getElementById('import-status-msg').textContent = '';
  const fi = document.getElementById('import-datei');
  if (fi) fi.value = '';
  const modal = document.getElementById('mitarbeiter-import-modal');
  modal.style.display = 'flex';
}

function mitarbeiterImportSchliessen() {
  document.getElementById('mitarbeiter-import-modal').style.display = 'none';
  importDaten = [];
}

function mitarbeiterImportZurueck() {
  document.getElementById('import-step-vorschau').style.display = 'none';
  document.getElementById('import-step-upload').style.display   = '';
  document.getElementById('import-status-msg').textContent = '';
  const fi = document.getElementById('import-datei');
  if (fi) fi.value = '';
  importDaten = [];
}

function mitarbeiterImportDateiLesen(input) {
  const datei = input.files[0];
  if (!datei) return;

  if (typeof XLSX === 'undefined') {
    document.getElementById('import-status-msg').style.color = '#dc2626';
    document.getElementById('import-status-msg').textContent = '❌ Excel-Bibliothek nicht geladen. Bitte Internetverbindung prüfen.';
    return;
  }

  document.getElementById('import-lade-msg').style.display = '';
  document.getElementById('import-status-msg').textContent = '';

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data     = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet    = workbook.Sheets[workbook.SheetNames[0]];
      const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Erste Zeile = Kopfzeile überspringen
      const datenZeilen = rows.slice(1).filter(r => r[0] || r[1]); // mind. Name oder E-Mail vorhanden

      importDaten = datenZeilen.map((r, idx) => {
        const name  = String(r[0] || '').trim();
        const email = String(r[1] || '').trim().toLowerCase();
        const pw    = String(r[2] || '').trim();
        return { idx: idx + 2, name, email, pw }; // idx = Zeilennummer (1-basiert, +1 für Header)
      });

      document.getElementById('import-lade-msg').style.display = 'none';
      mitarbeiterImportZeigeVorschau();
    } catch(err) {
      document.getElementById('import-lade-msg').style.display = 'none';
      document.getElementById('import-status-msg').style.color = '#dc2626';
      document.getElementById('import-status-msg').textContent = '❌ Datei konnte nicht gelesen werden: ' + err.message;
    }
  };
  reader.readAsArrayBuffer(datei);
}

function mitarbeiterImportZeigeVorschau() {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!#';
  function genPw() {
    let pw = '';
    for (let i = 0; i < 10; i++) pw += zeichen[Math.floor(Math.random() * zeichen.length)];
    return pw;
  }

  // Passwörter generieren falls leer
  importDaten.forEach(r => { if (!r.pw) r.pw = genPw(); });

  // Validierung
  const fehler = [];
  const emailSet = new Set();
  importDaten.forEach(r => {
    if (!r.name) fehler.push(`Zeile ${r.idx}: Name fehlt`);
    if (!r.email) {
      fehler.push(`Zeile ${r.idx}: E-Mail fehlt`);
    } else if (!/^[^@]+@[^@]+\.[^@]+$/.test(r.email)) {
      fehler.push(`Zeile ${r.idx}: Ungültige E-Mail „${escHtml(r.email)}"`);
    } else if (emailSet.has(r.email)) {
      fehler.push(`Zeile ${r.idx}: E-Mail „${escHtml(r.email)}" doppelt`);
    }
    emailSet.add(r.email);
  });

  // Gültige Zeilen
  const gueltig = importDaten.filter(r =>
    r.name && r.email && /^[^@]+@[^@]+\.[^@]+$/.test(r.email)
  );

  document.getElementById('import-anzahl').textContent = gueltig.length;

  // Vorschau-Liste aufbauen
  const listEl = document.getElementById('import-vorschau-liste');
  if (gueltig.length === 0) {
    listEl.innerHTML = '<div style="padding:12px;color:#9ca3af;text-align:center">Keine gültigen Einträge gefunden.</div>';
  } else {
    listEl.innerHTML = gueltig.map(r =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #f3f4f6">
        <div>
          <div style="font-weight:600">${escHtml(r.name)}</div>
          <div style="color:#6b7280;font-size:.78rem">${escHtml(r.email)}</div>
        </div>
        <div style="font-size:.75rem;background:#f0fdf4;color:#16a34a;padding:3px 8px;border-radius:6px;font-family:monospace">${escHtml(r.pw)}</div>
      </div>`
    ).join('');
  }

  // Fehlerliste
  const fehlerEl = document.getElementById('import-fehler-liste');
  if (fehler.length > 0) {
    fehlerEl.style.display = '';
    fehlerEl.innerHTML = '<strong>⚠️ Folgende Zeilen werden übersprungen:</strong><br>' + fehler.map(f => `• ${f}`).join('<br>');
  } else {
    fehlerEl.style.display = 'none';
  }

  // Import-Button deaktivieren wenn keine gültigen Einträge
  document.getElementById('import-start-btn').disabled = gueltig.length === 0;

  document.getElementById('import-step-upload').style.display   = 'none';
  document.getElementById('import-step-vorschau').style.display = '';
}

async function mitarbeiterImportStarten() {
  const btn = document.getElementById('import-start-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Wird importiert …';

  const gueltig = importDaten.filter(r =>
    r.name && r.email && /^[^@]+@[^@]+\.[^@]+$/.test(r.email)
  );

  let erfolg = 0, fehler = 0;
  const details = [];

  for (const r of gueltig) {
    try {
      const hash   = await hashPasswort(r.pw);
      const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      const res    = await SB.post('users', {
        id:            userId,
        name:          r.name,
        email:         r.email,
        password_hash: hash,
        role:          'mitarbeiter',
        tenant_id:     currentUser.tenantId
      });
      if (res && res.error) {
        const errMsg = res.error.message || JSON.stringify(res.error);
        if (errMsg.includes('duplicate') || errMsg.includes('unique')) {
          details.push({ name: r.name, email: r.email, status: 'skip', msg: 'Bereits vorhanden' });
        } else {
          details.push({ name: r.name, email: r.email, status: 'err', msg: errMsg });
          fehler++;
        }
      } else {
        await sbAudit('MITARBEITER_IMPORT', `Mitarbeiter „${r.name}" (${r.email}) importiert`);
        details.push({ name: r.name, email: r.email, status: 'ok', pw: r.pw });
        erfolg++;
      }
    } catch(e) {
      details.push({ name: r.name, email: r.email, status: 'err', msg: e.message });
      fehler++;
    }
    // Kleine Pause um Rate-Limiting zu vermeiden
    await new Promise(res => setTimeout(res, 120));
  }

  // Ergebnis anzeigen
  document.getElementById('import-step-vorschau').style.display = 'none';
  document.getElementById('import-step-ergebnis').style.display = '';

  // Mitarbeiterliste aktualisieren
  renderMitarbeiterListe();

  const msgEl = document.getElementById('import-ergebnis-msg');
  if (fehler === 0) {
    msgEl.innerHTML = `<div style="font-size:2rem;margin-bottom:8px">✅</div>
      <div style="font-weight:700;font-size:1rem;color:#16a34a">${erfolg} Mitarbeiter erfolgreich angelegt!</div>
      ${details.filter(d=>d.status==='skip').length ? `<div style="font-size:.82rem;color:#6b7280;margin-top:4px">${details.filter(d=>d.status==='skip').length} bereits vorhanden (übersprungen)</div>` : ''}`;
  } else {
    msgEl.innerHTML = `<div style="font-size:2rem;margin-bottom:8px">⚠️</div>
      <div style="font-weight:700;font-size:.95rem;color:#b45309">${erfolg} importiert, ${fehler} Fehler</div>`;
  }

  const detailEl = document.getElementById('import-ergebnis-details');
  detailEl.innerHTML = details.map(d => {
    if (d.status === 'ok')   return `<div style="padding:7px 12px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between"><span><strong>${escHtml(d.name)}</strong> <span style="color:#6b7280">${escHtml(d.email)}</span></span><span style="color:#16a34a;font-size:.78rem">✅ Angelegt · PW: ${escHtml(d.pw)}</span></div>`;
    if (d.status === 'skip') return `<div style="padding:7px 12px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between"><span><strong>${escHtml(d.name)}</strong> <span style="color:#6b7280">${escHtml(d.email)}</span></span><span style="color:#9ca3af;font-size:.78rem">⏭ Übersprungen</span></div>`;
    return `<div style="padding:7px 12px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between"><span><strong>${escHtml(d.name)}</strong> <span style="color:#6b7280">${escHtml(d.email)}</span></span><span style="color:#dc2626;font-size:.78rem">❌ ${escHtml(d.msg||'Fehler')}</span></div>`;
  }).join('');
}


// ══════════════════════════════════════════════════════════════
//  FEATURE 1: PUSH-BENACHRICHTIGUNGEN (PWA Web Push)
// ══════════════════════════════════════════════════════════════

// VAPID Public Key (selbst generiert, kein Server-Einsatz nötig für lokale Benachrichtigungen)
// Für echte Push-Benachrichtigungen via Server: Key in Supabase Edge Function einsetzen
const VAPID_PUBLIC_KEY = '';  // Leer = nur lokale Notifications ohne Server-Push

async function pushBenachrichtigungAnfordern() {
  if (!('Notification' in window)) {
    showToast('⚠️ Benachrichtigungen werden in diesem Browser nicht unterstützt.', '#f59e0b');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    showToast('🔕 Benachrichtigungen sind blockiert. Bitte in den Browser-Einstellungen freigeben.', '#dc2626');
    return false;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    showToast('🔔 Benachrichtigungen aktiviert!', '#16a34a');
    // Service Worker Push-Subscription registrieren
    if ('serviceWorker' in navigator && VAPID_PUBLIC_KEY) {
      try {
        const reg = await navigator.serviceWorker.ready;
        pushSubscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        await sbAudit('PUSH_AKTIVIERT', 'Push-Benachrichtigungen aktiviert');
      } catch(e) { console.warn('Push-Subscription fehlgeschlagen:', e); }
    }
    return true;
  }
  return false;
}

// Lokale Benachrichtigung anzeigen (kein Server nötig)
function zeigeLokaleBenachrichtigung(titel, text, url) {
  if (Notification.permission !== 'granted') return;
  const n = new Notification(titel, {
    body:    text,
    icon:    '/csc-logo.png',
    badge:   '/csc-logo.png',
    tag:     'schulung-local',
    vibrate: [200, 100, 200]
  });
  if (url) n.onclick = () => { window.focus(); n.close(); };
  setTimeout(() => n.close(), 8000);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map(char => char.charCodeAt(0)));
}

function pushStatusHtml() {
  const granted = Notification.permission === 'granted';
  const supported = 'Notification' in window;
  if (!supported) return '';
  if (granted) {
    return `<button onclick="pushTestBenachrichtigung()" class="btn btn-outline btn-sm" style="font-size:.75rem;border-color:#16a34a;color:#16a34a">🔔 Test-Benachrichtigung</button>`;
  }
  return `<button onclick="pushBenachrichtigungAnfordern()" class="btn btn-outline btn-sm" style="font-size:.75rem">🔔 Benachrichtigungen aktivieren</button>`;
}

function pushTestBenachrichtigung() {
  zeigeLokaleBenachrichtigung('✅ Schulungsmanagement', 'Benachrichtigungen funktionieren korrekt!', null);
  showToast('🔔 Test-Benachrichtigung gesendet!', '#16a34a');
}

// Beim Abschluss einer Schulung Benachrichtigung an Admin senden
function pushSchulungsAbschluss(vorlage, tenant) {
  if (Notification.permission !== 'granted') return;
  zeigeLokaleBenachrichtigung(
    '✅ Schulung abgeschlossen',
    `${tenant?.name || 'Unbekannt'}: ${vorlage?.titel || 'Schulung'} wurde abgeschlossen.`
  );
}

// ══════════════════════════════════════════════════════════════
//  FEATURE 2: PDF-BERICHT (Druckbarer Schulungsnachweis)
// ══════════════════════════════════════════════════════════════

function pdfBerichtOeffnen() {
  const modal = document.getElementById('pdf-bericht-modal');
  if (!modal) return;
  // Tenant-Dropdown befüllen
  const sel = document.getElementById('pb-tenant-select');
  if (sel) {
    sel.innerHTML = currentUser.role === 'admin'
      ? `<option value="">— Alle Unternehmen —</option>` + APP_TENANTS.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('')
      : `<option value="${currentUser.tenantId}">${escHtml(APP_TENANTS.find(t=>t.id===currentUser.tenantId)?.name||'Mein Unternehmen')}</option>`;
  }
  modal.style.display = 'flex';
}
function pdfBerichtSchliessen() {
  const modal = document.getElementById('pdf-bericht-modal');
  if (modal) modal.style.display = 'none';
}

async function pdfBerichtGenerieren() {
  const selEl   = document.getElementById('pb-tenant-select');
  const zeitraum = document.getElementById('pb-zeitraum')?.value || 'alle';
  const tenantId = selEl?.value || null;
  const btn = document.getElementById('pb-generieren-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Wird erstellt…'; }

  try {
    // Daten filtern
    let filteredZuws = zuweisungen;
    let filteredTenants = APP_TENANTS;
    if (tenantId) {
      filteredZuws = zuweisungen.filter(z => z.tenantId === tenantId);
      filteredTenants = APP_TENANTS.filter(t => t.id === tenantId);
    }

    // Zeitraum-Filter
    const jetzt = new Date();
    if (zeitraum !== 'alle') {
      const monate = parseInt(zeitraum);
      const vonDatum = new Date(jetzt.getFullYear(), jetzt.getMonth() - monate, 1);
      filteredZuws = filteredZuws.filter(z => {
        const form = formulare[z.id];
        if (!form?.abgeschlossenAm) return true;
        return new Date(form.abgeschlossenAm) >= vonDatum;
      });
    }

    // jsPDF laden
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      showToast('⚠️ PDF-Bibliothek wird geladen…', '#f59e0b');
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    // ── Deckblatt ──────────────────────────────────────────
    doc.setFillColor(26, 58, 92);
    doc.rect(0, 0, 210, 45, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Schulungsbericht', 15, 22);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const tenantLabel = tenantId ? (filteredTenants[0]?.name || '') : 'Alle Unternehmen';
    doc.text(`${tenantLabel} | Erstellt: ${new Date().toLocaleDateString('de-DE')}`, 15, 32);
    doc.text('SIBEDA — Schulungsmanagement', 15, 39);

    // ── Zusammenfassung ────────────────────────────────────
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Zusammenfassung', 15, 58);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const stats = { gruen: 0, gelb: 0, rot: 0 };
    filteredZuws.forEach(z => { const s = berechneStatus(z); if (s in stats) stats[s]++; });
    const total = filteredZuws.length;

    doc.setFillColor(240, 249, 244);
    doc.rect(15, 62, 52, 20, 'F');
    doc.setTextColor(22, 163, 74);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(String(stats.gruen), 41, 75, { align: 'center' });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Abgeschlossen', 41, 80, { align: 'center' });

    doc.setFillColor(255, 251, 235);
    doc.rect(71, 62, 52, 20, 'F');
    doc.setTextColor(245, 158, 11);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(String(stats.gelb), 97, 75, { align: 'center' });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('In Bearbeitung', 97, 80, { align: 'center' });

    doc.setFillColor(254, 242, 242);
    doc.rect(127, 62, 52, 20, 'F');
    doc.setTextColor(220, 38, 38);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold');
    doc.text(String(stats.rot), 153, 75, { align: 'center' });
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Offen/Überfällig', 153, 80, { align: 'center' });

    // ── Tabelle der Schulungen ─────────────────────────────
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Schulungsübersicht', 15, 96);

    // Tabellenheader
    let yPos = 100;
    doc.setFillColor(26, 58, 92);
    doc.rect(15, yPos, 180, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.text('Schulung', 17, yPos + 5);
    doc.text('Unternehmen', 80, yPos + 5);
    doc.text('Frist', 130, yPos + 5);
    doc.text('Status', 165, yPos + 5);
    yPos += 9;

    const gruppiertNachTenant = {};
    filteredZuws.forEach(z => {
      if (!gruppiertNachTenant[z.tenantId]) gruppiertNachTenant[z.tenantId] = [];
      gruppiertNachTenant[z.tenantId].push(z);
    });

    let zeilenNr = 0;
    for (const [tid, zuws] of Object.entries(gruppiertNachTenant)) {
      const t = APP_TENANTS.find(tn => tn.id === tid);
      for (const z of zuws) {
        const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
        const s = berechneStatus(z);
        const form = formulare[z.id] || {};

        if (yPos > 270) {
          doc.addPage();
          yPos = 15;
        }

        // Zeilenfarbe abwechselnd
        if (zeilenNr % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, yPos - 1, 180, 7, 'F');
        }

        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);

        const titel = (v?.titel || z.vorlagenId || '').substring(0, 38);
        const firma = (t?.name || '').substring(0, 25);
        const frist = z.frist ? new Date(z.frist).toLocaleDateString('de-DE') : '–';
        const statusText = s === 'gruen' ? 'Abgeschlossen' : s === 'gelb' ? 'In Bearbeitung' : 'Offen';
        const statusColor = s === 'gruen' ? [22, 163, 74] : s === 'gelb' ? [245, 158, 11] : [220, 38, 38];

        doc.text(titel, 17, yPos + 4);
        doc.text(firma, 80, yPos + 4);
        doc.text(frist, 130, yPos + 4);
        doc.setTextColor(...statusColor);
        doc.setFont('helvetica', 'bold');
        doc.text(statusText, 165, yPos + 4);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        yPos += 7;
        zeilenNr++;
      }
    }

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`SIBEDA Schulungsmanagement • Seite ${i} von ${pageCount} • ${new Date().toLocaleDateString('de-DE')}`, 105, 290, { align: 'center' });
    }

    const dateiname = `Schulungsbericht_${tenantId ? filteredTenants[0]?.name?.replace(/\s/g,'_') || 'Unternehmen' : 'Gesamt'}_${new Date().toISOString().slice(0,10)}.pdf`;
    doc.save(dateiname);
    await sbAudit('BERICHT_PDF', `Schulungsbericht erstellt: ${dateiname}`);
    showToast('✅ PDF-Bericht wurde heruntergeladen!', '#16a34a');
    pdfBerichtSchliessen();
  } catch(e) {
    console.error('PDF-Bericht Fehler:', e);
    showToast('❌ Fehler beim Erstellen des Berichts: ' + e.message, '#dc2626');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 PDF erstellen'; }
  }
}

// ══════════════════════════════════════════════════════════════
//  FEATURE 3: WIEDERKEHRENDE SCHULUNGEN (Auto-Neuzuweisung)
// ══════════════════════════════════════════════════════════════

async function pruefeWiederkehrendeSchulungen() {
  // Wird beim Login aufgerufen — für Admin UND Verantwortliche
  const istAdmin = currentUser?.role === 'admin';
  const istVerantwortlicher = currentUser?.role === 'verantwortlicher';
  if (!istAdmin && !istVerantwortlicher) return;

  const jetzt = new Date();
  const neuZuweisungen = [];

  for (const zuw of zuweisungen) {
    const form = formulare[zuw.id];
    if (!form?.abgeschlossen || !form.abgeschlossenAm) continue;

    const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
    const intervall = zuw.intervallMonate || vorlage?.intervallMonate;
    if (!intervall || intervall <= 0) continue;

    // Nächste Fälligkeit berechnen
    const abgeschlossenAm = new Date(form.abgeschlossenAm);
    const naechsteFaelligkeit = new Date(abgeschlossenAm);
    naechsteFaelligkeit.setMonth(naechsteFaelligkeit.getMonth() + parseInt(intervall));

    // Erinnerung ab 30 Tage vor Fälligkeit
    const erinnerungAb = new Date(naechsteFaelligkeit);
    erinnerungAb.setDate(erinnerungAb.getDate() - 30);

    if (jetzt >= erinnerungAb) {
      // Prüfen ob bereits eine neuere Zuweisung für diese Vorlage+Tenant+MA existiert
      const hatNeueZuweisung = zuweisungen.some(z =>
        z.id !== zuw.id &&
        z.vorlagenId === zuw.vorlagenId &&
        z.tenantId === zuw.tenantId &&
        (zuw.zugewiesenAn ? z.zugewiesenAn === zuw.zugewiesenAn : !z.zugewiesenAn) &&
        z.frist &&
        new Date(z.frist) >= abgeschlossenAm
      );
      if (!hatNeueZuweisung) {
        neuZuweisungen.push({ vorlage, zuw, naechsteFaelligkeit });
      }
    }
  }

  if (neuZuweisungen.length > 0) {
    zeigeWiederkehrendeHinweise(neuZuweisungen);
  }
}

function zeigeWiederkehrendeHinweise(liste) {
  // Admin-Dashboard
  const el = document.getElementById('wiederkehrende-hinweise');
  // Sub-Dashboard (Verantwortlicher)
  const elSub = document.getElementById('wiederkehrende-hinweise-sub');

  const html = liste.map(({ vorlage, zuw, naechsteFaelligkeit }) => {
    const tenant = APP_TENANTS.find(t => t.id === zuw.tenantId);
    const fristStr = naechsteFaelligkeit.toISOString().slice(0, 10);
    const maHinweis = zuw.zugewiesenAn
      ? (() => { const ma = APP_USERS.find(u => u.id === zuw.zugewiesenAn); return ma ? ` · ${escHtml(ma.name)}` : ''; })()
      : '';
    return `<div style="padding:10px 14px;border-bottom:1px solid #fde68a;display:flex;align-items:center;gap:12px">
      <div style="font-size:1.2rem">🔄</div>
      <div style="flex:1">
        <div style="font-size:.88rem;font-weight:600">${escHtml(vorlage?.titel || zuw.vorlagenId)}</div>
        <div style="font-size:.76rem;color:#92400e">${escHtml(tenant?.name||'')}${maHinweis} • Nächste Fälligkeit: ${new Date(fristStr).toLocaleDateString('de-DE')}</div>
      </div>
      <button onclick="wiederkehrendeZuweisen('${zuw.vorlagenId}','${zuw.tenantId}','${fristStr}','${zuw.zugewiesenAn||''}')" class="btn btn-sm" style="background:#f59e0b;color:#fff;font-size:.72rem;white-space:nowrap">➕ Neu zuweisen</button>
    </div>`;
  }).join('');

  const block = `<div class="card" style="margin-bottom:14px;border:2px solid #fde68a;background:#fffbeb">
    <div class="card-title" style="color:#92400e">🔄 Wiederkehrende Schulungen fällig (${liste.length})</div>
    ${html}
  </div>`;

  if (el) { el.innerHTML = block; el.style.display = ''; }
  if (elSub) { elSub.innerHTML = block; elSub.style.display = ''; }
}

async function wiederkehrendeZuweisen(vorlagenId, tenantId, frist, zugewiesenAn) {
  const id = 'zuw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const zugewiesenAnVal = zugewiesenAn || null;
  // Intervall aus Original-Zuweisung ermitteln
  const origZuw = zuweisungen.find(z => z.vorlagenId === vorlagenId && z.tenantId === tenantId &&
    (zugewiesenAnVal ? z.zugewiesenAn === zugewiesenAnVal : !z.zugewiesenAn));
  const intervall = origZuw?.intervallMonate || null;
  try {
    const res = await SB.post('zuweisungen', {
      id,
      vorlage_id: vorlagenId,
      tenant_id: tenantId,
      frist,
      pflicht: true,
      intervall_monate: intervall,          // Intervall erhalten!
      zugewiesen_an: zugewiesenAnVal        // individuelle Bindung erhalten!
    });
    if (res?.error) throw new Error(res.error.message);
    zuweisungen.push({ id, vorlagenId, tenantId, frist, pflicht: true, intervallMonate: intervall, zugewiesenAn: zugewiesenAnVal });
    formulare[id] = {};
    await sbAudit('WIEDERKEHREND_NEU', `Wiederkehrende Zuweisung: ${vorlagenId} → ${tenantId}${zugewiesenAnVal ? ` (MA: ${zugewiesenAnVal})` : ''}, Frist: ${frist}`);
    showToast('✅ Neue Zuweisung erstellt!', '#16a34a');
    // Hinweis-Zeile entfernen
    const btn = event?.target;
    if (btn) btn.closest('div[style*="padding"]')?.remove();
    if (currentUser.role === 'admin') { renderAdminStats(); renderAdminTenantTable(); renderAdminZuweisungen(); }
    else renderSubDashboard();
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

// ══════════════════════════════════════════════════════════════
//  FEATURE 4: QR-CODE-LOGIN FÜR MITARBEITER
// ══════════════════════════════════════════════════════════════

function qrLoginOeffnen(userId) {
  const user = APP_USERS.find(u => u.id === userId);
  if (!user) return;
  const modal = document.getElementById('qr-login-modal');
  if (!modal) return;

  // QR-Login-Link generieren (Token = userId als Base64)
  const token = btoa(JSON.stringify({ userId, ts: Date.now() }));
  const url = `${location.origin.replace(/^http:\/\//i, 'https://')}${location.pathname}?qrlogin=${encodeURIComponent(token)}`;

  document.getElementById('qr-login-name').textContent = user.name;
  document.getElementById('qr-login-email').textContent = user.email;
  document.getElementById('qr-login-url').textContent = url;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  document.getElementById('qr-login-img').src = qrUrl;
  document.getElementById('qr-login-drucken-btn').onclick = () => {
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>QR-Login: ${escHtml(user.name)}</title>
    <style>body{font-family:sans-serif;text-align:center;padding:40px}img{margin:20px auto;display:block}@media print{button{display:none}}</style></head>
    <body><h2>🔑 QR-Login</h2><h3>${escHtml(user.name)}</h3><p>${escHtml(user.email)}</p>
    <img src="${qrUrl}" width="200" height="200"><p style="font-size:.8em;color:#666">QR-Code scannen → direkt einloggen (kein Passwort nötig)</p>
    <p style="font-size:.7em;color:#999">Gültig für: ${escHtml(user.email)}</p>
    <button onclick="window.print()">🖨️ Drucken</button></body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };
  modal.style.display = 'flex';
}

function qrLoginSchliessen() {
  const modal = document.getElementById('qr-login-modal');
  if (modal) modal.style.display = 'none';
}

function qrLoginTeilen() {
  const url  = document.getElementById('qr-login-url').textContent;
  const name = document.getElementById('qr-login-name').textContent;
  if (navigator.share) {
    navigator.share({
      title: `QR-Login: ${name}`,
      text:  `Hallo ${name},\n\nHier ist dein persönlicher Login-Link für die Schulungs-App (SIBEDA).\nEinfach auf den Link tippen oder den QR-Code scannen:\n\n${url}\n\nKein Passwort nötig.`,
      url
    }).catch(() => {});
  } else {
    // Fallback: Link in Zwischenablage
    navigator.clipboard.writeText(url)
      .then(() => showToast('✅ Link kopiert!'))
      .catch(() => showToast('❌ Teilen nicht möglich – bitte Link manuell kopieren.'));
  }
}

function qrLoginEmail() {
  const url  = document.getElementById('qr-login-url').textContent;
  const name = document.getElementById('qr-login-name').textContent;
  const email = document.getElementById('qr-login-email').textContent;
  const betreff = encodeURIComponent(`Dein QR-Login für die Schulungs-App – ${name}`);
  const body = encodeURIComponent(
`Hallo ${name},

hier ist dein persönlicher Login-Link für die Schulungs-App von SIBEDA.

👉 Einfach auf den Link tippen:
${url}

Alternativ: QR-Code in der App scannen (kein Passwort nötig).

Bei Fragen wende dich an deinen Vorgesetzten.

Mit freundlichen Grüßen
SIBEDA`
  );
  window.location.href = `mailto:${encodeURIComponent(email)}?subject=${betreff}&body=${body}`;
}

async function pruefeQrLogin() {
  const params = new URLSearchParams(location.search);
  const token = params.get('qrlogin');
  if (!token) return false;

  try {
    const data = JSON.parse(atob(decodeURIComponent(token)));
    const userId = data.userId;
    if (!userId) return false;

    // Token-Alter prüfen (max. 365 Tage — QR-Codes sind langlebig)
    const alter = Date.now() - (data.ts || 0);
    if (alter > 365 * 24 * 60 * 60 * 1000) {
      showToast('⚠️ Dieser QR-Login-Link ist abgelaufen. Bitte neuen QR-Code anfordern.', '#f59e0b');
      setTimeout(() => { history.replaceState({}, '', location.pathname); showScreen('screen-login'); }, 3000);
      return true;
    }

    showScreen('screen-loading');
    document.getElementById('loading-msg').textContent = 'QR-Login wird verarbeitet…';

    // User aus DB laden
    await initApp_loadData();
    const user = APP_USERS.find(u => u.id === userId);
    if (!user) {
      showToast('❌ Benutzer nicht gefunden.', '#dc2626');
      setTimeout(() => showScreen('screen-login'), 2000);
      return true;
    }

    // URL-Parameter entfernen
    history.replaceState({}, '', location.pathname);

    // Session setzen
    const session = {
      id: user.id, name: user.name, email: user.email,
      role: user.role, tenantId: user.tenant_id,
      aktiv: user.aktiv !== false, archiviert: !!user.archiviert,
      expires: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000).toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    currentUser = session;
    startInactivityWatcher();
    await sbAudit('QR_LOGIN', `QR-Login: ${user.name} (${user.email})`);
    routeAfterLogin();
    return true;
  } catch(e) {
    console.warn('QR-Login Fehler:', e);
    return false;
  }
}

// Hilfsfunktion: Daten laden ohne vollen initApp()-Flow
async function initApp_loadData() {
  const [tenants, vorlagen, zuws, users] = await Promise.all([
    SB.get('tenants'),
    SB.get('vorlagen'),
    SB.get('zuweisungen'),
    SB.get('users', 'select=id,name,email,tenant_id,role,aktiv,archiviert')
  ]);
  APP_TENANTS = tenants;
  APP_USERS = users;
  SCHULUNG_VORLAGEN = vorlagen.map(v => ({
    ...v, intervallMonate: v.intervall_monate,
    abschnitte: typeof v.abschnitte === 'string' ? JSON.parse(v.abschnitte) : v.abschnitte
  }));
  zuweisungen = zuws.map(z => ({
    id: z.id, vorlagenId: z.vorlage_id, tenantId: z.tenant_id, frist: z.frist, pflicht: z.pflicht
  }));
  const forms = await SB.get('formulare');
  formulare = {};
  forms.forEach(f => {
    formulare[f.id] = {
      felder: typeof f.felder === 'string' ? JSON.parse(f.felder) : (f.felder || {}),
      gestartet: f.gestartet, abgeschlossen: f.abgeschlossen,
      abgeschlossenAm: f.abgeschlossen_am, abgeschlossenVon: f.abgeschlossen_von,
      pdfPath: f.pdf_path
    };
  });
}

// ══════════════════════════════════════════════════════════════
//  FEATURE 5: KALENDER-AMPEL (verbesserte Darstellung)
// ══════════════════════════════════════════════════════════════

function renderKalenderVerbessert() {
  const el = document.getElementById('tab-kalender');
  if (!el) return;

  const jetzt = new Date();
  const monat = jetzt.getMonth();
  const jahr  = jetzt.getFullYear();

  // Filter-Optionen
  const filterHtml = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button onclick="kalenderFilter('alle',this)" class="btn btn-outline btn-sm active-kalender-filter" style="font-size:.78rem" id="kf-alle">🔍 Alle</button>
      <button onclick="kalenderFilter('rot',this)" class="btn btn-outline btn-sm" style="font-size:.78rem;border-color:#dc2626;color:#dc2626" id="kf-rot">🔴 Überfällig</button>
      <button onclick="kalenderFilter('gelb',this)" class="btn btn-outline btn-sm" style="font-size:.78rem;border-color:#f59e0b;color:#f59e0b" id="kf-gelb">🟡 Bald fällig</button>
      <button onclick="kalenderFilter('gruen',this)" class="btn btn-outline btn-sm" style="font-size:.78rem;border-color:#16a34a;color:#16a34a" id="kf-gruen">🟢 Abgeschlossen</button>
      <div style="margin-left:auto">
        <button onclick="pdfBerichtOeffnen()" class="btn btn-sm" style="background:#1a3a5c;color:#fff;font-size:.78rem">📄 PDF-Bericht</button>
      </div>
    </div>`;

  window._kalenderAktivFilter = 'alle';
  el.innerHTML = `<div class="card-title" style="font-size:1.1rem;margin-bottom:12px">📅 Schulungs-Kalender</div>${filterHtml}<div id="kalender-inhalt"></div>`;
  renderKalenderInhalt('alle');
}

function kalenderFilter(filter, btn) {
  window._kalenderAktivFilter = filter;
  document.querySelectorAll('.active-kalender-filter').forEach(b => b.classList.remove('active-kalender-filter'));
  if (btn) btn.classList.add('active-kalender-filter');
  renderKalenderInhalt(filter);
}

function renderKalenderInhalt(filter) {
  const el = document.getElementById('kalender-inhalt');
  if (!el) return;

  const jetzt = new Date();
  const monat = jetzt.getMonth();
  const jahr  = jetzt.getFullYear();

  let allEvents = [];
  // Nächste 6 Monate + Vergangenheit
  for (let m = -1; m < 6; m++) {
    const d = new Date(jahr, monat + m, 1);
    const events = zuweisungen
      .filter(z => {
        if (!z.frist) return false;
        const fd = new Date(z.frist);
        return fd.getFullYear() === d.getFullYear() && fd.getMonth() === d.getMonth();
      })
      .map(z => {
        const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
        const t = APP_TENANTS.find(tn => tn.id === z.tenantId);
        const s = berechneStatus(z);
        const fristDate = new Date(z.frist);
        const tage = Math.ceil((fristDate - jetzt) / 86400000);
        return { frist: z.frist, fristDate, titel: v?.titel || z.vorlagenId, tenant: t?.name || z.tenantId, status: s, tage, monat: d, zuwId: z.id };
      })
      .filter(e => filter === 'alle' || e.status === filter)
      .sort((a, b) => a.fristDate - b.fristDate);
    if (events.length > 0) allEvents.push({ monat: d, events });
  }

  if (allEvents.length === 0) {
    el.innerHTML = `<div class="card"><div style="text-align:center;padding:24px;color:#6b7280">✅ Keine Schulungen in diesem Zeitraum</div></div>`;
    return;
  }

  let html = '';
  allEvents.forEach(({ monat: d, events }) => {
    const monatName = d.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const istAktuell = d.getMonth() === jetzt.getMonth() && d.getFullYear() === jetzt.getFullYear();
    html += `<div class="card" style="margin-bottom:12px${istAktuell ? ';border:2px solid #1a3a5c' : ''}">
      <div class="card-title">${istAktuell ? '📍 ' : ''}📅 ${monatName}</div>`;
    html += events.map(e => {
      const ampelFarbe = e.status === 'gruen' ? '#16a34a' : e.status === 'gelb' ? '#f59e0b' : e.status === 'rot' ? '#dc2626' : '#9ca3af';
      const ampelBg   = e.status === 'gruen' ? '#f0fdf4' : e.status === 'gelb' ? '#fffbeb' : e.status === 'rot' ? '#fef2f2' : '#f9fafb';
      const tageText  = e.tage < 0 ? `${Math.abs(e.tage)} Tage überfällig` : e.tage === 0 ? 'Heute!' : `${e.tage} Tage`;
      return `<div onclick="kalenderEintragDetail('${e.zuwId}')" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f3f4f6;cursor:pointer;transition:background .15s" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background=''">
        <div style="min-width:36px;text-align:center;background:${ampelBg};border-radius:8px;padding:4px 2px">
          <div style="font-size:1rem;font-weight:800;color:${ampelFarbe}">${new Date(e.frist).getDate()}.</div>
        </div>
        <div style="flex:1">
          <div style="font-size:.88rem;font-weight:600">${escHtml(e.titel)}</div>
          <div style="font-size:.76rem;color:#6b7280">${escHtml(e.tenant)}</div>
        </div>
        <div style="text-align:right">
          ${statusBadgeHtml(e.status)}
          <div style="font-size:.72rem;color:${ampelFarbe};font-weight:600;margin-top:2px">${tageText}</div>
        </div>
        <div style="font-size:1rem;color:#9ca3af;margin-left:4px">›</div>
      </div>`;
    }).join('');
    html += '</div>';
  });
  el.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
//  FEATURE 6: SUCHE / FILTER IM ADMIN-DASHBOARD
// ══════════════════════════════════════════════════════════════

function adminSucheAnwenden(suchtext) {
  adminSuchFilter = (suchtext || '').toLowerCase().trim();
  renderAdminTenantTable();
}

function renderAdminTenantTableMitSuche() {
  // Ersetzt die normale renderAdminTenantTable mit Suchfunktion
  const el = document.getElementById('admin-tenant-table');
  if (!el) return;

  let gefiltert = APP_TENANTS;
  if (adminSuchFilter) {
    gefiltert = APP_TENANTS.filter(t =>
      t.name.toLowerCase().includes(adminSuchFilter) ||
      (t.email || '').toLowerCase().includes(adminSuchFilter)
    );
  }

  if (!gefiltert.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:#6b7280">
      ${adminSuchFilter ? `Kein Unternehmen gefunden für "<strong>${escHtml(adminSuchFilter)}</strong>"` : 'Noch keine Unternehmen angelegt'}
    </div>`;
    return;
  }

  const rows = gefiltert.map(t => {
    const zuws    = zuweisungen.filter(z => z.tenantId === t.id);
    const gruen   = zuws.filter(z => berechneStatus(z) === 'gruen').length;
    const gesamt  = zuws.length;
    const pct     = gesamt > 0 ? Math.round(gruen / gesamt * 100) : 0;
    const farbe   = pct === 100 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#dc2626';
    const offen   = zuws.filter(z => berechneStatus(z) === 'rot').length;
    return `<div onclick="zeigeAdminDetail('${t.id}')" style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6;cursor:pointer">
      <div style="flex:1">
        <div style="font-size:.9rem;font-weight:600">${escHtml(t.name)}</div>
        <div style="font-size:.75rem;color:#6b7280">${gesamt} Schulung${gesamt !== 1 ? 'en' : ''} • ${gruen} abgeschlossen</div>
      </div>
      <div style="min-width:80px">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;margin-bottom:3px">
          <span style="color:${farbe};font-weight:700">${pct}%</span>
          ${offen > 0 ? `<span style="color:#dc2626;font-size:.7rem">⚠️ ${offen} offen</span>` : '<span style="color:#16a34a;font-size:.7rem">✅</span>'}
        </div>
        <div style="background:#f3f4f6;border-radius:6px;height:8px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${farbe};border-radius:6px"></div>
        </div>
      </div>
      <div style="font-size:1rem;color:#9ca3af">›</div>
    </div>`;
  }).join('');

  el.innerHTML = rows;
}

// ══════════════════════════════════════════════════════════════
//  FEATURE 7: E-MAIL-BENACHRICHTIGUNGEN via Supabase Edge Fn.
// ══════════════════════════════════════════════════════════════

// Supabase Edge Function URL (muss in Supabase deployed werden)
// ══════════════════════════════════════════════════════════════
//  E-MAIL VERSAND via lokalem SMTP-Proxy (Port 8765)
// ══════════════════════════════════════════════════════════════
const EMAIL_PROXY_URL = 'http://localhost:8765/send-email';

async function sendLoginEmail({ an, name, rolle, passwort, unternehmen }) {
  const rollenLabel = rolle === 'firma' ? 'Unternehmensverwaltung'
                    : rolle === 'verantwortlicher' ? 'Verantwortlicher'
                    : 'Mitarbeiter';
  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1a3a5c;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">🎓 Ihre Zugangsdaten – CSC Schulungsmanagement</h2>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
      <p>Guten Tag <strong>${escHtml(name)}</strong>,</p>
      <p>Ihr Zugang zur CSC Schulungsmanagement-App wurde eingerichtet. Bitte melden Sie sich mit folgenden Daten an:</p>
      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:16px 0">
        <div style="margin-bottom:8px"><strong>Rolle:</strong> ${rollenLabel}</div>
        ${unternehmen ? `<div style="margin-bottom:8px"><strong>Unternehmen:</strong> ${escHtml(unternehmen)}</div>` : ''}
        <div style="margin-bottom:8px"><strong>E-Mail:</strong> <code style="background:#e0f2fe;padding:2px 6px;border-radius:4px">${escHtml(an)}</code></div>
        <div><strong>Passwort:</strong> <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:1rem">${escHtml(passwort)}</code></div>
      </div>
      <p>⚠️ <strong>Bitte ändern Sie Ihr Passwort nach dem ersten Login.</strong></p>
      <p><a href="https://schulung.csc-hannover.de" style="background:#1a3a5c;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">🔗 Zur Schulungsapp</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="font-size:.8rem;color:#6b7280">CSC GmbH Schulungsmanagement • <a href="https://schulung.csc-hannover.de">schulung.csc-hannover.de</a></p>
    </div>
  </div>`;
  try {
    const res = await fetch(EMAIL_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: an,
        subject: `🎓 Ihre Zugangsdaten – CSC Schulungsmanagement`,
        html
      })
    });
    return res.ok;
  } catch(e) {
    console.warn('E-Mail Versand fehlgeschlagen:', e.message);
    return false;
  }
}


const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6aWFua2J4dWlxd2VrZGJqZXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MDg1MTgsImV4cCI6MjA5NzI4NDUxOH0.placeholder';

async function emailBenachrichtigungSenden({ an, betreff, inhalt }) {
  // Prüft ob Edge Function verfügbar ist
  try {
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ to: an, subject: betreff, html: inhalt })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  } catch(e) {
    console.warn('E-Mail senden fehlgeschlagen (Edge Function nicht aktiv):', e.message);
    return false;
  }
}

function emailBetreffFrist(vorlage, tenant, tage) {
  return `⚠️ Schulungsfrist: ${vorlage} (${tenant}) – noch ${tage} Tage`;
}

function emailInhaltFrist(vorlage, tenant, frist, tage) {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1a3a5c;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">⚠️ Schulungsfrist läuft ab</h2>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
      <p>Guten Tag,</p>
      <p>die folgende Schulung läuft bald ab:</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0">
        <strong>${vorlage}</strong><br>
        Unternehmen: ${tenant}<br>
        Frist: <strong>${new Date(frist).toLocaleDateString('de-DE')}</strong><br>
        Verbleibende Tage: <strong style="color:${tage < 7 ? '#dc2626' : '#f59e0b'}">${tage} Tage</strong>
      </div>
      <p>Bitte stellen Sie sicher, dass die Schulung rechtzeitig abgeschlossen wird.</p>
      <p><a href="https://schulung.csc-hannover.de" style="background:#1a3a5c;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">🔗 Zur Schulungsapp</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="font-size:.8rem;color:#6b7280">CSC GmbH Schulungsmanagement • <a href="https://schulung.csc-hannover.de">schulung.csc-hannover.de</a></p>
    </div>
  </div>`;
}

// E-Mail-Test (Admin → Einstellungen)
async function emailTestSenden() {
  const ergebnis = await emailBenachrichtigungSenden({
    an: currentUser.email,
    betreff: '✅ Test-E-Mail Schulungsmanagement',
    inhalt: `<p>Dies ist eine Test-E-Mail vom CSC Schulungsmanagement-System.<br>Wenn Sie diese E-Mail erhalten, funktioniert der E-Mail-Versand korrekt.</p>`
  });
  showToast(ergebnis ? '✅ Test-E-Mail gesendet!' : '⚠️ E-Mail-Versand nicht konfiguriert (Edge Function fehlt)', ergebnis ? '#16a34a' : '#f59e0b');
}

// ══════════════════════════════════════════════════════════════
//  FEATURE 8: SCHULUNGSHISTORIE PRO MITARBEITER
// ══════════════════════════════════════════════════════════════

async function zeigeSchulungshistorie(userId) {
  const user = APP_USERS.find(u => u.id === userId);
  if (!user) return;

  const modal = document.getElementById('historie-modal');
  if (!modal) return;

  document.getElementById('historie-name').textContent = user.name;
  document.getElementById('historie-inhalt').innerHTML = '<div style="text-align:center;padding:24px;color:#6b7280">⏳ Wird geladen…</div>';
  modal.style.display = 'flex';

  try {
    // SICHERHEIT: Nur Formulare aus Zuweisungen des eigenen Tenants laden
    // (Cross-Tenant-Schutz: filter über zuweisung_id die zum eigenen Tenant gehören)
    const eigeneZuwIds = zuweisungen
      .filter(z => z.tenantId === currentUser.tenantId)
      .map(z => z.id);

    const alleFormulareRaw = await SB.get('formulare',
      `abgeschlossen_von=eq.${encodeURIComponent(userId)}&order=abgeschlossen_am.desc&limit=100`
    );

    // Nur Formulare aus Zuweisungen dieses Tenants anzeigen
    const alleFormulare = alleFormulareRaw.filter(f =>
      eigeneZuwIds.includes(f.id) || eigeneZuwIds.includes(f.zuweisung_id)
    );

    // Lernpfad-Unterschrift für diesen Mitarbeiter laden
    // Neuesten UNTERZEICHNETEN Durchgang laden (Platzhalter ohne unterzeichnet_am ignorieren)
    const lpUntRow = await (async () => {
      try {
        const rows = await SB.select('lernpfad_unterschriften',
          `user_id=eq.${userId}&tenant_id=eq.${encodeURIComponent(currentUser.tenantId || '')}&unterzeichnet_am=not.is.null&order=durchgang.desc&limit=1`);
        return rows && rows.length ? rows[0] : null;
      } catch(e) { return null; }
    })();

    if (!alleFormulare.length && !lpUntRow) {
      document.getElementById('historie-inhalt').innerHTML =
        '<div style="text-align:center;padding:24px;color:#6b7280">📋 Noch keine abgeschlossenen Schulungen</div>';
      return;
    }

    const html = alleFormulare.map((f, idx) => {
      const zuw = zuweisungen.find(z => z.id === f.id);
      const v = zuw ? SCHULUNG_VORLAGEN.find(vl => vl.id === zuw.vorlagenId) : null;
      const t = zuw ? APP_TENANTS.find(tn => tn.id === zuw.tenantId) : null;

      // Felder aus DB laden
      const felder = (typeof f.felder === 'string') ? (() => { try { return JSON.parse(f.felder); } catch(e) { return {}; } })() : (f.felder || {});

      // Abschnitte + Felder aufbauen — nur ausgefüllte Werte + alle Unterschriften
      let abschnitteHtml = '';
      if (v && v.abschnitte && v.abschnitte.length) {
        v.abschnitte.forEach(ab => {
          const felderHtml = ab.felder.map(feld => {
            const val = felder[feld.id];

            if (feld.typ === 'signature') {
              // Unterschriften IMMER anzeigen (auch leer)
              return `<div style="margin-bottom:10px">
                <div style="font-size:.72rem;color:#6b7280;margin-bottom:3px;font-weight:600">✍️ ${escHtml(feld.label)}</div>
                ${val
                  ? `<img src="${val}" style="max-width:220px;max-height:70px;border:1px solid #d1d5db;border-radius:6px;background:#fff;padding:3px;display:block">`
                  : `<span style="color:#9ca3af;font-size:.8rem">– keine Unterschrift –</span>`}
              </div>`;
            }

            // Leere Felder weglassen
            if (!val && val !== false) return '';

            if (feld.typ === 'checkbox') {
              if (!val) return ''; // unchecked weglassen
              return `<div style="margin-bottom:4px;font-size:.82rem;color:#1f2937">
                <span style="color:#16a34a;font-weight:700">✓</span> ${escHtml(feld.label)}
              </div>`;
            }

            return `<div style="margin-bottom:5px">
              <div style="font-size:.68rem;color:#9ca3af;margin-bottom:1px">${escHtml(feld.label)}</div>
              <div style="font-size:.82rem;color:#1f2937">${escHtml(String(val))}</div>
            </div>`;
          }).join('');

          // Abschnitt nur anzeigen wenn mindestens ein Feld Inhalt hat
          if (!felderHtml.trim()) return;

          abschnitteHtml += `<div style="margin-bottom:12px">
            <div style="font-size:.7rem;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:.06em;
                        padding:3px 6px;background:#eff6ff;border-left:3px solid #1e3a5f;margin-bottom:6px">
              ${escHtml(ab.titel)}
            </div>
            <div style="padding-left:6px">${felderHtml}</div>
          </div>`;
        });
      }

      // Fallback: rohe sig_0/sig_1/... Keys direkt aus felder anzeigen (alte Formulare)
      if (!abschnitteHtml) {
        const sigEntries = Object.entries(felder).filter(([k,v]) => typeof v === 'string' && v.startsWith('data:image'));
        const textEntries = Object.entries(felder).filter(([k,v]) => typeof v === 'string' && !v.startsWith('data:image') && v.trim());
        if (sigEntries.length || textEntries.length) {
          let fallbackHtml = '';
          if (textEntries.length) {
            fallbackHtml += textEntries.map(([k,v]) =>
              `<div style="margin-bottom:5px">
                <div style="font-size:.68rem;color:#9ca3af">${escHtml(k)}</div>
                <div style="font-size:.82rem;color:#1f2937">${escHtml(v)}</div>
              </div>`).join('');
          }
          if (sigEntries.length) {
            fallbackHtml += `<div style="margin-bottom:10px">
              <div style="font-size:.7rem;font-weight:700;color:#1e3a5f;text-transform:uppercase;letter-spacing:.06em;
                          padding:3px 6px;background:#eff6ff;border-left:3px solid #1e3a5f;margin-bottom:6px">Unterschriften</div>
              ${sigEntries.map(([k,v]) => `
                <div style="margin-bottom:8px">
                  <div style="font-size:.72rem;color:#6b7280;margin-bottom:3px;font-weight:600">✍️ Unterschrift</div>
                  <img src="${v}" style="max-width:220px;max-height:70px;border:1px solid #d1d5db;border-radius:6px;background:#fff;padding:3px;display:block">
                </div>`).join('')}
            </div>`;
          }
          abschnitteHtml = fallbackHtml;
        } else {
          abschnitteHtml = '<div style="color:#9ca3af;font-size:.8rem;padding:8px 0">Kein Formularinhalt gespeichert.</div>';
        }
      }

      return `<div style="border:1px solid #d1d5db;border-radius:10px;margin-bottom:18px;overflow:hidden;background:#fff">
        <!-- Schulungs-Header -->
        <div style="background:#1e3a5f;padding:12px 16px">
          <div style="font-size:1rem;font-weight:700;color:#fff">✅ ${escHtml(v?.titel || f.id)}</div>
          <div style="font-size:.76rem;color:#bfdbfe;margin-top:3px">
            ${t ? escHtml(t.name) + ' · ' : ''}
            ${f.abgeschlossen_am ? datumStr(f.abgeschlossen_am) : '–'}
            ${f.abgeschlossen_von ? ' · ' + escHtml(userNameVonId(f.abgeschlossen_von, zuw?.tenantId) || f.abgeschlossen_von) : ''}
          </div>
        </div>
        <!-- Schulungsinhalt -->
        <div style="padding:14px 16px">
          ${abschnitteHtml}
        </div>
        <!-- Footer mit PDF-Button -->
        ${f.pdf_path ? `<div style="padding:8px 16px;border-top:1px solid #f3f4f6;background:#f9fafb">
          <a href="${f.pdf_path}" target="_blank" class="btn btn-outline btn-sm" style="font-size:.78rem">📄 PDF-Nachweis öffnen</a>
        </div>` : ''}
      </div>`;
    }).join('');

    // Lernpfad-Unterschrift-Block für die Historie
    let lpUntHistorieBlock = '';
    if (lpUntRow && lpUntRow.unterzeichnet_am) {
      const maDatum = new Date(lpUntRow.unterzeichnet_am).toLocaleString('de-DE',
        { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const vDatum = lpUntRow.verantwortlicher_am
        ? new Date(lpUntRow.verantwortlicher_am).toLocaleString('de-DE',
            { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
        : null;
      lpUntHistorieBlock = `
        <div style="border:2px solid ${vDatum ? '#86efac' : '#fde68a'};border-radius:10px;margin-bottom:18px;overflow:hidden;background:#fff">
          <div style="background:${vDatum ? '#0f5132' : '#92400e'};padding:12px 16px">
            <div style="font-size:1rem;font-weight:700;color:#fff">📚 Lernpfad (29 Kapitel) — Unterschriften</div>
            <div style="font-size:.76rem;color:${vDatum ? '#bbf7d0' : '#fef3c7'};margin-top:3px">
              ${vDatum ? '✅ Vollständig unterzeichnet' : '⚠️ Mitarbeiter unterzeichnet — Verantwortlicher ausstehend'}
            </div>
          </div>
          <div style="padding:14px 16px">
            <div style="margin-bottom:8px">
              <div style="font-size:.68rem;color:#9ca3af;margin-bottom:2px">👤 Mitarbeiter</div>
              <div style="font-size:.85rem;font-weight:700;color:#1f2937">${escHtml(lpUntRow.vollname)}</div>
              <div style="font-size:.78rem;color:#6b7280">Unterzeichnet am ${maDatum}</div>
            </div>
            ${vDatum ? `
            <div style="padding-top:8px;border-top:1px solid #e5e7eb">
              <div style="font-size:.68rem;color:#9ca3af;margin-bottom:2px">🧑‍💼 Verantwortlicher</div>
              <div style="font-size:.85rem;font-weight:700;color:#1f2937">${escHtml(lpUntRow.verantwortlicher_name)}</div>
              <div style="font-size:.78rem;color:#6b7280">Gegengezeichnet am ${vDatum}</div>
            </div>` : `
            <div style="padding-top:8px;border-top:1px solid #e5e7eb">
              <button onclick="lernpfadVerantwortlicherUnterzeichnen('${userId}');historieSchliessen();"
                style="background:#0f5132;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:.85rem;font-weight:700;cursor:pointer;width:100%">
                ✍️ Jetzt gegenzeichnen
              </button>
            </div>`}
          </div>
        </div>`;
    }

    document.getElementById('historie-inhalt').innerHTML = `
      <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.85rem;color:#6b7280">${alleFormulare.length} Schulung${alleFormulare.length !== 1 ? 'en' : ''} abgeschlossen</span>
        ${(currentUser.role === 'verantwortlicher' || currentUser.role === 'firma' || currentUser.role === 'admin') ? `
        <button onclick="generiereSchulungsnachweisPDF('${userId}')" id="pdf-nachweis-btn"
          style="background:#1e3a5f;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer">
          📄 PDF-Nachweis
        </button>` : ''}
      </div>
      ${lpUntHistorieBlock}${html}`;
  } catch(e) {
    document.getElementById('historie-inhalt').innerHTML =
      `<div style="color:#dc2626;padding:12px">Fehler: ${escHtml(e.message)}</div>`;
  }
}

function historieSchliessen() {
  const modal = document.getElementById('historie-modal');
  if (modal) modal.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
//  BEREICHS-EINWEISUNG (Masseneinweisung nach Bereich/Objekt)
// ══════════════════════════════════════════════════════════════
let _beMitarbeiterAlle = []; // alle aktiven MA des Tenants (gecacht)

async function bereichsEinweisungOeffnen() {
  const modal = document.getElementById('bereichs-einweisung-modal');
  if (!modal) return;

  // Reset
  document.getElementById('be-vorlage-id').value = '';
  document.getElementById('be-vorlage-suche').value = '';
  document.getElementById('be-vorlage-label').style.display = 'none';
  document.getElementById('be-frist').value = '';
  document.getElementById('be-pflicht').checked = true;
  document.getElementById('be-msg').textContent = '';

  modal.style.display = 'flex';

  // Mitarbeiter laden
  const listEl = document.getElementById('be-mitarbeiter-list');
  listEl.innerHTML = '<div style="color:#6b7280;font-size:.85rem;padding:8px">⏳ Wird geladen…</div>';

  try {
    const ma = await SB.get('users',
      `tenant_id=eq.${encodeURIComponent(currentUser.tenantId)}&role=eq.mitarbeiter&aktiv=eq.true&archiviert=eq.false&order=name.asc`
    );
    _beMitarbeiterAlle = ma || [];

    // Bereiche + Objekte (Standorte) sammeln
    const bereiche  = [...new Set(ma.map(m => m.bereich).filter(Boolean))].sort();
    const objekte   = [...new Set(ma.map(m => m.standort).filter(Boolean))].sort();

    const bSel = document.getElementById('be-bereich-select');
    bSel.innerHTML = '<option value="">— Alle Mitarbeiter —</option>' +
      bereiche.map(b => `<option value="${escHtml(b)}">🏷 ${escHtml(b)}</option>`).join('');

    const oSel = document.getElementById('be-objekt-select');
    oSel.innerHTML = '<option value="">— Alle Objekte —</option>' +
      objekte.map(o => `<option value="${escHtml(o)}">📍 ${escHtml(o)}</option>`).join('');

    bereichsEinweisungFilterAnwenden();
    bereichsVorlagenSuche('');
  } catch(e) {
    listEl.innerHTML = `<div style="color:#dc2626;font-size:.85rem;padding:8px">Fehler: ${escHtml(e.message)}</div>`;
  }
}

function bereichsEinweisungFilterAnwenden() {
  const bereich = document.getElementById('be-bereich-select')?.value || '';
  const objekt  = document.getElementById('be-objekt-select')?.value  || '';

  let liste = _beMitarbeiterAlle;
  if (bereich) liste = liste.filter(m => m.bereich  === bereich);
  if (objekt)  liste = liste.filter(m => m.standort === objekt);

  const listEl = document.getElementById('be-mitarbeiter-list');
  if (!liste.length) {
    listEl.innerHTML = '<div style="color:#6b7280;font-size:.85rem;padding:8px;text-align:center">Keine aktiven Mitarbeiter für diesen Filter</div>';
    document.getElementById('be-ausgewaehlt-info').textContent = '';
    return;
  }

  listEl.innerHTML = liste.map(m => `
    <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;transition:background .1s"
      onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''">
      <input type="checkbox" class="be-ma-cb" value="${m.id}" checked
        style="width:16px;height:16px;accent-color:#1a3a5c;cursor:pointer;flex-shrink:0"
        onchange="bereichsAuswahlInfo()">
      <div style="flex:1;min-width:0">
        <div style="font-size:.86rem;font-weight:600;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(m.name)}</div>
        <div style="font-size:.74rem;color:#6b7280;display:flex;gap:8px;flex-wrap:wrap;margin-top:1px">
          ${m.bereich  ? `<span>🏷 ${escHtml(m.bereich)}</span>`  : ''}
          ${m.standort ? `<span>📍 ${escHtml(m.standort)}</span>` : ''}
        </div>
      </div>
    </label>`).join('');

  bereichsAuswahlInfo();
}

function bereichsAlleWaehlen(ja) {
  document.querySelectorAll('.be-ma-cb').forEach(cb => cb.checked = ja);
  bereichsAuswahlInfo();
}

function bereichsAuswahlInfo() {
  const alle   = document.querySelectorAll('.be-ma-cb').length;
  const gew    = document.querySelectorAll('.be-ma-cb:checked').length;
  const infoEl = document.getElementById('be-ausgewaehlt-info');
  infoEl.textContent = gew === 0
    ? '⚠️ Keine Mitarbeiter ausgewählt'
    : `${gew} von ${alle} Mitarbeitern ausgewählt`;
}

function bereichsVorlagenSuche(suche) {
  const el = document.getElementById('be-vorlage-liste');
  if (!el) return;
  const s = (suche || '').toLowerCase().trim();
  // Admin-Vorlagen = alle SCHULUNG_VORLAGEN (bereits tenant-gefiltert)
  // Verantwortliche haben Zugriff auf eigene Tenant-Vorlagen
  // Wir laden frisch aus dem globalen Array (nach Mandantentrennung)
  // Falls leer (Verantwortlicher hat keine eigenen Zuweisungen), alle zeigen
  let vorlagen = SCHULUNG_VORLAGEN;

  // Lernpfad-Eintrag immer oben (außer wenn Suchbegriff nicht passt)
  const lernpfadMatch = !s || 'lernpfad'.includes(s) || '29 kapitel'.includes(s);
  const lernpfadHtml = lernpfadMatch ? `
    <div onclick="bereichsVorlageWaehlen('${LERNPFAD_VORLAGE_ID}','📚 Lernpfad (29 Kapitel)')"
      style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f0f2f5;transition:background .1s;background:#f5f3ff"
      onmouseover="this.style.background='#ede9fe'" onmouseout="this.style.background='#f5f3ff'">
      <div style="font-weight:600;font-size:.86rem;color:#6b21a8">📚 Lernpfad (29 Kapitel)</div>
      <div style="font-size:.75rem;color:#7c3aed;margin-top:2px">Säulen A–D · Gesetzliche Basis, Chemie/GHS, DSGVO, 4-Farben-System · inkl. Unterschrift</div>
    </div>` : '';

  if (!vorlagen.length && !lernpfadMatch) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:.84rem">Keine Schulungsvorlagen verfügbar</div>';
    return;
  }
  const gef = s ? vorlagen.filter(v => v.titel.toLowerCase().includes(s) || (v.beschreibung||'').toLowerCase().includes(s)) : vorlagen;
  if (!gef.length && !lernpfadMatch) {
    el.innerHTML = `<div style="padding:12px;text-align:center;color:#9ca3af;font-size:.84rem">Keine Vorlage für „${escHtml(s)}"</div>`;
    return;
  }
  el.innerHTML = lernpfadHtml + gef.map((v, i) => `
    <div onclick="bereichsVorlageWaehlen('${v.id}','${escHtml(v.titel).replace(/'/g,'&#39;')}')"
      style="padding:10px 12px;cursor:pointer;border-bottom:${i===gef.length-1?'none':'1px solid #f0f2f5'};transition:background .1s"
      onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''">
      <div style="font-weight:600;font-size:.86rem;color:#1a3a5c">📄 ${escHtml(v.titel)}</div>
      ${v.beschreibung ? `<div style="font-size:.75rem;color:#6b7280;margin-top:2px">${escHtml(v.beschreibung)}</div>` : ''}
    </div>`).join('');
}

function bereichsVorlageWaehlen(id, titel) {
  document.getElementById('be-vorlage-id').value   = id;
  const lbl = document.getElementById('be-vorlage-label');
  lbl.textContent = `✅ ${titel}`;
  lbl.style.display = 'block';
  document.getElementById('be-vorlage-liste').innerHTML = '';
  document.getElementById('be-vorlage-suche').value = '';
}

async function bereichsZuweisungErstellen() {
  const msgEl    = document.getElementById('be-msg');
  const vorlagenId = document.getElementById('be-vorlage-id').value;
  const frist    = document.getElementById('be-frist').value;
  const pflicht  = document.getElementById('be-pflicht').checked;

  if (!vorlagenId) { msgEl.textContent = '⚠️ Bitte ein Schulungsthema wählen.'; return; }
  if (!frist)      { msgEl.textContent = '⚠️ Bitte eine Frist angeben.'; return; }

  const ausgewaehlt = [...document.querySelectorAll('.be-ma-cb:checked')].map(cb => cb.value);
  if (!ausgewaehlt.length) { msgEl.textContent = '⚠️ Bitte mindestens einen Mitarbeiter auswählen.'; return; }

  msgEl.style.color = '#1a3a5c';
  msgEl.textContent = `⏳ ${ausgewaehlt.length} Zuweisung(en) werden angelegt…`;
  const btn = document.getElementById('be-zuweisen-btn');
  btn.disabled = true;

  const ts = Date.now();
  const neu = ausgewaehlt.map((userId, i) => ({
    id:             `z_${currentUser.tenantId}_${vorlagenId}_${userId}_${ts + i}`,
    vorlage_id:     vorlagenId,
    tenant_id:      currentUser.tenantId,
    frist,
    pflicht,
    zugewiesen_an:  userId
  }));

  try {
    await SB.post('zuweisungen', neu);
    // Lokal aktualisieren
    neu.forEach(z => zuweisungen.push({
      id: z.id, vorlagenId: z.vorlage_id, tenantId: z.tenant_id,
      frist: z.frist, pflicht: z.pflicht,
      intervallMonate: null, zugewiesenAn: z.zugewiesen_an
    }));
    const namen = ausgewaehlt.map(uid => {
      const m = _beMitarbeiterAlle.find(m => m.id === uid);
      return m ? m.name : uid;
    }).join(', ');
    const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === vorlagenId);
    await sbAudit('BEREICHS-EINWEISUNG',
      `Vorlage "${vorlage?.titel || vorlagenId}" → ${ausgewaehlt.length} MA (Frist: ${frist}): ${namen.substring(0, 120)}`
    );
    msgEl.style.color = '#16a34a';
    msgEl.textContent = `✅ ${ausgewaehlt.length} Schulungszuweisung(en) erfolgreich erstellt!`;
    setTimeout(() => {
      bereichsEinweisungSchliessen();
      renderMitarbeiterListe();
      showToast(`✅ ${ausgewaehlt.length} Einweisungen für "${vorlage?.titel || vorlagenId}" zugewiesen`, '#16a34a');
    }, 1400);
  } catch(e) {
    msgEl.style.color = '#dc2626';
    msgEl.textContent = 'Fehler: ' + e.message;
    btn.disabled = false;
  }
}

function bereichsEinweisungSchliessen() {
  const modal = document.getElementById('bereichs-einweisung-modal');
  if (modal) modal.style.display = 'none';
  document.getElementById('be-zuweisen-btn').disabled = false;
  _beMitarbeiterAlle = [];
}

// Schnellauswahl Frist-Monate im Bereichs-Einweisungs-Modal
function beFristMonat(monate) {
  const d = new Date();
  d.setMonth(d.getMonth() + monate);
  const iso = d.toISOString().split('T')[0];
  const input = document.getElementById('be-frist');
  if (!input) return;
  input.value = iso;
  // min-Attribut setzen damit Kalender auf diesen Monat springt
  input.min = new Date().toISOString().split('T')[0];
  // Aktiven Button highlighten
  const btns = input.parentElement?.querySelectorAll('button');
  if (btns) btns.forEach(b => {
    const isActive = b.textContent.trim() === `${monate} M`;
    b.style.background = isActive ? '#1e3a5f' : '#f9fafb';
    b.style.color = isActive ? '#fff' : '#1e3a5f';
    b.style.borderColor = isActive ? '#1e3a5f' : '#d1d5db';
  });
  // Kalender öffnen (springt automatisch zum gesetzten Monat)
  try { input.showPicker(); } catch(e) { input.focus(); }
}


// ── KALENDER: Detailansicht einer Zuweisung (alle betroffenen Mitarbeiter) ──
function kalenderEintragDetail(zuwId) {
  const z = zuweisungen.find(zw => zw.id === zuwId);
  if (!z) return;
  const isLP = z.vorlagenId === LERNPFAD_VORLAGE_ID;
  const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
  const t = APP_TENANTS.find(tn => tn.id === z.tenantId);
  const titel = isLP ? '📚 Lernpfad (29 Kapitel)' : (v?.titel || z.vorlagenId);
  const fristAnzeige = z.frist ? datumStr(z.frist) : '–';
  const heute = new Date();
  const fristDate = z.frist ? new Date(z.frist) : null;
  const tage = fristDate ? Math.ceil((fristDate - heute) / 86400000) : null;
  const ueberfaellig = tage !== null && tage < 0;
  const tageText = tage === null ? '' : ueberfaellig
    ? `⚠️ ${Math.abs(tage)} Tage überfällig`
    : tage === 0 ? '⚠️ Heute fällig!' : `📅 Noch ${tage} Tage`;

  // Alle Mitarbeiter des Tenants
  const mitarbeiter = APP_USERS.filter(u =>
    u.tenant_id === z.tenantId && u.role === 'mitarbeiter' && !u.archiviert && u.aktiv !== false
  );

  // Formular dieser Zuweisung
  const f = formulare[z.id] || {};

  // Aufteilen: abgeschlossen vs. ausstehend/überfällig
  const abgeschlossen = mitarbeiter.filter(m => f.abgeschlossen && f.abgeschlossenVon === m.id);
  const ausstehend = mitarbeiter.filter(m => !(f.abgeschlossen && f.abgeschlossenVon === m.id));

  function maZeile(m, done) {
    if (done) {
      const abgDat = f.abgeschlossenAm ? datumStr(f.abgeschlossenAm) : '';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:5px;
                border-radius:8px;background:#f0fdf4;border:1px solid #86efac">
        <div style="font-size:1.2rem">✅</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.9rem;color:#1e3a5f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.name)}</div>
          ${abgDat ? `<div style="font-size:.72rem;color:#16a34a">✅ Abgeschlossen am ${abgDat}</div>` : ''}
        </div>
        <div style="font-size:.75rem;font-weight:600;color:#16a34a;white-space:nowrap">Erledigt</div>
      </div>`;
    } else {
      const dot = ueberfaellig ? '🔴' : '🟡';
      const bg  = ueberfaellig ? '#fef2f2' : '#fffbeb';
      const brd = ueberfaellig ? '#fca5a5' : '#fde68a';
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:5px;
                border-radius:8px;background:${bg};border:1px solid ${brd}">
        <div style="font-size:1.2rem">${dot}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.88rem;color:#1e3a5f;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.name)}</div>
          <div style="font-size:.72rem;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(m.email || '')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
          <button onclick="event.stopPropagation();maAbschliessen('${zuwId}','${m.id}','${escHtml(m.name).replace(/'/g,"\\'")}');" type="button"
            style="font-size:.72rem;padding:4px 8px;border-radius:6px;border:1px solid #86efac;
                   background:#f0fdf4;color:#16a34a;cursor:pointer;white-space:nowrap;font-weight:600">
            ✅ Abhaken
          </button>
          <button onclick="event.stopPropagation();maErinnerungSenden('${zuwId}','${m.id}','${escHtml(m.name).replace(/'/g,"\\'")}','${escHtml(m.email || '')}');" type="button"
            style="font-size:.72rem;padding:4px 8px;border-radius:6px;border:1px solid #bfdbfe;
                   background:#eff6ff;color:#1d4ed8;cursor:pointer;white-space:nowrap;font-weight:600">
            📧 Erinnern
          </button>
        </div>
      </div>`;
    }
  }

  let inhalt = '';
  if (mitarbeiter.length === 0) {
    inhalt = `<div style="text-align:center;color:#6b7280;font-size:.88rem;padding:20px">Keine aktiven Mitarbeiter vorhanden</div>`;
  } else {
    // Erst Ausstehende/Überfällige, dann Abgeschlossene
    if (ausstehend.length > 0) {
      inhalt += `<div style="font-size:.78rem;font-weight:700;color:${ueberfaellig?'#dc2626':'#92400e'};margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">
        ${ueberfaellig ? '⚠️ Überfällig' : '⏳ Ausstehend'} (${ausstehend.length})
      </div>`;
      inhalt += ausstehend.map(m => maZeile(m, false)).join('');
    }
    if (abgeschlossen.length > 0) {
      inhalt += `<div style="font-size:.78rem;font-weight:700;color:#16a34a;margin-top:${ausstehend.length>0?'14px':'0'};margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">
        ✅ Abgeschlossen (${abgeschlossen.length})
      </div>`;
      inhalt += abgeschlossen.map(m => maZeile(m, true)).join('');
    }
  }

  const html = `
    <div id="kal-detail-overlay" onclick="if(event.target===this)kalenderDetailSchliessen()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:flex-end;justify-content:center">
      <div style="background:#fff;border-radius:18px 18px 0 0;width:100%;max-width:600px;max-height:88vh;
                  display:flex;flex-direction:column;overflow:hidden">

        <!-- Header -->
        <div style="padding:16px 20px 12px;border-bottom:1px solid #f3f4f6">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="flex:1">
              <div style="font-size:1rem;font-weight:800;color:#1e3a5f;line-height:1.3">${escHtml(titel)}</div>
              <div style="font-size:.8rem;color:#6b7280;margin-top:2px">${escHtml(t?.name || z.tenantId)}</div>
            </div>
            <button onclick="kalenderDetailSchliessen()" type="button"
              style="font-size:1.5rem;background:none;border:none;cursor:pointer;color:#9ca3af;padding:0;line-height:1;flex-shrink:0">×</button>
          </div>
          <!-- Frist-Info -->
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            <span style="font-size:.8rem;background:#f1f5f9;border-radius:6px;padding:4px 10px;color:#374151">
              📅 Frist: <strong>${fristAnzeige}</strong>
            </span>
            ${tageText ? `<span style="font-size:.8rem;border-radius:6px;padding:4px 10px;font-weight:600;
              background:${ueberfaellig?'#fef2f2':'#fffbeb'};color:${ueberfaellig?'#dc2626':'#92400e'}">
              ${tageText}
            </span>` : ''}
          </div>
          <!-- Fortschritt -->
          <div style="margin-top:10px">
            <div style="display:flex;justify-content:space-between;font-size:.75rem;color:#6b7280;margin-bottom:4px">
              <span>${abgeschlossen.length} von ${mitarbeiter.length} Mitarbeitern abgeschlossen</span>
              <span style="font-weight:700;color:${abgeschlossen.length===mitarbeiter.length?'#16a34a':'#dc2626'}">
                ${mitarbeiter.length>0?Math.round(abgeschlossen.length/mitarbeiter.length*100):0}%
              </span>
            </div>
            <div style="background:#f3f4f6;border-radius:999px;height:8px;overflow:hidden">
              <div style="width:${mitarbeiter.length>0?Math.round(abgeschlossen.length/mitarbeiter.length*100):0}%;height:100%;
                background:${abgeschlossen.length===mitarbeiter.length?'#16a34a':'#f59e0b'};border-radius:999px;transition:width .3s"></div>
            </div>
          </div>
        </div>

        <!-- Mitarbeiterliste -->
        <div style="padding:16px 20px;overflow-y:auto;flex:1">
          ${inhalt}
        </div>

        <!-- Footer -->
        <div style="padding:12px 20px;border-top:1px solid #f3f4f6">
          <button onclick="kalenderDetailSchliessen()" type="button"
            style="width:100%;padding:13px;background:#1e3a5f;color:#fff;border:none;border-radius:12px;font-size:.95rem;font-weight:700;cursor:pointer">
            Schließen
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

function kalenderDetailSchliessen() {
  const el = document.getElementById('kal-detail-overlay');
  if (el) el.remove();
}

// ── MITARBEITER: Detailansicht mit Dokumenten/Zuweisungen ────
function mitarbeiterDetailOeffnen(mId) {
  const m = APP_USERS.find(u => u.id === mId);
  if (!m) return;

  const meineZuws = zuweisungen.filter(z => z.tenantId === currentUser.tenantId);
  const heute = new Date();

  const zeilen = meineZuws.map(z => {
    const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
    const titel = v?.titel || z.vorlagenId;
    const f = formulare[z.id] || {};
    const fristDate = z.frist ? new Date(z.frist) : null;
    const tage = fristDate ? Math.ceil((fristDate - heute) / 86400000) : null;

    let dot, statusText, bg, border, abgDatum = '';
    if (f.abgeschlossen && f.abgeschlossenVon === m.id) {
      dot = '🟢'; statusText = 'Abgeschlossen'; bg = '#f0fdf4'; border = '#86efac';
      if (f.abgeschlossenAm) abgDatum = `<div style="font-size:.7rem;color:#16a34a">✅ ${datumStr(f.abgeschlossenAm)}</div>`;
    } else if (f.gestartet) {
      dot = '🟡'; statusText = 'In Bearbeitung'; bg = '#fffbeb'; border = '#fde68a';
    } else if (fristDate && fristDate < heute) {
      dot = '🔴'; statusText = 'Überfällig'; bg = '#fef2f2'; border = '#fca5a5';
    } else {
      dot = '⚪'; statusText = 'Offen'; bg = '#f9fafb'; border = '#e5e7eb';
    }

    const tageAnzeige = tage !== null
      ? (tage < 0 ? `<span style="color:#dc2626;font-size:.7rem">⚠️ ${Math.abs(tage)} Tage überfällig</span>`
        : tage === 0 ? `<span style="color:#dc2626;font-size:.7rem">⚠️ Heute!</span>`
        : `<span style="font-size:.7rem;color:#6b7280">📅 bis ${datumStr(z.frist)}</span>`)
      : '';

    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;margin-bottom:6px;
              border-radius:8px;background:${bg};border:1px solid ${border}">
      <div style="font-size:1.2rem;padding-top:1px">${dot}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.88rem;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(titel)}</div>
        <div style="margin-top:3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${tageAnzeige}
          ${abgDatum}
        </div>
      </div>
      <div style="font-size:.75rem;font-weight:700;color:#374151;flex-shrink:0">${statusText}</div>
    </div>`;
  }).join('');

  const gesamt = meineZuws.length;
  const abgeschl = meineZuws.filter(z => {
    const f = formulare[z.id] || {};
    return f.abgeschlossen && f.abgeschlossenVon === m.id;
  }).length;
  const offen = gesamt - abgeschl;

  const html = `
    <div id="ma-detail-overlay" onclick="if(event.target===this)mitarbeiterDetailSchliessen()"
      style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center">
      <div style="background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:600px;max-height:85vh;
                  display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="font-size:1.1rem;font-weight:800;color:#1e3a5f">👤 ${escHtml(m.name)}</div>
            <div style="font-size:.8rem;color:#6b7280;margin-top:2px">${escHtml(m.email)}</div>
            ${m.bereich ? `<div style="font-size:.78rem;color:#4b5563;margin-top:3px">🏷 ${escHtml(m.bereich)}</div>` : ''}
            ${m.standort ? `<div style="font-size:.78rem;color:#4b5563">📍 ${escHtml(m.standort)}</div>` : ''}
          </div>
          <button onclick="mitarbeiterDetailSchliessen()" type="button"
            style="font-size:1.4rem;background:none;border:none;cursor:pointer;color:#9ca3af;padding:0;line-height:1">×</button>
        </div>
        <div style="padding:12px 20px;background:#f9fafb;border-bottom:1px solid #f3f4f6;
                    display:flex;gap:16px">
          <div style="text-align:center">
            <div style="font-size:1.3rem;font-weight:800;color:#1e3a5f">${gesamt}</div>
            <div style="font-size:.72rem;color:#6b7280">Gesamt</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.3rem;font-weight:800;color:#16a34a">${abgeschl}</div>
            <div style="font-size:.72rem;color:#6b7280">Abgeschlossen</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:1.3rem;font-weight:800;color:#dc2626">${offen}</div>
            <div style="font-size:.72rem;color:#6b7280">Ausstehend</div>
          </div>
        </div>
        <div style="padding:16px 20px;overflow-y:auto;flex:1">
          ${gesamt === 0
            ? `<div style="text-align:center;color:#6b7280;padding:24px;font-size:.9rem">📋 Keine Zuweisungen vorhanden</div>`
            : zeilen}
        </div>
        <div style="padding:12px 20px;border-top:1px solid #f3f4f6">
          <button onclick="mitarbeiterDetailSchliessen()" type="button"
            style="width:100%;padding:12px;background:#1e3a5f;color:#fff;border:none;border-radius:10px;font-size:.95rem;font-weight:700;cursor:pointer">
            Schließen
          </button>
        </div>
      </div>
    </div>`;

  document.body.insertAdjacentHTML('beforeend', html);
}

function mitarbeiterDetailSchliessen() {
  const el = document.getElementById('ma-detail-overlay');
  if (el) el.remove();
}

// ── KALENDER-MODAL: Häkchen + Erinnerung ─────────────────────

async function maAbschliessen(zuwId, userId, userName) {
  if (!confirm(`Schulung für ${userName} als abgeschlossen markieren?`)) return;
  const ts = now();
  try {
    // Formular in DB abschließen
    const data = {
      id: zuwId, zuweisung_id: zuwId, felder: {}, gestartet: true,
      abgeschlossen: true, abgeschlossen_am: ts, abgeschlossen_von: userId,
      gespeichert_am: ts
    };
    await SB.upsert('formulare', data);
    formulare[zuwId] = { felder:{}, gestartet:true, abgeschlossen:true, abgeschlossenAm:ts, abgeschlossenVon:userId };
    await sbAudit('ABSCHLUSS_MANUELL', `Schulung manuell als abgeschlossen markiert für User ${userId} (Zuweisung ${zuwId})`);
    showToast(`✅ ${userName} als abgeschlossen markiert`, '#16a34a');
    // Modal neu laden
    kalenderDetailSchliessen();
    const z = zuweisungen.find(zw => zw.id === zuwId);
    if (z) kalenderEintragDetail(zuwId);
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

async function maErinnerungSenden(zuwId, userId, userName, userEmail) {
  if (!userEmail) { showToast('⚠️ Keine E-Mail-Adresse für diesen Nutzer', '#f59e0b'); return; }
  const z = zuweisungen.find(zw => zw.id === zuwId);
  const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z?.vorlagenId);
  const t = APP_TENANTS.find(tn => tn.id === z?.tenantId);
  const fristAnzeige = z?.frist ? new Date(z.frist).toLocaleDateString('de-DE') : '–';
  const tage = z?.frist ? Math.ceil((new Date(z.frist) - new Date()) / 86400000) : null;
  const titel = v?.titel || zuwId;
  const tenantName = t?.name || z?.tenantId || '';

  const betreff = `📚 Erinnerung: ${titel} – ${tenantName}`;
  const inhalt = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1a3a5c;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0">📚 Schulungs-Erinnerung</h2>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px">
      <p>Guten Tag ${escHtml(userName)},</p>
      <p>wir möchten Sie daran erinnern, dass folgende Schulung noch aussteht:</p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0">
        <strong>${escHtml(titel)}</strong><br>
        <span style="color:#6b7280">Unternehmen: ${escHtml(tenantName)}</span><br>
        <span style="color:#92400e">📅 Frist: ${fristAnzeige}${tage !== null ? ` (noch ${tage} Tage)` : ''}</span>
      </div>
      <p>Bitte führen Sie die Schulung zeitnah durch.</p>
      <p><a href="https://schulung.csc-hannover.de" style="background:#1a3a5c;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">🔗 Zur Schulungsapp</a></p>
      <p style="font-size:.8rem;color:#6b7280">CSC GmbH Schulungsmanagement</p>
    </div>
  </div>`;

  try {
    const ok = await emailBenachrichtigungSenden({ an: userEmail, betreff, inhalt });
    if (ok) {
      await sbAudit('ERINNERUNG_GESENDET', `Erinnerung an ${userEmail} für Schulung ${titel}`);
      showToast(`📧 Erinnerung an ${userName} gesendet`, '#1a3a5c');
    } else {
      showToast('⚠️ E-Mail-Versand nicht verfügbar', '#f59e0b');
    }
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

// ══════════════════════════════════════════════════════════════
//  LERNPFAD — Checklisten-System (Stufe 1)
//  Mitarbeiter haken ab → Verantwortlicher bestätigt → Supabase-Audit
//  Stufe 2+3 (Tests, Mehrsprachigkeit) separat geplant
// ══════════════════════════════════════════════════════════════

// Lokaler Cache für Lernpfad-Fortschritt (DB + localStorage)
let lernpfadFortschritt = {}; // { kap_01: { abgehakt: true, bestaetigtAm: '...', bestaetigtVon: '...' } }
let lernpfadAktuellerDurchgang = 1; // aktuell aktiver Durchgang (der laufende oder neue)
let lernpfadTenantKapitel = []; // { id, titel, beschreibung, reihenfolge } — von Tenant hinzugefügte Kapitel

const LP_STORAGE_KEY = () => `lernpfad_${currentUser?.userId || 'anon'}_d${lernpfadAktuellerDurchgang}`;
const SAEULE_FARBEN = { A: '#1a3a5c', B: '#7c3aed', C: '#b45309', D: '#6b21a8' };
const SAEULE_LABEL  = { A: '🛡 Säule A — Gesetzliche Basis', B: '🧪 Säule B — Reinigungstechnologie', C: '🔒 Säule C — Datenschutz & DSGVO', D: '🎨 Säule D — Das 4-Farben-System' };

// ── LERNPFAD-SPRACHE ─────────────────────────────────────────
const LP_SPRACHEN = [
  { code:'de', flag:'🇩🇪', label:'DE' },
  { code:'tr', flag:'🇹🇷', label:'TR' },
  { code:'ro', flag:'🇷🇴', label:'RO' },
  { code:'sr', flag:'🇷🇸', label:'SR' },
  { code:'pl', flag:'🇵🇱', label:'PL' },
  { code:'en', flag:'🇬🇧', label:'EN' },
  { code:'ar', flag:'🇸🇦', label:'AR' },
];
let lernpfadSprache = localStorage.getItem('lernpfad_sprache') || 'de';

// ── LERNPFAD-UNTERSCHRIFT: Texte in 7 Sprachen ───────────────
const LP_UNT_TEXTE = {
  hinweis_offen: {
    de: '✍️ Die Unterzeichnung wird freigeschaltet, wenn alle Kapitel abgehakt wurden.',
    tr: '✍️ İmzalama seçeneği, tüm 22 bölüm işaretlendiğinde etkinleştirilecektir.',
    ro: '✍️ Semnarea va fi activată după ce toate cele 22 de capitole au fost bifate.',
    sr: '✍️ Потписивање ће бити омогућено када се означе сва 22 поглавља.',
    pl: '✍️ Możliwość podpisania zostanie odblokowana po odhaczeniu wszystkich 22 rozdziałów.',
    en: '✍️ Signing will be unlocked once all 22 chapters have been checked off.',
    ar: '✍️ سيتم تفعيل التوقيع بعد الانتهاء من جميع الفصول الـ 22.'
  },
  hinweis_komplett: {
    de: '🎉 Alle Kapitel abgeschlossen! Bitte jetzt unterzeichnen.',
    tr: '🎉 Tüm 22 bölüm tamamlandı! Lütfen şimdi imzalayın.',
    ro: '🎉 Toate cele 22 de capitole au fost finalizate! Vă rugăm să semnați acum.',
    sr: '🎉 Свих 22 поглавља завршено! Молимо потпишите сада.',
    pl: '🎉 Wszystkie 22 rozdziały ukończone! Proszę teraz podpisać.',
    en: '🎉 All 22 chapters completed! Please sign now.',
    ar: '🎉 تم إنهاء جميع الفصول الـ 22! يرجى التوقيع الآن.'
  },
  btn_unterzeichnen: {
    de: '✍️ Jetzt unterzeichnen',
    tr: '✍️ Şimdi imzala',
    ro: '✍️ Semnează acum',
    sr: '✍️ Потпиши сада',
    pl: '✍️ Podpisz teraz',
    en: '✍️ Sign now',
    ar: '✍️ وقّع الآن'
  },
  bereits_unterzeichnet: {
    de: '✅ Unterzeichnet',
    tr: '✅ İmzalandı',
    ro: '✅ Semnat',
    sr: '✅ Потписано',
    pl: '✅ Podpisano',
    en: '✅ Signed',
    ar: '✅ تم التوقيع'
  },
  am: {
    de: 'am',
    tr: 'tarihinde',
    ro: 'la',
    sr: 'дана',
    pl: 'dnia',
    en: 'on',
    ar: 'بتاريخ'
  },
  von: {
    de: 'von',
    tr: '',
    ro: 'de',
    sr: '',
    pl: 'przez',
    en: 'by',
    ar: 'من'
  }
};

// Cache für geladene Unterschrift des aktuellen Mitarbeiters
let lernpfadUnterschrift = null; // { vollname, unterzeichnet_am } oder null

function lernpfadSprachWaehlen(code) {
  lernpfadSprache = code;
  localStorage.setItem('lernpfad_sprache', code);
  renderLernpfad();
}
async function lernpfadLaden() {
  // 0. Aktuellen Durchgang ermitteln (höchster existierender Durchgang für diesen User)
  try {
    const untRows = await SB.select('lernpfad_unterschriften',
      `user_id=eq.${currentUser.userId}&tenant_id=eq.${encodeURIComponent(currentUser.tenantId || '')}&order=durchgang.desc&limit=1`);
    if (untRows && untRows.length) {
      const letzterDurchgang = untRows[0].durchgang || 1;
      // Laufender Durchgang = letzter, wenn noch nicht vollständig unterzeichnet
      // oder ein neuer wenn bereits vollständig (wird von lernpfadNeuStarten gesetzt)
      lernpfadAktuellerDurchgang = letzterDurchgang;
    } else {
      lernpfadAktuellerDurchgang = 1;
    }
  } catch(e) { lernpfadAktuellerDurchgang = 1; }

  // 1. Aus localStorage (sofort, offline-fähig)
  lernpfadFortschritt = {};
  try {
    const stored = localStorage.getItem(LP_STORAGE_KEY());
    if (stored) lernpfadFortschritt = JSON.parse(stored);
  } catch(e) {}

  // 2. Aus Supabase (wenn online — überschreibt localStorage bei Konflikten)
  try {
    const rows = await SB.select('lernpfad_fortschritt',
      `user_id=eq.${currentUser.userId}&tenant_id=eq.${encodeURIComponent(currentUser.tenantId || '')}&durchgang=eq.${lernpfadAktuellerDurchgang}`);
    if (rows && rows.length) {
      rows.forEach(r => {
        lernpfadFortschritt[r.kapitel_id] = {
          abgehakt:     r.abgehakt,
          abgehaktAm:   r.abgehakt_am,
          bestaetigtAm: r.bestaetigt_am,
          bestaetigtVon:r.bestaetigt_von
        };
      });
      localStorage.setItem(LP_STORAGE_KEY(), JSON.stringify(lernpfadFortschritt));
    }
  } catch(e) {}

  // 3. Tenant-eigene Kapitel laden
  await lernpfadTenantKapitelLaden();

  // 4. Unterschrift laden (aus Supabase)
  await lernpfadUnterschriftLaden();
}

async function lernpfadTenantKapitelLaden() {
  lernpfadTenantKapitel = [];
  if (!currentUser.tenantId) return;
  try {
    const rows = await SB.select('lernpfad_tenant_kapitel',
      `tenant_id=eq.${encodeURIComponent(currentUser.tenantId)}&order=reihenfolge.asc`);
    if (rows && rows.length) lernpfadTenantKapitel = rows;
  } catch(e) {}
}

// ── Unterschrift laden ──────────────────────────────────────
async function lernpfadUnterschriftLaden() {
  try {
    const rows = await SB.select('lernpfad_unterschriften',
      `user_id=eq.${currentUser.userId}&tenant_id=eq.${encodeURIComponent(currentUser.tenantId || '')}&durchgang=eq.${lernpfadAktuellerDurchgang}`);
    if (rows && rows.length) {
      lernpfadUnterschrift = {
        vollname:              rows[0].vollname,
        unterzeichnetAm:       rows[0].unterzeichnet_am,
        verantwortlicherId:    rows[0].verantwortlicher_id,
        verantwortlicherName:  rows[0].verantwortlicher_name,
        verantwortlicherAm:    rows[0].verantwortlicher_am,
        durchgang:             rows[0].durchgang
      };
    } else {
      lernpfadUnterschrift = null;
    }
  } catch(e) {
    lernpfadUnterschrift = null;
  }
}

// ── Unterschrift des Mitarbeiters aus Supabase laden (für Verantwortlichen) ─
async function lernpfadUnterschriftFuerMA(userId, tenantId) {
  try {
    // Neuesten UNTERZEICHNETEN Durchgang laden (Platzhalter ohne unterzeichnet_am ignorieren)
    const rows = await SB.select('lernpfad_unterschriften',
      `user_id=eq.${userId}&tenant_id=eq.${encodeURIComponent(tenantId || '')}&unterzeichnet_am=not.is.null&order=durchgang.desc&limit=1`);
    if (rows && rows.length) return rows[0];
    return null;
  } catch(e) { return null; }
}

// ── Alle Durchgänge eines Mitarbeiters laden (für Historie) ─
async function lernpfadAlleDurchgaengeFuerMA(userId, tenantId) {
  try {
    const rows = await SB.select('lernpfad_unterschriften',
      `user_id=eq.${userId}&tenant_id=eq.${encodeURIComponent(tenantId || '')}&order=durchgang.asc`);
    return rows || [];
  } catch(e) { return []; }
}

// ══════════════════════════════════════════════════════════════
// ── Unterschrift-Modal (Canvas) — MA + Verantwortlicher ──────
// ══════════════════════════════════════════════════════════════

let _lpUntModus     = null; // 'ma' | 'verantwortlicher'
let _lpUntMaUserId  = null; // nur bei Modus 'verantwortlicher'
let _lpUntCanvas    = null;
let _lpUntCtx       = null;
let _lpUntZeichnet  = false;
let _lpUntHatStriche = false;

function lpUntModalOeffnen(modus, maUserId) {
  _lpUntModus     = modus;
  _lpUntMaUserId  = maUserId || null;

  const modal = document.getElementById('lp-unt-modal');
  const titel = document.getElementById('lp-unt-titel');
  const hinweis = document.getElementById('lp-unt-hinweis');
  const btn = document.getElementById('lp-unt-bestaetigen-btn');
  const status = document.getElementById('lp-unt-status');

  if (modus === 'ma') {
    const spr = lernpfadSprache;
    const lpUntText = t => (LP_UNT_TEXTE[t]?.[spr] || LP_UNT_TEXTE[t]?.de || '');
    titel.textContent   = '✍️ ' + lpUntText('btn_unterzeichnen');
    hinweis.textContent = currentUser.name + ' — ' + new Date().toLocaleString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  } else {
    const ma = APP_USERS.find(u => u.id === maUserId);
    titel.textContent   = '✍️ Lernpfad gegenzeichnen';
    hinweis.textContent = 'Verantwortlicher: ' + currentUser.name + '\nFür Mitarbeiter: ' + (ma ? ma.name : maUserId);
  }

  // Canvas zurücksetzen
  _lpUntHatStriche = false;
  status.textContent = 'Noch keine Unterschrift';
  status.style.color = '#9ca3af';
  btn.disabled = true;
  btn.style.background = '#d1d5db';
  btn.style.color = '#9ca3af';
  btn.style.cursor = 'not-allowed';

  modal.style.display = 'flex';

  // Canvas nach dem Anzeigen initialisieren (damit Größe stimmt)
  requestAnimationFrame(() => {
    _lpUntCanvas = document.getElementById('lp-unt-canvas');
    _lpUntCtx    = _lpUntCanvas.getContext('2d');
    lpUntCanvasLeeren();
    lpUntCanvasBindEvents();
  });
}

function lpUntModalSchliessen() {
  document.getElementById('lp-unt-modal').style.display = 'none';
  lpUntCanvasUnbindEvents();
  _lpUntModus = null;
  _lpUntMaUserId = null;
  _lpUntCanvas = null;
  _lpUntCtx = null;
}

function lpUntCanvasLeeren() {
  if (!_lpUntCtx || !_lpUntCanvas) return;
  _lpUntCtx.clearRect(0, 0, _lpUntCanvas.width, _lpUntCanvas.height);
  // Hintergrund
  _lpUntCtx.fillStyle = '#f9fafb';
  _lpUntCtx.fillRect(0, 0, _lpUntCanvas.width, _lpUntCanvas.height);
  // Linie
  _lpUntCtx.strokeStyle = '#d1d5db';
  _lpUntCtx.lineWidth = 1;
  _lpUntCtx.setLineDash([6, 4]);
  _lpUntCtx.beginPath();
  _lpUntCtx.moveTo(20, _lpUntCanvas.height - 30);
  _lpUntCtx.lineTo(_lpUntCanvas.width - 20, _lpUntCanvas.height - 30);
  _lpUntCtx.stroke();
  _lpUntCtx.setLineDash([]);
  _lpUntHatStriche = false;
  const status = document.getElementById('lp-unt-status');
  if (status) { status.textContent = 'Noch keine Unterschrift'; status.style.color = '#9ca3af'; }
  const btn = document.getElementById('lp-unt-bestaetigen-btn');
  if (btn) { btn.disabled = true; btn.style.background = '#d1d5db'; btn.style.color = '#9ca3af'; btn.style.cursor = 'not-allowed'; }
}

function _lpUntGetPos(e) {
  const rect = _lpUntCanvas.getBoundingClientRect();
  const scaleX = _lpUntCanvas.width  / rect.width;
  const scaleY = _lpUntCanvas.height / rect.height;
  const src = e.touches ? e.touches[0] : e;
  return {
    x: (src.clientX - rect.left) * scaleX,
    y: (src.clientY - rect.top)  * scaleY
  };
}

function _lpUntStart(e) {
  e.preventDefault();
  _lpUntZeichnet = true;
  const pos = _lpUntGetPos(e);
  _lpUntCtx.beginPath();
  _lpUntCtx.moveTo(pos.x, pos.y);
  _lpUntCtx.strokeStyle = '#1a1a2e';
  _lpUntCtx.lineWidth = 2.5;
  _lpUntCtx.lineCap = 'round';
  _lpUntCtx.lineJoin = 'round';
  _lpUntCtx.setLineDash([]);
}

function _lpUntMove(e) {
  if (!_lpUntZeichnet) return;
  e.preventDefault();
  const pos = _lpUntGetPos(e);
  _lpUntCtx.lineTo(pos.x, pos.y);
  _lpUntCtx.stroke();
  if (!_lpUntHatStriche) {
    _lpUntHatStriche = true;
    const status = document.getElementById('lp-unt-status');
    if (status) { status.textContent = '✅ Unterschrift vorhanden'; status.style.color = '#0f5132'; }
    const btn = document.getElementById('lp-unt-bestaetigen-btn');
    if (btn) { btn.disabled = false; btn.style.background = '#0f5132'; btn.style.color = '#fff'; btn.style.cursor = 'pointer'; }
  }
}

function _lpUntEnd(e) {
  e.preventDefault();
  _lpUntZeichnet = false;
}

function lpUntCanvasBindEvents() {
  if (!_lpUntCanvas) return;
  _lpUntCanvas.addEventListener('mousedown',  _lpUntStart,  {passive:false});
  _lpUntCanvas.addEventListener('mousemove',  _lpUntMove,   {passive:false});
  _lpUntCanvas.addEventListener('mouseup',    _lpUntEnd,    {passive:false});
  _lpUntCanvas.addEventListener('touchstart', _lpUntStart,  {passive:false});
  _lpUntCanvas.addEventListener('touchmove',  _lpUntMove,   {passive:false});
  _lpUntCanvas.addEventListener('touchend',   _lpUntEnd,    {passive:false});
}

function lpUntCanvasUnbindEvents() {
  if (!_lpUntCanvas) return;
  _lpUntCanvas.removeEventListener('mousedown',  _lpUntStart);
  _lpUntCanvas.removeEventListener('mousemove',  _lpUntMove);
  _lpUntCanvas.removeEventListener('mouseup',    _lpUntEnd);
  _lpUntCanvas.removeEventListener('touchstart', _lpUntStart);
  _lpUntCanvas.removeEventListener('touchmove',  _lpUntMove);
  _lpUntCanvas.removeEventListener('touchend',   _lpUntEnd);
}

async function lpUntBestaetigen() {
  if (!_lpUntHatStriche) {
    showToast('⚠️ Bitte zuerst unterzeichnen!', '#f59e0b');
    return;
  }
  const btn = document.getElementById('lp-unt-bestaetigen-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Wird gespeichert…';

  const unterschriftBild = _lpUntCanvas.toDataURL('image/png');

  try {
    if (_lpUntModus === 'ma') {
      await _lpUntSpeichernMA(unterschriftBild);
    } else {
      await _lpUntSpeichernVerantwortlicher(_lpUntMaUserId, unterschriftBild);
    }
    lpUntModalSchliessen();
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '✅ Unterzeichnen bestätigen';
    btn.style.background = '#0f5132';
    btn.style.color = '#fff';
    btn.style.cursor = 'pointer';
    showToast('❌ Fehler beim Speichern: ' + e.message, '#dc2626');
  }
}

async function _lpUntSpeichernMA(unterschriftBild) {
  const ts = now();
  await SB.upsert('lernpfad_unterschriften', {
    user_id:          currentUser.userId,
    tenant_id:        currentUser.tenantId || '',
    durchgang:        lernpfadAktuellerDurchgang,
    vollname:         currentUser.name,
    unterzeichnet_am: ts,
    alle_kapitel_am:  ts,
    aktualisiert_am:  ts,
    unterschrift_bild: unterschriftBild || null
  });
  lernpfadUnterschrift = { vollname: currentUser.name, unterzeichnetAm: ts, durchgang: lernpfadAktuellerDurchgang };
  await sbAudit('LERNPFAD_UNTERZEICHNET', `Lernpfad unterzeichnet von ${currentUser.name} (Durchgang ${lernpfadAktuellerDurchgang})`);
  showToast('✅ Lernpfad erfolgreich unterzeichnet!', '#0f5132');
  renderLernpfad();
}

async function _lpUntSpeichernVerantwortlicher(maUserId, unterschriftBild) {
  const existing = await lernpfadUnterschriftFuerMA(maUserId, currentUser.tenantId);
  if (!existing || !existing.unterzeichnet_am) {
    throw new Error('Mitarbeiter hat noch nicht unterzeichnet!');
  }
  const ts = now();
  await SB.upsert('lernpfad_unterschriften', {
    user_id:              maUserId,
    tenant_id:            currentUser.tenantId || '',
    durchgang:            existing.durchgang || 1,
    vollname:             existing.vollname,
    unterzeichnet_am:     existing.unterzeichnet_am,
    verantwortlicher_id:  currentUser.userId,
    verantwortlicher_name: currentUser.name,
    verantwortlicher_am:  ts,
    aktualisiert_am:      ts
  });
  await sbAudit('LERNPFAD_V_UNTERZEICHNET',
    `Lernpfad von ${existing.vollname} durch Verantwortlichen ${currentUser.name} unterzeichnet (Durchgang ${existing.durchgang || 1})`);
  showToast(`✅ Lernpfad von ${existing.vollname} unterzeichnet!`, '#0f5132');
  renderMitarbeiterListe();
}

// ── Verantwortlicher unterzeichnet für einen Mitarbeiter ────
async function lernpfadVerantwortlicherUnterzeichnen(userId) {
  const ma = APP_USERS.find(u => u.id === userId);
  if (!ma) { showToast('⚠️ Mitarbeiter nicht gefunden', '#f59e0b'); return; }

  // Prüfen: Hat MA selbst schon unterzeichnet?
  const existing = await lernpfadUnterschriftFuerMA(userId, currentUser.tenantId);
  if (!existing || !existing.unterzeichnet_am) {
    showToast('⚠️ Mitarbeiter hat noch nicht unterzeichnet — bitte erst MA-Unterschrift abwarten!', '#f59e0b');
    return;
  }

  lpUntModalOeffnen('verantwortlicher', userId);
}

// ── Jetzt unterzeichnen (Mitarbeiter) ───────────────────────
async function lernpfadUnterzeichnen() {
  const gesamt    = LERNPFAD_KAPITEL.length;
  const bestanden = LERNPFAD_KAPITEL.filter(k => lernpfadFortschritt[k.id]?.abgehakt).length;
  if (bestanden < gesamt) {
    showToast('⚠️ Bitte zuerst alle Kapitel abhaken!', '#f59e0b');
    return;
  }
  lpUntModalOeffnen('ma', null);
}

// ── Kapitel abhaken / Haken entfernen ────────────────────────
async function lernpfadKapitelToggle(kapitelId) {
  // Prüfen ob es ein Standard- oder Tenant-Kapitel ist
  const kap = [...LERNPFAD_KAPITEL, ...lernpfadTenantKapitel.map(tk => ({id: tk.id, nr: 'Z', titel: tk.titel}))].find(k => k.id === kapitelId);
  if (!kap) return;
  const istAbgehakt = !!(lernpfadFortschritt[kapitelId]?.abgehakt);
  const neu = !istAbgehakt;
  const ts  = now();

  // Lokal sofort aktualisieren (optimistisch)
  if (neu) {
    lernpfadFortschritt[kapitelId] = { abgehakt: true, abgehaktAm: ts };
  } else {
    lernpfadFortschritt[kapitelId] = { abgehakt: false };
  }
  localStorage.setItem(LP_STORAGE_KEY(), JSON.stringify(lernpfadFortschritt));
  renderLernpfad();

  // In Supabase speichern
  try {
    await SB.upsert('lernpfad_fortschritt', {
      user_id:     currentUser.userId,
      tenant_id:   currentUser.tenantId || '',
      kapitel_id:  kapitelId,
      durchgang:   lernpfadAktuellerDurchgang,
      abgehakt:    neu,
      abgehakt_am: neu ? ts : null,
      bestaetigt_am:  null,
      bestaetigt_von: null
    });
    await sbAudit(
      neu ? 'LERNPFAD_ABGEHAKT' : 'LERNPFAD_HAKEN_ENTFERNT',
      `Kapitel ${kap.nr}: "${kap.titel}" (Durchgang ${lernpfadAktuellerDurchgang})`
    );
    if (neu) showToast(`✅ Kapitel ${kap.nr} abgehakt`, '#16a34a');
  } catch(e) {
    showToast('⚠️ Gespeichert (lokal) — Sync ausstehend', '#f59e0b');
  }
}

// ── Kapitel durch Verantwortlichen bestätigen ─────────────────
async function lernpfadBestaetigen(kapitelId, userId) {
  const kap = LERNPFAD_KAPITEL.find(k => k.id === kapitelId);
  if (!kap) return;
  if (!confirm(`Kapitel ${kap.nr}: "${kap.titel}" für diesen Mitarbeiter bestätigen?`)) return;
  const ts = now();

  try {
    await SB.upsert('lernpfad_fortschritt', {
      id:             `${userId}_${kapitelId}`,
      user_id:        userId,
      tenant_id:      currentUser.tenantId || '',
      kapitel_id:     kapitelId,
      abgehakt:       true,
      abgehakt_am:    ts,
      bestaetigt_am:  ts,
      bestaetigt_von: currentUser.id
    });
    await sbAudit('LERNPFAD_BESTAETIGT',
      `Kapitel ${kap.nr}: "${kap.titel}" bestätigt für User ${userId}`);
    showToast(`✅ Kapitel ${kap.nr} bestätigt`, '#16a34a');
    // Lokalen Cache updaten (wenn eigener User)
    if (userId === currentUser.userId) {
      lernpfadFortschritt[kapitelId] = { abgehakt: true, abgehaktAm: ts, bestaetigtAm: ts, bestaetigtVon: currentUser.userId };
      localStorage.setItem(LP_STORAGE_KEY(), JSON.stringify(lernpfadFortschritt));
      renderLernpfad();
    }
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

// ── Toggle Lernpfad-Karte aufklappen/einklappen ───────────────
function lernpfadToggle() {
  const cont  = document.getElementById('lernpfad-container');
  const pfeil = document.getElementById('btn-lernpfad-pfeil');
  const sub   = document.getElementById('btn-lernpfad-sub');
  if (!cont) return;
  const offen = cont.style.display === 'block';
  if (offen) {
    cont.style.display = 'none';
    if (pfeil) pfeil.style.transform = '';
    if (sub) sub.textContent = 'Tippen zum Anzeigen';
  } else {
    renderLernpfad();
    cont.style.display = 'block';
    if (pfeil) pfeil.style.transform = 'rotate(180deg)';
  }
}

// ── Lernpfad rendern ──────────────────────────────────────────

// ── Lernpfad Neu starten (Verantwortlicher für MA) ────────────
function lernpfadNeuStartenOeffnen(userId) {
  const ma = APP_USERS.find(u => u.id === userId);
  if (!ma) { showToast('⚠️ Mitarbeiter nicht gefunden', '#f59e0b'); return; }
  document.getElementById('lpns-ma-name').textContent = ma.name;
  document.getElementById('lpns-ma-id').value = userId;
  document.getElementById('lp-neustart-modal').style.display = 'flex';
}
function lernpfadNeuStartenSchliessen() {
  document.getElementById('lp-neustart-modal').style.display = 'none';
}
async function lernpfadNeuStartenBestaetigt() {
  const userId = document.getElementById('lpns-ma-id').value;
  const ma = APP_USERS.find(u => u.id === userId);
  if (!ma) return;
  const btn = document.getElementById('lpns-bestaetigen-btn');
  btn.disabled = true; btn.textContent = '⏳ Wird gestartet…';
  try {
    // Nächste Durchgang-Nummer ermitteln
    const rows = await SB.select('lernpfad_unterschriften',
      `user_id=eq.${userId}&tenant_id=eq.${encodeURIComponent(currentUser.tenantId || '')}&order=durchgang.desc&limit=1`);
    const naechsterDurchgang = rows && rows.length ? (rows[0].durchgang + 1) : 1;

    // Neuen Eintrag in lernpfad_unterschriften anlegen (ohne Unterschrift — Platzhalter)
    await SB.upsert('lernpfad_unterschriften', {
      user_id:     userId,
      tenant_id:   currentUser.tenantId || '',
      durchgang:   naechsterDurchgang,
      vollname:    ma.name,
      unterzeichnet_am: null,
      aktualisiert_am: now()
    });

    await sbAudit('LERNPFAD_NEU_GESTARTET',
      `Neuer Lernpfad-Durchgang ${naechsterDurchgang} für ${ma.name} gestartet von ${currentUser.name}`);
    showToast(`✅ Neuer Lernpfad-Durchgang ${naechsterDurchgang} für ${ma.name} gestartet!`, '#0f5132');
    lernpfadNeuStartenSchliessen();
    renderMitarbeiterListe();
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
    btn.disabled = false; btn.textContent = '🔄 Neu starten';
  }
}

// ── Tenant-Kapitel Verwaltung (Verantwortlicher) ──────────────
function lernpfadKapitelEditorOeffnen() {
  lernpfadKapitelEditorRenern();
  document.getElementById('lp-kapitel-modal').style.display = 'flex';
}
function lernpfadKapitelEditorSchliessen() {
  document.getElementById('lp-kapitel-modal').style.display = 'none';
}
function lernpfadKapitelEditorRenern() {
  const liste = document.getElementById('lpke-liste');
  if (!liste) return;
  if (!lernpfadTenantKapitel.length) {
    liste.innerHTML = '<div style="color:#9ca3af;font-size:.82rem;padding:8px 0">Noch keine eigenen Kapitel hinzugefügt.</div>';
    return;
  }
  liste.innerHTML = lernpfadTenantKapitel.map(k => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6">
      <div style="flex:1">
        <div style="font-size:.88rem;font-weight:600;color:#1f2937">${escHtml(k.titel)}</div>
        ${k.beschreibung ? `<div style="font-size:.75rem;color:#6b7280">${escHtml(k.beschreibung)}</div>` : ''}
      </div>
      <button onclick="lernpfadTenantKapitelLoeschen('${k.id}')"
        style="background:#fee2e2;color:#dc2626;border:none;padding:5px 10px;border-radius:6px;font-size:.78rem;cursor:pointer">
        🗑 Löschen
      </button>
    </div>`).join('');
}
async function lernpfadTenantKapitelHinzufuegen() {
  const titelEl = document.getElementById('lpke-neuer-titel');
  const beschrEl = document.getElementById('lpke-neue-beschreibung');
  const titel = titelEl.value.trim();
  const beschreibung = beschrEl.value.trim();
  if (!titel) { showToast('⚠️ Bitte einen Titel eingeben', '#f59e0b'); return; }
  const btn = document.getElementById('lpke-hinzufuegen-btn');
  btn.disabled = true; btn.textContent = '⏳ Wird gespeichert…';
  try {
    const id = 'tk_' + currentUser.tenantId.replace(/[^a-z0-9]/gi,'') + '_' + Date.now();
    const reihenfolge = lernpfadTenantKapitel.length > 0
      ? Math.max(...lernpfadTenantKapitel.map(k => k.reihenfolge)) + 1
      : 101;
    const newKap = { id, tenant_id: currentUser.tenantId, titel, beschreibung: beschreibung || null, reihenfolge, erstellt_von: currentUser.userId };
    await SB.post('lernpfad_tenant_kapitel', newKap);
    lernpfadTenantKapitel.push(newKap);
    titelEl.value = ''; beschrEl.value = '';
    lernpfadKapitelEditorRenern();
    renderLernpfad(); // Lernpfad neu aufbauen mit neuem Kapitel
    showToast(`✅ Kapitel "${titel}" hinzugefügt`, '#0f5132');
    await sbAudit('LERNPFAD_KAPITEL_NEU', `Neues Tenant-Kapitel: "${titel}"`);
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
  btn.disabled = false; btn.textContent = '➕ Kapitel hinzufügen';
}
async function lernpfadTenantKapitelLoeschen(kapitelId) {
  const kap = lernpfadTenantKapitel.find(k => k.id === kapitelId);
  if (!kap) return;
  if (!confirm(`Kapitel "${kap.titel}" wirklich löschen?`)) return;
  try {
    await SB.delete('lernpfad_tenant_kapitel', `id=eq.${kapitelId}`);
    lernpfadTenantKapitel = lernpfadTenantKapitel.filter(k => k.id !== kapitelId);
    lernpfadKapitelEditorRenern();
    renderLernpfad();
    showToast(`✅ Kapitel "${kap.titel}" gelöscht`, '#0f5132');
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

function renderLernpfad() {
  const cont = document.getElementById('lernpfad-container');
  if (!cont) return;
  const isVerantwortlicher = currentUser.role === 'verantwortlicher';

// Fortschrittsbalken oben — inkl. Tenant-Kapitel
  const alleKapitel = [...LERNPFAD_KAPITEL, ...lernpfadTenantKapitel.map((tk, i) => ({id: tk.id, nr: `Z${i+1}`, titel: tk.titel, saeule: 'Z'}))];
  const gesamt   = alleKapitel.length;
  const bestanden = alleKapitel.filter(k => lernpfadFortschritt[k.id]?.abgehakt).length;
  const pct      = Math.round(bestanden / gesamt * 100);
  const alle22   = bestanden >= gesamt;
  const isVerantwortlicherView = currentUser.role === 'verantwortlicher';

  let html = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);overflow:hidden;margin-bottom:10px">
      <div style="padding:14px 16px;background:#0f5132;color:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:.95rem">📚 Lernpfad${lernpfadAktuellerDurchgang > 1 ? ` <span style="font-size:.7rem;background:rgba(255,255,255,.2);border-radius:10px;padding:2px 7px">Durchgang ${lernpfadAktuellerDurchgang}</span>` : ''}</span>
          <span style="font-size:.85rem;font-weight:700">${bestanden}/${gesamt} ✓</span>
        </div>
        <div style="background:rgba(255,255,255,.25);border-radius:999px;height:8px">
          <div style="background:#4ade80;height:8px;border-radius:999px;width:${pct}%;transition:width .3s"></div>
        </div>
        <div style="font-size:.72rem;margin-top:5px;opacity:.85">${pct}% abgeschlossen${alle22 ? ' — 🏆 Alle Kapitel erledigt!' : ''}</div>
      </div>
      <div style="padding:8px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:.72rem;color:#6b7280">🌐 Sprache:</span>
        ${LP_SPRACHEN.map(s => `
          <button onclick="lernpfadSprachWaehlen('${s.code}')"
            style="font-size:.75rem;padding:3px 9px;border-radius:6px;border:1.5px solid ${lernpfadSprache===s.code?'#0f5132':'#d1d5db'};
                   background:${lernpfadSprache===s.code?'#0f5132':'#fff'};color:${lernpfadSprache===s.code?'#fff':'#374151'};
                   cursor:pointer;font-weight:${lernpfadSprache===s.code?'700':'400'}">
            ${s.flag} ${s.label}
          </button>`).join('')}
        ${isVerantwortlicherView ? `
          <button onclick="lernpfadKapitelEditorOeffnen()"
            style="margin-left:auto;font-size:.75rem;padding:3px 10px;border-radius:6px;border:1.5px solid #7c3aed;
                   background:#f5f3ff;color:#7c3aed;cursor:pointer;font-weight:600">
            ✏️ Kapitel verwalten
          </button>` : ''}
      </div>
      ${alle22 ? `<div style="padding:10px 16px;background:#f0fdf4;border-bottom:1px solid #bbf7d0;font-size:.82rem;color:#166534;font-weight:600">
        🎓 Lernpfad abgeschlossen! ${isVerantwortlicher ? 'Zertifikat kann ausgestellt werden.' : (lernpfadUnterschrift ? '✅ Unterzeichnet.' : 'Bitte jetzt unterzeichnen ↓')}
      </div>` : ''}
    </div>`;

  // Pro Säule gruppiert
  ['A','B','C','D'].forEach(saeule => {
    const kapitel = LERNPFAD_KAPITEL.filter(k => k.saeule === saeule);
    const absolviert = kapitel.filter(k => lernpfadFortschritt[k.id]?.abgehakt).length;
    const farbe = SAEULE_FARBEN[saeule];
    html += `
      <div style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden;margin-bottom:10px">
        <div style="padding:10px 14px;background:${farbe};color:#fff;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;font-size:.85rem">${SAEULE_LABEL[saeule]}</span>
          <span style="font-size:.78rem;opacity:.9">${absolviert}/${kapitel.length}</span>
        </div>`;

    kapitel.forEach(kap => {
      const fp = lernpfadFortschritt[kap.id] || {};
      const abgehakt    = !!fp.abgehakt;
      const bestaetigt  = !!fp.bestaetigtAm;
      const isMitarbeiter = currentUser.role === 'mitarbeiter';

      const statusIcon = bestaetigt ? '✅' : abgehakt ? '☑️' : '☐';
      const statusFarbe = bestaetigt ? '#16a34a' : abgehakt ? '#2563eb' : '#9ca3af';
      const hintergrund = bestaetigt ? '#f0fdf4' : abgehakt ? '#eff6ff' : '#fff';

      let aktionsBtn = '';
      if (isMitarbeiter) {
        // Mitarbeiter: Kapitel selbst abhaken
        aktionsBtn = `<button onclick="lernpfadKapitelToggle('${kap.id}')"
          style="font-size:.7rem;padding:4px 10px;border-radius:6px;border:1px solid ${abgehakt?'#dc2626':'#16a34a'};
                 background:${abgehakt?'#fef2f2':'#f0fdf4'};color:${abgehakt?'#dc2626':'#16a34a'};cursor:pointer;white-space:nowrap;font-weight:600">
          ${abgehakt ? '↩ Rückgängig' : '✓ Abhaken'}
        </button>`;
      } else if (isVerantwortlicher && abgehakt && !bestaetigt) {
        // Verantwortlicher: Bestätigen
        aktionsBtn = `<button onclick="lernpfadBestaetigen('${kap.id}','${currentUser.userId}')"
          style="font-size:.7rem;padding:4px 10px;border-radius:6px;border:1px solid #7c3aed;
                 background:#faf5ff;color:#7c3aed;cursor:pointer;white-space:nowrap;font-weight:600">
          ✔ Bestätigen
        </button>`;
      }

      let metaInfo = '';
      if (bestaetigt) {
        metaInfo = `<div style="font-size:.68rem;color:#16a34a;margin-top:2px">✅ Bestätigt am ${datumStr(fp.bestaetigtAm)}</div>`;
      } else if (abgehakt) {
        metaInfo = `<div style="font-size:.68rem;color:#2563eb;margin-top:2px">☑️ Abgehakt am ${datumStr(fp.abgehaktAm)} — Bestätigung ausstehend</div>`;
      }

      html += `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid #f0f2f5;background:${hintergrund}">
          <span style="font-size:1.2rem;color:${statusFarbe};flex-shrink:0;margin-top:2px">${statusIcon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:.82rem;color:#1a3a5c">${kap.nr}. ${escHtml(kap.titel)}</div>
            <div style="font-size:.68rem;color:#9ca3af;margin-top:1px">${escHtml(kap.rechtsgrundlage)}</div>
            <div style="font-size:.78rem;color:#374151;margin-top:5px;line-height:1.45;background:#f8fafc;border-left:3px solid ${farbe};padding:5px 8px;border-radius:0 6px 6px 0">
              ${LERNPFAD_HTML[kap.id] || escHtml((LERNPFAD_TEXTE[kap.id] || {})[lernpfadSprache] || (LERNPFAD_TEXTE[kap.id] || {}).de || '')}
            </div>
            ${metaInfo}
          </div>
          <div style="flex-shrink:0;margin-top:2px">${aktionsBtn}</div>
        </div>`;
    });

    html += `</div>`;
  });

  // Tenant-eigene Kapitel (Säule Z — firmenspezifisch)
  if (lernpfadTenantKapitel.length > 0) {
    const tkAbsolviert = lernpfadTenantKapitel.filter(k => lernpfadFortschritt[k.id]?.abgehakt).length;
    html += `
      <div style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden;margin-bottom:10px">
        <div style="padding:10px 14px;background:#7c3aed;color:#fff;display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700;font-size:.85rem">🏢 Firmenspezifische Kapitel</span>
          <span style="font-size:.78rem;opacity:.9">${tkAbsolviert}/${lernpfadTenantKapitel.length}</span>
        </div>`;
    lernpfadTenantKapitel.forEach((tk, i) => {
      const fp = lernpfadFortschritt[tk.id] || {};
      const abgehakt = !!fp.abgehakt;
      const isMitarbeiter = currentUser.role === 'mitarbeiter';
      let aktionsBtn = '';
      if (isMitarbeiter) {
        aktionsBtn = `<button onclick="lernpfadKapitelToggle('${tk.id}')"
          style="font-size:.7rem;padding:4px 10px;border-radius:6px;border:1px solid ${abgehakt?'#dc2626':'#7c3aed'};
                 background:${abgehakt?'#fef2f2':'#f5f3ff'};color:${abgehakt?'#dc2626':'#7c3aed'};cursor:pointer;white-space:nowrap;font-weight:600">
          ${abgehakt ? '↩ Rückgängig' : '✓ Abhaken'}
        </button>`;
      }
      html += `
        <div style="padding:10px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:flex-start;gap:10px;background:${abgehakt?'#faf5ff':'#fff'}">
          <div style="flex:1">
            <div style="font-size:.82rem;font-weight:600;color:#1f2937">Z${i+1}. ${escHtml(tk.titel)}</div>
            ${tk.beschreibung ? `<div style="font-size:.75rem;color:#6b7280;margin-top:2px">${escHtml(tk.beschreibung)}</div>` : ''}
          </div>
          <div style="flex-shrink:0;margin-top:2px">${aktionsBtn}</div>
        </div>`;
    });
    html += `</div>`;
  }

  // Zertifikat-Button (nur wenn alle abgehakt + Verantwortlicher)
  if (alle22 && isVerantwortlicher) {
    html += `
      <div style="text-align:center;padding:4px 0 10px">
        <button onclick="lernpfadZertifikatGenerieren()"
          style="background:#0f5132;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(15,81,50,.3)">
          🏆 Gesamtzertifikat ausstellen
        </button>
      </div>`;
  }

  // ── Unterschrifts-Block (für Mitarbeiter: immer am Ende sichtbar) ──
  if (!isVerantwortlicher) {
    const spr = lernpfadSprache;
    const lpUntText = t => (LP_UNT_TEXTE[t]?.[spr] || LP_UNT_TEXTE[t]?.de || '');

    if (lernpfadUnterschrift) {
      // Bereits unterzeichnet → Bestätigungsbox anzeigen
      const datumAnzeige = new Date(lernpfadUnterschrift.unterzeichnetAm)
        .toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      html += `
        <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:12px;padding:16px 18px;margin-top:4px;margin-bottom:10px">
          <div style="font-weight:700;font-size:.88rem;color:#0f5132;margin-bottom:8px">
            ${lpUntText('bereits_unterzeichnet')}
          </div>
          <div style="font-size:.82rem;color:#166534;line-height:1.6">
            <span style="font-weight:600">👤 ${escHtml(lernpfadUnterschrift.vollname)}</span><br>
            🕐 ${lpUntText('am')} ${datumAnzeige}
          </div>
        </div>`;
    } else if (alle22) {
      // Alle Kapitel abgehakt → Unterschrift freischalten
      const datumJetzt = new Date().toLocaleString('de-DE',
        { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
      html += `
        <div style="background:#fffbeb;border:2px solid #f59e0b;border-radius:12px;padding:16px 18px;margin-top:4px;margin-bottom:10px">
          <div style="font-weight:700;font-size:.88rem;color:#92400e;margin-bottom:10px">
            ${lpUntText('hinweis_komplett')}
          </div>
          <div style="font-size:.82rem;color:#374151;margin-bottom:10px;line-height:1.5">
            <span style="font-weight:600">👤 ${escHtml(currentUser.name)}</span><br>
            🕐 ${lpUntText('am')} ${datumJetzt}
          </div>
          <button onclick="lernpfadUnterzeichnen()"
            style="background:#0f5132;color:#fff;border:none;padding:12px 24px;border-radius:10px;font-size:.9rem;font-weight:700;cursor:pointer;width:100%;box-shadow:0 2px 8px rgba(15,81,50,.3)">
            ${lpUntText('btn_unterzeichnen')}
          </button>
        </div>`;
    } else {
      // Noch nicht alle Kapitel abgehakt → gesperrter Hinweis
      html += `
        <div style="background:#f3f4f6;border:1.5px solid #d1d5db;border-radius:12px;padding:14px 16px;margin-top:4px;margin-bottom:10px">
          <div style="font-size:.82rem;color:#6b7280;line-height:1.5;text-align:center">
            ${lpUntText('hinweis_offen')}
          </div>
          <div style="text-align:center;margin-top:10px">
            <button disabled
              style="background:#d1d5db;color:#9ca3af;border:none;padding:12px 24px;border-radius:10px;font-size:.9rem;font-weight:700;cursor:not-allowed;width:100%">
              🔒 ${lpUntText('btn_unterzeichnen')}
            </button>
          </div>
        </div>`;
    }
  }

  cont.innerHTML = html;

  // Button-Untertitel aktualisieren
  const sub = document.getElementById('btn-lernpfad-sub');
  if (sub) sub.textContent = `${bestanden}/${LERNPFAD_KAPITEL.length} Kapitel abgeschlossen`;
}

// ── Gesamtzertifikat generieren ───────────────────────────────
async function lernpfadZertifikatGenerieren() {
  if (typeof jspdf === 'undefined' && typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    showToast('⚠️ PDF-Bibliothek nicht geladen', '#f59e0b');
    return;
  }
  const { jsPDF } = window.jspdf || { jsPDF: window.jsPDF };
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const tenant = APP_TENANTS.find(t => t.id === currentUser.tenantId);
  const datum  = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });
  const gueltigBis = new Date();
  gueltigBis.setFullYear(gueltigBis.getFullYear() + 1);
  const gueltigBisStr = gueltigBis.toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });

  // Kopfzeile
  doc.setFillColor(15, 81, 50);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(18);
  doc.setFont('helvetica','bold');
  doc.text('SCHULUNGSZERTIFIKAT', 105, 15, { align:'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica','normal');
  doc.text('Gebäudereinigung — Lernpfad', 105, 23, { align:'center' });
  doc.text('CSC GmbH Schulungsmanagement', 105, 30, { align:'center' });

  // Mitarbeiterdaten
  doc.setTextColor(30,58,95);
  doc.setFontSize(11);
  doc.setFont('helvetica','bold');
  doc.text('Mitarbeiter:', 20, 50);
  doc.setFont('helvetica','normal');
  doc.text(currentUser.name, 65, 50);
  doc.setFont('helvetica','bold');
  doc.text('Unternehmen:', 20, 58);
  doc.setFont('helvetica','normal');
  doc.text(tenant ? tenant.name : currentUser.tenantId, 65, 58);
  doc.setFont('helvetica','bold');
  doc.text('Ausstellungsdatum:', 20, 66);
  doc.setFont('helvetica','normal');
  doc.text(datum, 65, 66);
  doc.setFont('helvetica','bold');
  doc.text('Gültig bis:', 20, 74);
  doc.setFont('helvetica','normal');
  doc.text(gueltigBisStr, 65, 74);

  // Trennlinie
  doc.setDrawColor(15, 81, 50);
  doc.setLineWidth(0.5);
  doc.line(20, 80, 190, 80);

  // Kapitel-Tabelle
  doc.setFontSize(9);
  doc.setFont('helvetica','bold');
  doc.setTextColor(255,255,255);
  doc.setFillColor(15, 81, 50);
  doc.rect(20, 83, 170, 7, 'F');
  doc.text('Nr', 23, 88);
  doc.text('Kapitel', 33, 88);
  doc.text('Rechtsgrundlage', 128, 88);
  doc.text('Status', 178, 88);

  let y = 95;
  LERNPFAD_KAPITEL.forEach((kap, i) => {
    const fp = lernpfadFortschritt[kap.id] || {};
    if (i % 2 === 0) {
      doc.setFillColor(240, 253, 244);
      doc.rect(20, y-4, 170, 8, 'F');
    }
    doc.setTextColor(30,58,95);
    doc.setFont('helvetica','normal');
    doc.text(String(kap.nr), 23, y);
    doc.text(kap.titel.substring(0,48), 33, y);
    doc.text(kap.rechtsgrundlage.substring(0,28), 128, y);
    doc.setFont('helvetica','bold');
    doc.setTextColor(22, 163, 74);
    doc.text('✓ Bestätigt', 178, y);
    doc.setTextColor(30,58,95);
    doc.setFont('helvetica','normal');
    y += 8;
  });

  // Rechtshinweis
  y += 6;
  doc.setFontSize(7.5);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica','italic');
  doc.text('Dieses Zertifikat bestätigt die Teilnahme an der digitalen Unterweisung gem. § 12 ArbSchG und § 14 GefStoffV.', 20, y);
  doc.text('Die Schulung wurde durch CSC GmbH Schulungsmanagement (schulung.csc-hannover.de) dokumentiert.', 20, y+5);
  doc.text(`Gültigkeitsdauer: 12 Monate. Nächste Unterweisung erforderlich bis: ${gueltigBisStr}`, 20, y+10);

  const datei = `Lernpfad-Zertifikat_${currentUser.name.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(datei);
  await sbAudit('LERNPFAD_ZERTIFIKAT', `Gesamtzertifikat erstellt für ${currentUser.name}`);
  showToast('🏆 Zertifikat wurde heruntergeladen!', '#0f5132');
}

// ── Lernpfad in renderSubDashboard integrieren ────────────────
// Wird von renderSubDashboard aufgerufen (siehe Patch dort)
async function lernpfadInitialisieren() {
  await lernpfadLaden();
  // Untertitel aktualisieren ohne aufzuklappen
  const gesamt = LERNPFAD_KAPITEL.length;
  const bestanden = LERNPFAD_KAPITEL.filter(k => lernpfadFortschritt[k.id]?.abgehakt).length;
  const sub = document.getElementById('btn-lernpfad-sub');
  if (sub) {
    const rolle = currentUser?.role;
    const kontextHinweis = rolle === 'verantwortlicher' || rolle === 'firma'
      ? ' — für Ihre Mitarbeiter'
      : ' — Tippen zum Starten';
    sub.textContent = `${bestanden}/${gesamt} Kapitel${bestanden === 0 ? kontextHinweis : ' — Tippen zum Fortfahren'}`;
  }
}

// showToast falls nicht vorhanden
if (typeof showToast === 'undefined') {
  window.showToast = function(msg, color) {
    let t = document.getElementById('_toast');
    if (!t) {
      t = document.createElement('div');
      t.id = '_toast';
      t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:999px;color:#fff;font-size:.9rem;font-weight:600;z-index:99999;transition:opacity .3s';
      document.body.appendChild(t);
    }
    t.style.background = color || '#1a3a5c';
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.style.opacity = '0'; }, 3000);
  };
}

// ══════════════════════════════════════════════════════════════
// FIRMA-DASHBOARD
// ══════════════════════════════════════════════════════════════

function renderFirmaDashboard() {
  const tenant = APP_TENANTS.find(t => t.id === currentUser.tenantId);
  document.getElementById('firma-username').textContent = currentUser.name;
  document.getElementById('firma-tenantname').textContent = tenant ? tenant.name : '';
  // Aktiven Tab rendern
  const aktiv = document.querySelector('#screen-firma .firma-tab-btn[data-active="true"]');
  const tabName = aktiv ? aktiv.dataset.tab : 'verantwortliche';
  firmaTabWechseln(tabName);
}

function firmaTabWechseln(tab) {
  // Tab-Buttons
  document.querySelectorAll('#screen-firma .firma-tab-btn').forEach(b => {
    const isActive = b.dataset.tab === tab;
    b.dataset.active = isActive;
    b.style.fontWeight = isActive ? '700' : '400';
    b.style.borderBottom = isActive ? '2px solid #1e3a5f' : '2px solid transparent';
    b.style.color = isActive ? '#1e3a5f' : '#6b7280';
  });
  // Tab-Inhalt
  document.querySelectorAll('#screen-firma .firma-tab-content').forEach(c => {
    c.style.display = c.dataset.tab === tab ? '' : 'none';
  });
  // Inhalt laden
  if (tab === 'verantwortliche') firmaRenderVerantwortliche();
  if (tab === 'uebersicht') firmaRenderUebersicht();
  if (tab === 'schulungen') firmaRenderSchulungen();
  if (tab === 'historie') firmaRenderHistorie();
}

async function firmaRenderVerantwortliche() {
  const cont = document.getElementById('firma-verantwortliche-liste');
  if (!cont) return;
  cont.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ Wird geladen…</div>';
  try {
    // Alle Verantwortlichen dieses Tenants laden
    const alle = await SB.get('users',
      `tenant_id=eq.${currentUser.tenantId}&role=eq.verantwortlicher&archiviert=eq.false&order=name.asc`);
    if (!alle.length) {
      cont.innerHTML = '<div style="color:#6b7280;padding:12px">Noch keine Verantwortlichen angelegt.</div>';
      return;
    }
    cont.innerHTML = alle.map(v => `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
        <div style="font-size:1.4rem">${v.aktiv !== false ? '👔' : '⏸'}</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:.92rem;color:#1e3a5f">${escHtml(v.name)}</div>
          <div style="font-size:.75rem;color:#6b7280">${escHtml(v.email)}</div>
          ${v.position ? `<div style="font-size:.72rem;color:#4b5563;margin-top:2px">🏷 ${escHtml(v.position)}</div>` : ''}
          ${v.telefon ? `<div style="font-size:.72rem;color:#4b5563">📞 ${escHtml(v.telefon)}</div>` : ''}
          ${v.mobil   ? `<div style="font-size:.72rem;color:#4b5563">📱 ${escHtml(v.mobil)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button onclick="firmaVerantwortlichenBearbeiten('${v.id}')" style="font-size:.72rem;padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;color:#374151;cursor:pointer">✏️ Bearbeiten</button>
          <button onclick="firmaVerantwortlichenToggleAktiv('${v.id}',${v.aktiv !== false})" style="font-size:.72rem;padding:5px 10px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;color:#374151;cursor:pointer">${v.aktiv !== false ? '⏸ Deaktivieren' : '▶ Aktivieren'}</button>
        </div>
      </div>`).join('');
  } catch(e) {
    cont.innerHTML = `<div style="color:#dc2626;font-size:.85rem">${escHtml(e.message)}</div>`;
  }
}

async function firmaRenderUebersicht() {
  const cont = document.getElementById('firma-uebersicht-inhalt');
  if (!cont) return;
  cont.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ Wird geladen…</div>';
  try {
    const verantw = await SB.get('users',
      `tenant_id=eq.${currentUser.tenantId}&role=eq.verantwortlicher&aktiv=eq.true&archiviert=eq.false&order=name.asc`);
    const mitarb = await SB.get('users',
      `tenant_id=eq.${currentUser.tenantId}&role=eq.mitarbeiter&archiviert=eq.false&order=name.asc`);
    const html = verantw.map(v => {
      const seine = mitarb; // Vereinfacht — alle Mitarbeiter des Tenants sehen
      return `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin-bottom:8px">
          <div style="font-weight:700;font-size:.88rem;color:#1e3a5f;margin-bottom:6px">👔 ${escHtml(v.name)} ${v.position ? `<span style="font-weight:400;color:#6b7280">· ${escHtml(v.position)}</span>` : ''}</div>
          <div style="font-size:.78rem;color:#6b7280">${seine.length} Mitarbeiter im Tenant · ${zuweisungen.filter(z=>z.tenantId===currentUser.tenantId).length} Zuweisungen</div>
        </div>`;
    }).join('');
    cont.innerHTML = html || '<div style="color:#6b7280;padding:12px">Keine Daten vorhanden.</div>';
  } catch(e) {
    cont.innerHTML = `<div style="color:#dc2626;font-size:.85rem">${escHtml(e.message)}</div>`;
  }
}

async function firmaRenderSchulungen() {
  const cont = document.getElementById('firma-schulungen-inhalt');
  if (!cont) return;
  // Vorlagen laden und Zuweisungen anzeigen
  try {
    const vorlagen = await SB.get('vorlagen', `order=titel.asc`);
    cont.innerHTML = vorlagen.map(v => {
      const zuws = zuweisungen.filter(z => z.vorlagenId === v.id && z.tenantId === currentUser.tenantId);
      return `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
          <div style="flex:1">
            <div style="font-weight:700;font-size:.88rem;color:#1e3a5f">${escHtml(v.titel)}</div>
            <div style="font-size:.75rem;color:#6b7280">${zuws.length} Zuweisung${zuws.length!==1?'en':''}</div>
          </div>
          <button onclick="firmaSchulungZuweisen('${v.id}')" style="font-size:.75rem;padding:7px 12px;border:none;border-radius:7px;background:#1e3a5f;color:#fff;cursor:pointer;font-weight:600">➕ Zuweisen</button>
        </div>`;
    }).join('');
  } catch(e) {
    cont.innerHTML = `<div style="color:#dc2626;font-size:.85rem">${escHtml(e.message)}</div>`;
  }
}

async function firmaRenderHistorie() {
  const cont = document.getElementById('firma-historie-inhalt');
  if (!cont) return;
  cont.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280">⏳ Wird geladen…</div>';
  try {
    const tid = currentUser.tenantId;

    // Alle Mitarbeiter des Tenants laden
    const mitarb = await SB.get('users',
      `tenant_id=eq.${tid}&role=eq.mitarbeiter&archiviert=eq.false&order=name.asc`);

    // Alle abgeschlossenen Formulare des Tenants laden
    const alleZuwIds = zuweisungen.filter(z => z.tenantId === tid).map(z => z.id);
    let abgForms = [];
    if (alleZuwIds.length) {
      abgForms = await SB.get('formulare',
        `id=in.(${alleZuwIds.join(',')})&abgeschlossen=eq.true&order=abgeschlossen_am.desc`);
    }

    // Lernpfad-Unterschriften laden
    const lpUnts = await SB.get('lernpfad_unterschriften',
      `tenant_id=eq.${tid}&order=unterzeichnet_am.desc`);

    // Filter-State
    const filterEl = document.getElementById('hist-filter-ma');
    const filterMa = filterEl ? filterEl.value : '';

    // Suchleiste + Filter oben
    let html = `
      <div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select id="hist-filter-ma" onchange="firmaRenderHistorie()"
          style="padding:7px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:.83rem;background:#fff;flex:1;min-width:140px">
          <option value="">— Alle Mitarbeiter —</option>
          ${mitarb.map(m=>`<option value="${m.id}" ${filterMa===m.id?'selected':''}>${escHtml(m.name)}</option>`).join('')}
        </select>
        <span style="font-size:.78rem;color:#6b7280">${abgForms.length + lpUnts.length} Einträge gesamt</span>
      </div>`;

    // Je Mitarbeiter gruppiert
    const maMap = {};
    mitarb.forEach(m => { maMap[m.id] = m; });

    // Alle Nachweise sammeln
    let eintraege = [];

    // 1. Normale Schulungen (formulare)
    abgForms.forEach(f => {
      const zuw = zuweisungen.find(z => z.id === f.id);
      const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw?.vorlagenId);
      const isLP = zuw?.vorlagenId === '__lernpfad__';
      const isPsaga = zuw?.vorlagenId === '__psaga__';
      const titel = isLP ? '📚 Lernpfad (29 Kapitel)' : isPsaga ? '🪝 PSAgA-Schulung' : (vorlage?.titel || zuw?.vorlagenId || f.id);
      eintraege.push({
        userId: f.abgeschlossen_von || '?',
        typ: isLP ? 'lernpfad' : isPsaga ? 'psaga' : 'schulung',
        titel,
        datum: f.abgeschlossen_am,
        pdfUrl: f.pdf_path || null,
        extra: zuw?.frist ? `Frist: ${zuw.frist}` : ''
      });
    });

    // 2. Lernpfad-Unterschriften
    lpUnts.forEach(u => {
      eintraege.push({
        userId: u.user_id,
        userName: u.vollname,
        typ: 'lernpfad_unt',
        titel: '📚 Lernpfad-Unterschrift',
        datum: u.unterzeichnet_am,
        pdfUrl: null,
        extra: u.verantwortlicher_name ? `Gegengezeichnet: ${u.verantwortlicher_name}` : '⏳ Gegenzeichnung ausstehend'
      });
    });

    // Nach Mitarbeiter filtern falls ausgewählt
    if (filterMa) {
      eintraege = eintraege.filter(e => e.userId === filterMa);
    }

    if (!eintraege.length) {
      cont.innerHTML = html + '<div style="text-align:center;padding:30px;color:#9ca3af;font-size:.88rem">📭 Keine abgeschlossenen Schulungen vorhanden</div>';
      return;
    }

    // Nach Mitarbeiter gruppieren
    const gruppenMap = {};
    eintraege.forEach(e => {
      const key = e.userId;
      if (!gruppenMap[key]) gruppenMap[key] = { name: e.userName || maMap[key]?.name || e.userId, eintraege: [] };
      gruppenMap[key].eintraege.push(e);
    });

    const typColors = { lernpfad:'#6b21a8', psaga:'#166534', lernpfad_unt:'#7c3aed', schulung:'#1e3a5f' };
    const typBg = { lernpfad:'#f5f3ff', psaga:'#f0fdf4', lernpfad_unt:'#ede9fe', schulung:'#f0f4ff' };

    html += Object.values(gruppenMap).sort((a,b)=>a.name.localeCompare(b.name)).map(gr => `
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:12px;overflow:hidden">
        <div style="background:#f8fafc;padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:.88rem;color:#1e3a5f">
          👤 ${escHtml(gr.name)} <span style="font-weight:400;color:#6b7280;font-size:.78rem">(${gr.eintraege.length} Nachweise)</span>
        </div>
        ${gr.eintraege.sort((a,b)=>new Date(b.datum)-new Date(a.datum)).map(e => `
          <div style="padding:10px 14px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:10px">
            <div style="background:${typBg[e.typ]||'#f0f4ff'};border-radius:6px;padding:4px 8px;font-size:.72rem;font-weight:700;color:${typColors[e.typ]||'#1e3a5f'};white-space:nowrap">
              ${e.typ==='psaga'?'PSAgA':e.typ==='lernpfad'?'Lernpfad':e.typ==='lernpfad_unt'?'LP-Unt.':'Schulung'}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.83rem;font-weight:600;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(e.titel)}</div>
              <div style="font-size:.72rem;color:#6b7280">${e.datum ? new Date(e.datum).toLocaleDateString('de-DE') : '–'} ${e.extra ? '· '+escHtml(e.extra) : ''}</div>
            </div>
            ${e.pdfUrl ? `<a href="${e.pdfUrl}" target="_blank" style="font-size:.72rem;padding:5px 10px;border:1px solid #3b82f6;border-radius:6px;color:#3b82f6;text-decoration:none;white-space:nowrap">📄 PDF</a>` : '<span style="font-size:.72rem;color:#9ca3af;white-space:nowrap">kein PDF</span>'}
          </div>`).join('')}
      </div>`).join('');

    cont.innerHTML = html;
  } catch(e) {
    cont.innerHTML = `<div style="color:#dc2626;font-size:.85rem;padding:12px">${escHtml(e.message)}</div>`;
    console.error('firmaRenderHistorie:', e);
  }
}

// Neuen Verantwortlichen anlegen
function firmaVerantwortlichenAnlegenOeffnen() {
  // Felder leeren
  ['fva-name','fva-email','fva-position','fva-telefon','fva-mobil','fva-passwort'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('fva-fehler').textContent = '';
  document.getElementById('fva-modal').style.display = 'flex';
}
function firmaVerantwortlichenAnlegenSchliessen() {
  document.getElementById('fva-modal').style.display = 'none';
}
function firmaVerantwortlichenGenerierePasswort() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
  let pw = '';
  const arr = new Uint8Array(10);
  crypto.getRandomValues(arr);
  arr.forEach(b => pw += chars[b % chars.length]);
  document.getElementById('fva-passwort').value = pw;
}
async function firmaVerantwortlichenSpeichern() {
  const name  = document.getElementById('fva-name').value.trim();
  const email = document.getElementById('fva-email').value.trim().toLowerCase();
  const pos   = document.getElementById('fva-position').value.trim();
  const tel   = document.getElementById('fva-telefon').value.trim();
  const mob   = document.getElementById('fva-mobil').value.trim();
  let   pw    = document.getElementById('fva-passwort').value.trim();
  const fehEl = document.getElementById('fva-fehler');
  fehEl.textContent = '';
  if (!name) { fehEl.textContent = 'Name ist Pflichtfeld.'; return; }
  if (!email || !email.includes('@')) { fehEl.textContent = 'Gültige E-Mail eingeben.'; return; }
  if (!pw) {
    pw = '';
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$';
    const arr = new Uint8Array(10);
    crypto.getRandomValues(arr);
    arr.forEach(b => pw += chars[b % chars.length]);
  }
  const btn = document.getElementById('fva-speichern-btn');
  btn.disabled = true; btn.textContent = '⏳ Wird angelegt…';
  try {
    const id = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const hash = await hashPasswort(pw);
    const res = await SB.post('users', {
      id, name, email,
      password_hash: hash,
      role: 'verantwortlicher',
      tenant_id: currentUser.tenantId,
      position: pos || null,
      telefon: tel || null,
      mobil: mob || null,
      aktiv: true,
      archiviert: false
    });
    if (res?.error) {
      const msg = res.error.message || '';
      if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
        fehEl.textContent = 'Diese E-Mail ist bereits registriert.';
      } else {
        fehEl.textContent = 'Fehler: ' + msg;
      }
      btn.disabled = false; btn.textContent = '✅ Anlegen';
      return;
    }
    await sbAudit('FIRMA_VERANTWORTLICHER_NEU', `${name} (${email}) angelegt von ${currentUser.name}`);
    firmaVerantwortlichenAnlegenSchliessen();
    // E-Mail mit Zugangsdaten versenden
    const tenantObj = APP_TENANTS.find(t => t.id === currentUser.tenantId);
    const emailOk = await sendLoginEmail({ an: email, name, rolle: 'verantwortlicher', passwort: pw, unternehmen: tenantObj?.name || '' });
    const mailHinweis = emailOk ? ' — ✉️ Zugangsdaten gesendet' : ' — ⚠️ E-Mail fehlgeschlagen!';
    showToast(`✅ ${name} angelegt — Passwort: ${pw}${mailHinweis}`, '#0f5132');
    firmaRenderVerantwortliche();
  } catch(e) {
    fehEl.textContent = 'Fehler: ' + e.message;
    btn.disabled = false; btn.textContent = '✅ Anlegen';
  }
}

// Verantwortlichen bearbeiten
let _firmaBearbeitenUserId = null;
async function firmaVerantwortlichenBearbeiten(userId) {
  _firmaBearbeitenUserId = userId;
  try {
    const rows = await SB.get('users', `id=eq.${userId}`);
    const u = rows[0];
    if (!u) return;
    document.getElementById('fvb-name').value     = u.name || '';
    document.getElementById('fvb-email').value    = u.email || '';
    document.getElementById('fvb-position').value = u.position || '';
    document.getElementById('fvb-telefon').value  = u.telefon || '';
    document.getElementById('fvb-mobil').value    = u.mobil || '';
    document.getElementById('fvb-fehler').textContent = '';
    document.getElementById('fvb-modal').style.display = 'flex';
  } catch(e) { showToast('❌ Fehler: ' + e.message, '#dc2626'); }
}
function firmaVerantwortlichenBearbeitenSchliessen() {
  document.getElementById('fvb-modal').style.display = 'none';
  _firmaBearbeitenUserId = null;
}
async function firmaVerantwortlichenBearbeitenSpeichern() {
  if (!_firmaBearbeitenUserId) return;
  const name  = document.getElementById('fvb-name').value.trim();
  const email = document.getElementById('fvb-email').value.trim().toLowerCase();
  const pos   = document.getElementById('fvb-position').value.trim();
  const tel   = document.getElementById('fvb-telefon').value.trim();
  const mob   = document.getElementById('fvb-mobil').value.trim();
  const fehEl = document.getElementById('fvb-fehler');
  fehEl.textContent = '';
  if (!name) { fehEl.textContent = 'Name ist Pflichtfeld.'; return; }
  const btn = document.getElementById('fvb-speichern-btn');
  btn.disabled = true; btn.textContent = '⏳ Wird gespeichert…';
  try {
    await SB.patch('users', `id=eq.${_firmaBearbeitenUserId}`, {
      name, email, position: pos || null, telefon: tel || null, mobil: mob || null
    });
    await sbAudit('FIRMA_VERANTWORTLICHER_BEARBEITET', `${name} aktualisiert von ${currentUser.name}`);
    firmaVerantwortlichenBearbeitenSchliessen();
    showToast(`✅ ${name} aktualisiert`, '#0f5132');
    firmaRenderVerantwortliche();
  } catch(e) {
    fehEl.textContent = 'Fehler: ' + e.message;
    btn.disabled = false; btn.textContent = '💾 Speichern';
  }
}

async function firmaVerantwortlichenToggleAktiv(userId, jetztAktiv) {
  try {
    await SB.patch('users', `id=eq.${userId}`, { aktiv: !jetztAktiv });
    await sbAudit(jetztAktiv ? 'FIRMA_V_DEAKTIVIERT' : 'FIRMA_V_AKTIVIERT',
      `Verantwortlicher ${userId} ${jetztAktiv ? 'deaktiviert' : 'aktiviert'}`);
    showToast(jetztAktiv ? '⏸ Deaktiviert' : '▶ Aktiviert', '#1e3a5f');
    firmaRenderVerantwortliche();
  } catch(e) { showToast('❌ ' + e.message, '#dc2626'); }
}

async function firmaSchulungZuweisen(vorlagenId) {
  // Datum-Modal öffnen, dann Zuweisung erstellen
  const frist = await zuwNeuStartenDatumModal(
    SCHULUNG_VORLAGEN.find(v=>v.id===vorlagenId)?.titel || vorlagenId,
    new Date(Date.now()+365*86400000).toISOString().split('T')[0]
  );
  if (!frist) return;
  try {
    const id = 'zuw_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    await SB.post('zuweisungen', {
      id, vorlage_id: vorlagenId,
      tenant_id: currentUser.tenantId,
      frist, pflicht: true
    });
    zuweisungen.push({ id, vorlagenId, tenantId: currentUser.tenantId, frist, pflicht: true });
    formulare[id] = {};
    await sbAudit('FIRMA_ZUWEISUNG', `Vorlage ${vorlagenId} zugewiesen von ${currentUser.name}`);
    showToast('✅ Schulung zugewiesen!', '#0f5132');
    firmaRenderSchulungen();
  } catch(e) { showToast('❌ ' + e.message, '#dc2626'); }
}

// ══════════════════════════════════════════════════════════════
// v50: SCHULUNGSNACHWEIS-PDF PRO MITARBEITER
// ══════════════════════════════════════════════════════════════

async function generiereSchulungsnachweisPDF(userId) {
  const user = APP_USERS.find(u => u.id === userId);
  if (!user) { showToast('⚠️ Mitarbeiter nicht gefunden', '#f59e0b'); return; }
  const tenant = APP_TENANTS.find(t => t.id === (user.tenant_id || currentUser.tenantId));
  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ PDF wird erstellt…'; }

  try {
    // 1. Formulare laden
    const eigeneZuwIds = zuweisungen
      .filter(z => z.tenantId === currentUser.tenantId)
      .map(z => z.id);
    const alleFormulareRaw = await SB.get('formulare',
      `abgeschlossen_von=eq.${encodeURIComponent(userId)}&order=abgeschlossen_am.desc&limit=100`);
    const alleFormulare = alleFormulareRaw.filter(f =>
      eigeneZuwIds.includes(f.id) || eigeneZuwIds.includes(f.zuweisung_id)
    );

    // 2. Lernpfad laden
    const lpRows = await SB.get('lernpfad_unterschriften',
      `user_id=eq.${userId}&tenant_id=eq.${encodeURIComponent(currentUser.tenantId||'')}&unterzeichnet_am=not.is.null&order=durchgang.desc&limit=1`);
    const lpUnt = lpRows && lpRows.length ? lpRows[0] : null;

    // 3. PDF erstellen
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, margin = 16;
    let y = 20;

    // Header
    doc.setFillColor(30, 58, 95);
    doc.rect(0, 0, W, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Schulungsnachweis', margin, 11);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text('SIBEDA Schulungsmanagement · CSC GmbH', margin, 18);
    doc.text('Erstellt: ' + new Date().toLocaleDateString('de-DE'), W - margin, 18, { align: 'right' });
    y = 38;

    // Mitarbeiter-Info
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('👤 Mitarbeiter', margin, y); y += 7;
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${user.name}`, margin, y); y += 5;
    doc.text(`E-Mail: ${user.email}`, margin, y); y += 5;
    if (tenant) { doc.text(`Unternehmen: ${tenant.name}`, margin, y); y += 5; }
    if (user.bereich) { doc.text(`Bereich: ${user.bereich}`, margin, y); y += 5; }
    y += 5;

    // Trennlinie
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, W - margin, y); y += 7;

    // Abgeschlossene Schulungen
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text(`📋 Abgeschlossene Schulungen (${alleFormulare.length})`, margin, y); y += 8;

    if (alleFormulare.length === 0) {
      doc.setFontSize(9); doc.setFont('helvetica', 'italic');
      doc.text('Noch keine abgeschlossenen Schulungen.', margin + 4, y); y += 8;
    } else {
      for (const f of alleFormulare) {
        if (y > 265) { doc.addPage(); y = 20; }
        const zuw = zuweisungen.find(z => z.id === f.id || z.id === f.zuweisung_id);
        const v = zuw ? SCHULUNG_VORLAGEN.find(vl => vl.id === zuw.vorlagenId) : null;
        const titel = v ? v.titel : (f.id || 'Schulung');
        const datum = f.abgeschlossen_am
          ? new Date(f.abgeschlossen_am).toLocaleDateString('de-DE') : '–';

        doc.setFillColor(240, 253, 244);
        doc.rect(margin, y - 4, W - 2*margin, 12, 'F');
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 81, 50);
        doc.text(`✓ ${titel}`, margin + 2, y + 2);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Abgeschlossen: ${datum}`, W - margin - 2, y + 2, { align: 'right' });
        doc.setTextColor(0, 0, 0);
        y += 14;
      }
    }

    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, W - margin, y); y += 7;

    // Lernpfad-Block
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('📚 Lernpfad (29 Kapitel)', margin, y); y += 8;
    if (lpUnt && lpUnt.unterzeichnet_am) {
      const maDatum = new Date(lpUnt.unterzeichnet_am).toLocaleDateString('de-DE');
      doc.setFillColor(240, 253, 244);
      doc.rect(margin, y - 4, W - 2*margin, lpUnt.verantwortlicher_am ? 22 : 14, 'F');
      doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 81, 50);
      doc.text('✓ Lernpfad abgeschlossen und unterzeichnet', margin + 2, y + 2);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(60, 60, 60);
      doc.text(`Mitarbeiter: ${lpUnt.vollname} · ${maDatum}`, margin + 2, y + 8);
      if (lpUnt.verantwortlicher_am) {
        const vDatum = new Date(lpUnt.verantwortlicher_am).toLocaleDateString('de-DE');
        doc.text(`Verantwortlicher: ${lpUnt.verantwortlicher_name} · ${vDatum}`, margin + 2, y + 14);
      }
      doc.setTextColor(0, 0, 0);
      y += lpUnt.verantwortlicher_am ? 28 : 20;
    } else {
      doc.setFontSize(9); doc.setFont('helvetica', 'italic');
      doc.text('Lernpfad noch nicht abgeschlossen.', margin + 4, y); y += 8;
    }

    // Footer
    doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text(`SIBEDA Schulungsmanagement · CSC GmbH · ${new Date().toLocaleDateString('de-DE')}`,
      W/2, 290, { align: 'center' });

    // Download
    const safeName = user.name.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, '').replace(/\s+/g, '_');
    const datumStr = new Date().toISOString().split('T')[0];
    doc.save(`Schulungsnachweis_${safeName}_${datumStr}.pdf`);
    showToast('✅ PDF-Nachweis heruntergeladen!', '#0f5132');
  } catch(e) {
    showToast('❌ Fehler beim PDF-Erstellen: ' + e.message, '#dc2626');
    console.error('PDF-Fehler:', e);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📄 PDF-Nachweis'; }
  }
}


// ══════════════════════════════════════════════════════════════
//  HILFE-SYSTEM — Kontextsensitive Anleitungen pro Ebene
// ══════════════════════════════════════════════════════════════

function hilfeOeffnen(ebene) {
  const inhalte = {
    admin: hilfeInhaltAdmin(),
    firma: hilfeInhaltFirma(),
    verantwortlicher: hilfeInhaltVerantwortlicher()
  };
  const inhalt = inhalte[ebene];
  if (!inhalt) return;
  let modal = document.getElementById('hilfe-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'hilfe-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:24px;max-width:520px;width:100%;margin:auto;position:relative">
      <button onclick="hilfeSchliessen()" style="position:absolute;top:12px;right:14px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#6b7280">✕</button>
      ${inhalt}
    </div>`;
  modal.style.display = 'flex';
}

function hilfeSchliessen() {
  const m = document.getElementById('hilfe-modal');
  if (m) m.style.display = 'none';
}

function hilfeInhaltAdmin() {
  return `
    <h2 style="margin:0 0 16px;color:#1a3a5c;font-size:1.1rem">📖 Anleitung: CSC-Admin</h2>
    <div style="font-size:.88rem;color:#374151;line-height:1.6">
      <p><strong>Als CSC-Admin haben Sie Zugang zu allen Bereichen der App.</strong></p>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">📊 Tab: Übersicht</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Ampelstatus aller Unternehmen auf einen Blick</li>
        <li>🟢 Grün = alles abgeschlossen · 🟡 Gelb = läuft · 🔴 Rot = überfällig</li>
        <li>Balkendiagramm: Top-5 Unternehmen mit meisten offenen Schulungen</li>
        <li>Auf ein Unternehmen tippen → Detailansicht aller Schulungen</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">📋 Tab: Schulungsvorlagen</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li><strong>Neue Vorlage erstellen:</strong> Typ wählen → „Eigene Felder" oder „CSC-Formular (PDF)"</li>
        <li>Titel, Kurzbeschreibung, Wiederholungsintervall (Monate) eingeben</li>
        <li>Abschnitte & Felder (Freitext, Checkbox, Unterschrift) hinzufügen</li>
        <li>Unterschriftsfelder konfigurieren (z.B. Mitarbeiter + Vorgesetzter)</li>
        <li><strong>Bestehende Vorlagen:</strong> Liste aufklappen → Vorlage bearbeiten oder löschen</li>
        <li><strong>📚 29 Lernpfad-Kernkapitel:</strong> Liste der SIBEDA-Kernkapitel anzeigen</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">📅 Tab: Zuweisungen</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Schulungsvorlage auswählen (Suchfeld), Unternehmen wählen, Frist setzen</li>
        <li>Pflichtschulung ✅ markieren · Wiederholungsintervall festlegen (z.B. 12 Monate)</li>
        <li>Bestehende Zuweisungen: Frist ändern, Zuweisung löschen</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">📅 Tab: Kalender</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Monatsansicht aller Schulungsfristen über alle Unternehmen</li>
        <li>Farbige Punkte je Ampelstatus · Auf Datum tippen → Details</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">📦 Tab: Archiv</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Alle abgeschlossenen Schulungen aller Unternehmen</li>
        <li>Archivierte Mitarbeiter einsehen</li>
        <li>PDF-Nachweise abrufbar</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">🏢 Tab: Unternehmen</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li><strong>Neues Unternehmen anlegen:</strong> Name, E-Mail (= Login), Ansprechpartner, Passwort</li>
        <li>🎲 Zufallspasswort generieren empfohlen</li>
        <li>Login-Daten werden <strong>automatisch per E-Mail zugesandt</strong></li>
        <li>Unternehmen erhalten die Rolle <em>Unternehmens-Admin</em> und legen selbst Verantwortliche an</li>
        <li>Bestehende Unternehmen: Liste aufklappen → Daten bearbeiten</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">📋 Tab: Protokoll</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Vollständiges Audit-Log: alle Aktionen aller Nutzer mit Zeitstempel</li>
        <li>Aktionen: Login, Logout, Abschluss, Anlegen, Änderungen u.v.m.</li>
      </ul>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-top:16px">
        <strong>💡 Automatik:</strong> E-Mail-Erinnerungen werden täglich um 08:00 Uhr automatisch versendet — 30 Tage vor Fristablauf an die zuständigen Verantwortlichen.
      </div>
    </div>`;
}

function hilfeInhaltFirma() {
  return `
    <h2 style="margin:0 0 16px;color:#1a3a5c;font-size:1.1rem">📖 Anleitung: Unternehmens-Admin</h2>
    <div style="font-size:.88rem;color:#374151;line-height:1.6">
      <p><strong>Als Unternehmens-Admin verwalten Sie Ihre Verantwortlichen und behalten den Schulungsstand im Blick.</strong></p>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">👔 Tab: Verantwortliche</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li><strong>➕ Verantwortlichen anlegen:</strong> Name, E-Mail, Position, Telefon, Mobil eingeben</li>
        <li>🎲 Passwort generieren oder manuell vergeben</li>
        <li>Login-Daten werden <strong>automatisch per E-Mail zugesandt</strong></li>
        <li>✏️ Daten bearbeiten: Stift-Symbol neben dem Namen antippen</li>
        <li>⏸ Konto sperren / freigeben: Aktiv/Inaktiv-Schalter in der Karte</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">📊 Tab: Übersicht</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Ampelstatus aller Mitarbeiter Ihres Unternehmens</li>
        <li>🟢 Grün = abgeschlossen · 🟡 Gelb = läuft / bald fällig · 🔴 Rot = überfällig</li>
        <li>Schneller Überblick ohne in einzelne Verantwortlichen-Konten wechseln zu müssen</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">📋 Tab: Schulungen</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Alle Ihrem Unternehmen zugewiesenen Schulungsvorlagen</li>
        <li>Schulungen können direkt einzelnen Mitarbeitern zugewiesen werden</li>
      </ul>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-top:16px">
        <strong>💡 Hinweis:</strong> Die Verantwortlichen legen die Mitarbeiter selbst an und führen die Schulungen durch. Sie sehen den Gesamtstatus — ohne Einzelschulungen bearbeiten zu müssen.
      </div>
    </div>`;
}

function hilfeInhaltVerantwortlicher() {
  return `
    <h2 style="margin:0 0 16px;color:#1a3a5c;font-size:1.1rem">📖 Anleitung: Verantwortlicher</h2>
    <div style="font-size:.88rem;color:#374151;line-height:1.6">
      <p><strong>Als Verantwortlicher verwalten Sie Ihre Mitarbeiter und führen Schulungen durch.</strong></p>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">1. Mitarbeiter anlegen</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Button <strong>➕ Mitarbeiter anlegen</strong> → Name, E-Mail, Standort, Bereich eingeben</li>
        <li>Passwort wird automatisch generiert · Login-Daten werden <strong>per E-Mail zugesandt</strong></li>
        <li>Alternativ: <strong>👥 Mitarbeiter importieren</strong> → Excel-Datei (.xlsx) hochladen</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">2. Schulungen zuweisen</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Mitarbeiterkarte antippen → aufklappen → <strong>Schulung zuweisen</strong></li>
        <li>Vorlage auswählen, Frist festlegen (Schnellauswahl: 3 / 6 / 9 / 12 Monate)</li>
        <li>Für Bereichseinweisungen: <strong>📋 Schulung zuweisen</strong> (oben rechts) → persönliche Zuweisung für einzelne Mitarbeiter</li>
        <li>Pflichtschulung ✅ markierbar · Wiederholungsintervall optional</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">3. Schulung durchführen</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Mitarbeiterkarte → Zuweisung antippen → Formular öffnet sich</li>
        <li>Formular ausfüllen (Felder, Checkboxen) — Sprache wählen: 🇩🇪 🇬🇧 🇹🇷 🇸🇦 🇪🇸 🇷🇺</li>
        <li><strong>💾 Zwischenspeichern</strong> möglich (Fortschritt bleibt erhalten)</li>
        <li><strong>✅ Abschließen & PDF</strong> → Unterschriften einholen → PDF wird automatisch gespeichert</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">4. Lernpfad (29 Kapitel)</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Button <strong>📚 Lernpfad — 29 Kapitel</strong> → aufklappen</li>
        <li>Mitarbeiter absolviert 29 Kapitel selbstständig am eigenen Gerät</li>
        <li>Nach Abschluss aller Kapitel: Mitarbeiter unterschreibt digital → Sie gegenzeichnen</li>
        <li>Neuer Durchgang starten: Mitarbeiterkarte → <strong>🔄 Neu starten</strong></li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">5. Schulungshistorie & PDF-Nachweis</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Mitarbeiterkarte aufklappen → <strong>📋 Historie</strong></li>
        <li>Alle abgeschlossenen Schulungen mit Datum und Unterschriften einsehen</li>
        <li><strong>📄 PDF-Nachweis</strong> generieren und öffnen (alle Schulungen + Lernpfad)</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">6. Mitarbeiter verwalten</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Filter: Aktive / Passive / Archivierte · nach Bereich / Standort filtern</li>
        <li>⏸ <strong>Passiv setzen</strong>: Mitarbeiter z.B. im Urlaub — keine neuen Schulungen</li>
        <li>📦 <strong>Archivieren</strong>: ausgeschiedene Mitarbeiter — Daten bleiben im Archiv erhalten</li>
        <li>✏️ Mitarbeiterdaten bearbeiten (Name, E-Mail, Standort, Bereich)</li>
      </ul>

      <h3 style="color:#1a3a5c;font-size:.95rem;margin:14px 0 6px">7. Kalender & Ampel</h3>
      <ul style="margin:0 0 12px;padding-left:18px">
        <li>Button <strong>📅 Kalender</strong> → Monatsansicht aller Schulungsfristen</li>
        <li>🟢 Grün = abgeschlossen · 🟡 Gelb = bald fällig (≤ 30 Tage) · 🔴 Rot = überfällig</li>
      </ul>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-top:16px">
        <strong>💡 Tipp:</strong> E-Mail-Erinnerungen werden 30 Tage vor Fristablauf automatisch an Sie versendet. Passwort jederzeit unter <strong>🔐 Passwort ändern</strong> (nach Login über Einstellungen) anpassbar.
      </div>
    </div>`;
}


// ══════════════════════════════════════════════════════════════
//  PSAgA SCHULUNGSMODULE — Folien-Viewer
// ══════════════════════════════════════════════════════════════

const PSAGA_SUPABASE_URL = 'https://vziankbxuiqwekdbjewg.supabase.co';
const PSAGA_BUCKET       = 'schulung-folien';

// TTS-Texte pro Modul und Folie (optional — falls nicht gefüllt, ist Ton-Button stumm)
const PSAGA_TTS_TEXTE = {
  'psaga-00-einleitung': [
    // Folie 1
    'Willkommen zur Unterweisung zur persönlichen Schutzausrüstung gegen Absturz. In dieser Einleitung erhalten Sie einen Überblick über den Aufbau der Schulung und den roten Faden, der Sie durch die einzelnen Module führt.',
    // Folie 2
    'Die Schulung besteht aus acht praxisnahen Modulen. Schritt für Schritt geht es von den rechtlichen Grundlagen über die Auswahl und Benutzung der Ausrüstung bis hin zu Pflege, Prüfung und Notfallmaßnahmen.',
    // Folie 3
    'Zu Beginn klären wir die Grundlagen. Dazu gehören die Bedeutung der persönlichen Schutzausrüstung gegen Absturz, typische Risikokategorien sowie relevante Normen und rechtliche Anforderungen.',
    // Folie 4
    'Anschließend betrachten wir die Gefährdungsbeurteilung. Vor jedem Einsatz muss klar sein, welche Gefahren bestehen und welche Schutzmaßnahmen erforderlich sind. Das Stopp-Prinzip hilft dabei, Maßnahmen sinnvoll zu priorisieren.',
    // Folie 5
    'Danach geht es um die verschiedenen Systemarten. Rückhaltesysteme, Positionierungssysteme und Auffangsysteme haben unterschiedliche Aufgaben und müssen passend zur jeweiligen Arbeitssituation ausgewählt werden.',
    // Folie 6
    'In den Modulen vier bis sechs stehen die Komponenten der persönlichen Schutzausrüstung gegen Absturz im Mittelpunkt. Dazu zählen Auffanggurte, Falldämpfer, Höhensicherungsgeräte und Steigschutzsysteme.',
    // Folie 7
    'Ein weiterer Schwerpunkt sind Anschlageinrichtungen. Sie können dauerhaft vorhanden oder temporär eingesetzt werden. Entscheidend ist, dass sie geeignet, korrekt verwendet und ausreichend tragfähig sind.',
    // Folie 8
    'Bei der sicheren Benutzung geht es unter anderem um die Prüfung vor dem Gebrauch, um Sturzphysik, Fangstoß, Fallhöhe und Kantenproblematik. Gerade hier zeigt sich, wie wichtig sorgfältige Vorbereitung ist.',
    // Folie 9
    'In den letzten Modulen geht es um Pflege, Lagerung, Reinigung und Prüfung der Ausrüstung. Beschädigte oder ablegereife persönliche Schutzausrüstung gegen Absturz darf nicht weiterverwendet werden. Die regelmäßige Sachkundigenprüfung ist dabei ein fester Bestandteil.',
    // Folie 10
    'Außerdem behandeln wir Rettung und Notfallmaßnahmen. Für Arbeiten mit persönlicher Schutzausrüstung gegen Absturz muss immer ein Rettungskonzept vorhanden sein. Besonders die Gefahr des Hängetraumas macht deutlich, dass im Ernstfall schnell und richtig gehandelt werden muss.',
    // Folie 11
    'Jedes Modul endet mit einer Wissensabfrage mit mehreren Antwortmöglichkeiten. Das Bestehen ist Voraussetzung, um das nächste Modul freizuschalten. So wird sichergestellt, dass die Inhalte verstanden wurden.',
    // Folie 12
    'Das gemeinsame Ziel ist einfach und wichtig: Alle sollen gesund nach Hause kommen. Diese Unterweisung soll dabei helfen, Risiken zu erkennen, richtig zu handeln und Sicherheit im Arbeitsalltag konsequent umzusetzen.'
  ],
  'psaga-01-rechtliche-grundlagen': [
    // Folie 1
    'Willkommen zur PSAgA Schulung nach DGUV Regel 112-198. Diese Schulung vermittelt Ihnen die rechtlichen Grundlagen der persönlichen Schutzausrüstung gegen Absturz. Bitte schenken Sie den folgenden Folien Ihre volle Aufmerksamkeit.',
    // Folie 2
    'Arbeiten in der Höhe gehören zu den gefährlichsten Tätigkeiten im Arbeitsalltag. Persönliche Schutzausrüstung gegen Absturz – kurz PSAgA – schützt Beschäftigte vor schweren oder tödlichen Sturzverletzungen. Diese Schulung erklärt Ihnen, warum regelmäßige Unterweisungen gesetzlich vorgeschrieben sind.',
    // Folie 3
    'Die rechtlichen Grundlagen der PSAgA sind im Arbeitsschutzgesetz, der PSA-Benutzungsverordnung und der DGUV Regel 112-198 verankert. Der Arbeitgeber ist verpflichtet, geeignete PSAgA bereitzustellen und die Beschäftigten regelmäßig zu unterweisen. Diese Pflichten sind nicht optional – Verstöße können zu empfindlichen Bußgeldern und strafrechtlichen Konsequenzen führen.',
    // Folie 4
    'Paragraph 1 des Arbeitsschutzgesetzes verpflichtet den Arbeitgeber, alle erforderlichen Maßnahmen zur Sicherheit und zum Gesundheitsschutz der Beschäftigten zu treffen. Unterweisungen sind dabei ein zentrales Element – sie müssen arbeitsplatzbezogen, regelmäßig und dokumentiert erfolgen. Nur wer seine Mitarbeiter nachweislich unterwiesen hat, erfüllt seine gesetzliche Sorgfaltspflicht.',
    // Folie 5
    'Das Hängetrauma ist ein lebensbedrohlicher Zustand, der bereits nach wenigen Minuten des bewusstlosen Hängens im Gurtsystem auftreten kann. Blut versackt in den Beinen, der Rückfluss zum Herzen wird unterbrochen – der Tod kann innerhalb von 30 Minuten eintreten. Deshalb ist schnelle Rettung nach einem Sturz absolut entscheidend – und ein Rettungsplan Pflicht.',
    // Folie 6
    'Paragraph 3 der PSA-Benutzungsverordnung regelt die Unterweisungspflicht des Arbeitgebers. Vor dem erstmaligen Einsatz von PSAgA und danach in regelmäßigen Abständen müssen Beschäftigte über die korrekte Benutzung, Wartung und Lagerung der Ausrüstung unterwiesen werden. Die Unterweisung muss verständlich und auf die konkrete Arbeitssituation zugeschnitten sein.',
    // Folie 7
    'Die EU-Verordnung 2016 Schrägstrich 425 teilt persönliche Schutzausrüstung in drei Risikokategorien ein. Kategorie I umfasst geringe Risiken wie einfache Handschuhe. Kategorie II deckt mittlere Risiken ab. Kategorie III – zu der PSAgA gehört – schützt vor tödlichen oder irreversiblen Gesundheitsgefahren und unterliegt den strengsten Anforderungen an Prüfung und Zertifizierung.',
    // Folie 8
    'PSAgA fällt ausnahmslos in Kategorie III der EU-Verordnung 2016 Schrägstrich 425 – den höchsten Schutzstandard für persönliche Schutzausrüstung. Das bedeutet: Auffanggurte, Verbindungsmittel und Höhensicherungsgeräte müssen von einer benannten Prüfstelle zertifiziert sein. Jedes Gerät muss eine CE-Kennzeichnung und eine EG-Baumusterprüfbescheinigung tragen.',
    // Folie 9
    'Für PSAgA gelten mehrere Normen und Gesetze gleichzeitig. Das Arbeitsschutzgesetz bildet den übergeordneten Rahmen. Die DGUV Regel 112-198 konkretisiert die Anforderungen für Absturzschutz. Die DIN EN 361 definiert die technischen Anforderungen an Auffanggurte. Diese Normen ergänzen sich und müssen alle eingehalten werden.',
    // Folie 10
    'Bei der sicheren Arbeit in der Höhe tragen sowohl Arbeitgeber als auch Beschäftigte klare Verantwortung. Der Arbeitgeber muss geeignete PSAgA bereitstellen, unterweisen und dokumentieren. Die Beschäftigten sind ihrerseits verpflichtet, die PSAgA bestimmungsgemäß zu benutzen und Mängel sofort zu melden. Nur im Zusammenspiel beider Seiten funktioniert Arbeitssicherheit.',
    // Folie 11
    'Nach Paragraph 2 der PSA-Benutzungsverordnung muss der Arbeitgeber zunächst eine Gefährdungsbeurteilung durchführen und auf dieser Basis die geeignete PSAgA auswählen. Er hat die Ausrüstung kostenlos bereitzustellen, auf Funktionsfähigkeit zu prüfen und regelmäßig zu warten. Außerdem muss er sicherstellen, dass die PSAgA den individuellen ergonomischen und gesundheitlichen Anforderungen der Beschäftigten entspricht.',
    // Folie 12
    'Paragraph 15 des Arbeitsschutzgesetzes verpflichtet Beschäftigte, ihre Gesundheit und die ihrer Kollegen nicht zu gefährden. Sie müssen die bereitgestellte PSAgA bestimmungsgemäß und entsprechend der Unterweisung benutzen. Eigenmächtige Veränderungen an der Ausrüstung sind verboten – und jeder erkannte Mangel muss unverzüglich dem Arbeitgeber gemeldet werden.',
    // Folie 13
    'Ein vollständiges PSAgA-System besteht aus drei Grundkomponenten: dem Auffanggurt, dem Verbindungsmittel und dem Anschlagpunkt. Der Auffanggurt verteilt die Fangstoßkraft auf Brust, Schultern und Oberschenkel. Das Verbindungsmittel – etwa ein Bandfalldämpfer oder ein Höhensicherungsgerät – begrenzt die Fallstrecke und den Fangstoß. Der Anschlagpunkt muss für eine Last von mindestens 12 Kilonewton ausgelegt sein.',
    // Folie 14
    'Vor jeder Benutzung muss PSAgA einer Sichtprüfung unterzogen werden. Zu prüfen sind alle Nähte, Schnallen, Karabiner und das Gurtband auf Verschleiß, Risse oder Korrosion. Nach einem Fangstoß ist die gesamte Ausrüstung sofort außer Betrieb zu nehmen und durch eine befähigte Person zu prüfen. Die jährliche Prüfung durch einen Sachkundigen ist gesetzlich vorgeschrieben.',
    // Folie 15
    'Der Anschlagpunkt ist das Herzstück jedes Absturzsicherungssystems. Er muss so positioniert sein, dass die freie Fallhöhe auf ein Minimum reduziert wird – idealerweise über Kopfhöhe. Anschlagpunkte an Gebäuden oder Konstruktionen müssen von einem Statiker oder Tragwerksplaner freigegeben sein. Mobile Anschlageinrichtungen müssen ebenfalls geprüft und zugelassen sein.',
    // Folie 16
    'Die Fallstrecke ist der Abstand, den ein Beschäftigter zurücklegt, bevor das PSAgA-System greift. Sie setzt sich zusammen aus dem freien Fall, dem Auslöseweg des Verbindungsmittels und der Körpergröße. Der entstehende Fangstoß darf 6 Kilonewton nicht überschreiten. Daher ist die richtige Dimensionierung des Gesamtsystems entscheidend – zu niedrige Anschlagpunkte können zum Aufprall am Untergrund führen.',
    // Folie 17
    'Nach einem Absturz kann der Verunglückte bewusstlos im Gurt hängen. Ein Rettungsplan muss deshalb vor Arbeitsbeginn festgelegt und allen Beteiligten bekannt sein. Der Plan umfasst: wer rettet, mit welchen Mitteln und wie schnell. Die Rettung muss innerhalb von wenigen Minuten erfolgen, um das Hängetrauma zu verhindern. Rettungsübungen sollten regelmäßig durchgeführt werden.',
    // Folie 18
    'Alle Unterweisungen zur PSAgA müssen schriftlich dokumentiert werden. Die Dokumentation muss Namen, Datum, Inhalt der Unterweisung und die Unterschrift des Unterweisenden enthalten. Diese Nachweise sind im Falle eines Arbeitsunfalls gegenüber Berufsgenossenschaft und Aufsichtsbehörden vorzulegen. Ohne Dokumentation gilt die Unterweisung als nicht erfolgt.',
    // Folie 19
    'Wir kommen nun zu den konkreten Pflichten der einzelnen Akteure. Sowohl Arbeitgeber als auch Beschäftigte tragen Verantwortung – jeder in seinem Bereich. Im Folgenden werden diese Pflichten detailliert erläutert.',
    // Folie 20
    'Der Arbeitgeber muss gemäß Paragraph 2 PSA-Benutzungsverordnung ausschließlich PSAgA bereitstellen, die der EU-Verordnung 2016 Schrägstrich 425 entspricht. Er trägt die Verantwortung für Wartung, Reparatur und hygienisch einwandfreien Zustand der Ausrüstung. Zusätzlich muss er eine Gefährdungsbeurteilung durchführen und sicherstellen, dass die PSAgA den ergonomischen Anforderungen der Beschäftigten entspricht.',
    // Folie 21
    'Beschäftigte sind nach Paragraph 15 Arbeitsschutzgesetz verpflichtet, die PSAgA gemäß Unterweisung und Weisung des Arbeitgebers zu benutzen. Eigene Handlungen dürfen weder sie selbst noch andere gefährden. Jeder festgestellte Defekt an Schutzsystemen muss unverzüglich gemeldet werden – das schreibt Paragraph 16 des Arbeitsschutzgesetzes vor. Vor jeder Benutzung ist eine Sichtprüfung der Ausrüstung durchzuführen. Damit endet diese Schulung – bitte bereiten Sie sich nun auf den Wissenstest vor.'
  ]
};

// ── PSAgA Quiz-Fragen (Wissenstest) ──────────────────────────────────────────
const PSAGA_QUIZ = {
  'psaga-01-rechtliche-grundlagen': [
    {
      frage: 'Welche Norm regelt die persönliche Schutzausrüstung gegen Absturz (PSAgA)?',
      antworten: ['DIN EN 388', 'DGUV Regel 112-198', 'ASR A1.3', 'TRGS 555'],
      richtig: 1
    },
    {
      frage: 'Was ist das Hängetrauma und wie reagiert man richtig?',
      antworten: [
        'Überhitzung — mit kaltem Wasser kühlen',
        'Kreislaufschock durch Blutstau im Gurt — sofort retten und aufrecht lagern',
        'Muskelkrampf — Gurt lockern und warten',
        'Höhenschwindel — Augen schließen'
      ],
      richtig: 1
    },
    {
      frage: 'Welcher Paragraph verpflichtet den Arbeitgeber zur Unterweisung der Beschäftigten?',
      antworten: ['§ 3 ArbStättV', '§ 12 ArbSchG', '§ 22 SGB VII', '§ 4 BetrVG'],
      richtig: 1
    },
    {
      frage: 'Welcher Risikokategorie ist PSAgA gemäß EU-VO 2016/425 zugeordnet?',
      antworten: [
        'Kategorie I — geringes Risiko',
        'Kategorie II — mittleres Risiko',
        'Kategorie III — Schutz vor tödlichen oder irreversiblen Risiken',
        'Kategorie IV — besonderes Risiko'
      ],
      richtig: 2
    },
    {
      frage: 'Welche Pflichten haben Beschäftigte gemäß § 15 ArbSchG?',
      antworten: [
        'Keine — Pflichten trägt allein der Arbeitgeber',
        'PSAgA eigenständig kaufen und warten',
        'PSAgA bestimmungsgemäß verwenden, Mängel sofort melden und Unterweisungen besuchen',
        'PSAgA nur auf ausdrückliche Anweisung anlegen'
      ],
      richtig: 2
    }
  ],
  'psaga-02-gefaehrdungsbeurteilung': [
    {
      frage: 'Was beschreibt das STOP-Prinzip im Arbeitsschutz?',
      antworten: [
        'Sofortige Tätigkeitsunterbrechung bei Gefahr',
        'Die gesetzlich vorgeschriebene Reihenfolge von Schutzmaßnahmen: Substitution → Technik → Organisation → Person',
        'Eine Checkliste für den Einsatz von PSAgA',
        'Die Norm für persönliche Schutzausrüstung'
      ],
      richtig: 1
    },
    {
      frage: 'Warum hat Kollektivschutz (z.B. Geländer) Vorrang vor PSAgA?',
      antworten: [
        'Weil er günstiger ist',
        'Weil PSAgA keine Zulassung hat',
        'Weil Kollektivschutz alle Personen im Bereich gleichzeitig schützt, unabhängig von ihrer Ausrüstung',
        'Weil PSAgA nur bei Sturz wirkt und keine Prävention bietet'
      ],
      richtig: 2
    },
    {
      frage: 'Ab welcher Absturzhöhe ist laut ASR A2.1 grundsätzlich Absturzschutz erforderlich (Regelfall Büro/Industrie)?',
      antworten: [
        'Ab 0,5 Meter',
        'Ab 1,0 Meter',
        'Ab 2,0 Meter',
        'Nur ab 5,0 Meter'
      ],
      richtig: 2
    },
    {
      frage: 'Welche Voraussetzung muss ein Beschäftigter zwingend erfüllen, um mit PSAgA arbeiten zu dürfen?',
      antworten: [
        'Mindestens 10 Jahre Berufserfahrung',
        'Gesundheitliche Eignung (ehem. G41), Unterweisung und Beauftragung durch den Arbeitgeber',
        'Einen gültigen Führerschein der Klasse B',
        'Mitgliedschaft in einer Berufsgenossenschaft'
      ],
      richtig: 1
    },
    {
      frage: 'Was bedeutet "S" im STOP-Prinzip?',
      antworten: [
        'Sicherung — PSAgA anlegen',
        'Substitution — die gefährliche Tätigkeit oder Gefahrenquelle ersetzen oder vermeiden',
        'Schulung — Mitarbeiter unterweisen',
        'Sicherheitsabstand — Mindestabstand zur Kante einhalten'
      ],
      richtig: 1
    }
  ],
  'psaga-03-rueckhaltesysteme': [
    {frage:"Was ist das Hauptziel eines Rückhaltesystems?", antworten:["Den Sturz auffangen und bremsen","Den Bewegungsbereich begrenzen, sodass die Absturzkante nicht erreicht wird","Die Fallenergie durch einen Dämpfer absorbieren","Den Anwender am Anschlagpunkt fixieren"], richtig:1},
    {frage:"Welches Prinzip beschreibt die Wirkungsweise eines Rückhaltesystems?", antworten:["Das Bremsprinzip","Das Dämpfungsprinzip","Das 'Anlein-Prinzip'","Das Auffangprinzip"], richtig:2},
    {frage:"An welcher Stelle in der Schutzmaßnahmenhierarchie steht die Prävention?", antworten:["An letzter Stelle","An zweiter Stelle nach kollektiven Maßnahmen","An erster Stelle – Gefahr zuerst vermeiden","Gleichrangig mit kollektiven Maßnahmen"], richtig:2},
    {frage:"Welche Norm regelt den Auffanggurt als Körperhaltevorrichtung im Rückhaltesystem?", antworten:["DIN EN 362","DIN EN 354","DIN EN 361","DIN EN 795"], richtig:2},
    {frage:"Was unterscheidet ein Rückhaltesystem grundlegend von einem Auffangsystem?", antworten:["Das Rückhaltesystem ist günstiger","Das Rückhaltesystem verhindert den Fall, das Auffangsystem fängt ihn auf","Das Auffangsystem ist wartungsfreier","Das Rückhaltesystem braucht keinen Anschlagpunkt"], richtig:1}
  ],
  'psaga-04-arbeitsplatzpositionierung': [
    {frage:"Was ermöglicht die Arbeitsplatzpositionierung beim Arbeiten in der Höhe?", antworten:["Freies Hängen ohne Gurt","Freihändiges Arbeiten durch sicheres Hineinlehnen in das Halteseil","Auffangen nach einem Sturz","Den Abstieg ohne Seil"], richtig:1},
    {frage:"Welcher Gurt wird typischerweise für die Arbeitsplatzpositionierung eingesetzt?", antworten:["Sitzgurt nach DIN EN 813","Auffanggurt nach DIN EN 361","Haltegurt nach DIN EN 358 mit seitlichen Halteösen","Klettersteigset nach DIN EN 958"], richtig:2},
    {frage:"Warum reduziert die Arbeitsplatzpositionierung das Sturzrisiko?", antworten:["Weil kein Anschlagpunkt benötigt wird","Weil beide Hände frei sind und eine kontrollierte stabile Körperhaltung entsteht","Weil der Gurt den Fall automatisch auffängt","Weil kein Halteseil erforderlich ist"], richtig:1},
    {frage:"Was muss bei einem Positionierungssystem zwingend vorhanden sein?", antworten:["Ein separates Auffangsystem als Zweitsicherung","Ein Höhensicherungsgerät","Ein Falldämpfer im Halteseil","Ein Schraubkarabiner"], richtig:0},
    {frage:"Wie entsteht die stabile Arbeitsposition beim Positionierungssystem?", antworten:["Durch Abstützen an der Wand","Durch bewusstes Hineinlehnen in das straffe Halteseil","Durch Fixierung beider Füße","Durch Verwendung eines Sitzbretts"], richtig:1}
  ],
  'psaga-05-auffangsysteme': [
    {frage:"Was ist die Hauptaufgabe eines Auffangsystems nach DIN EN 363?", antworten:["Den Anwender am Absturz hindern","Den freien Fall begrenzen und die Person nach dem Auffangen sicher halten","Den Anwender am Anschlagpunkt fixieren","Die Fallenergie vollständig absorbieren"], richtig:1},
    {frage:"Was versteht man unter 'Fangstoß'?", antworten:["Die Haltekraft des Karabiners","Die auf den Körper wirkende Kraft beim Auffangen des Sturzes","Die Zugfestigkeit des Seils","Die Belastung des Anschlagpunktes"], richtig:1},
    {frage:"Welche drei Kernfunktionen erfüllt ein wirksames Auffangsystem?", antworten:["Stoppen, Dämpfen, Halten","Bremsen, Auffangen, Retten","Fixieren, Dämpfen, Melden","Stoppen, Warnen, Fixieren"], richtig:0},
    {frage:"Welche Körperhaltevorrichtung ist zentraler Bestandteil eines Auffangsystems?", antworten:["Haltegurt nach DIN EN 358","Auffanggurt nach DIN EN 361","Sitzgurt nach DIN EN 813","Brustgurt nach DIN EN 12277"], richtig:1},
    {frage:"Wann kommt ein Auffangsystem zum Einsatz?", antworten:["Wenn kollektive Schutzmaßnahmen ausreichen","Wenn ein Absturz nicht verhindert werden kann und aufgefangen werden muss","Nur bei Dacharbeiten über 5 Meter","Immer als erste Maßnahme vor anderen Schutzmaßnahmen"], richtig:1}
  ],
  'psaga-06-auffanggurte': [
    {frage:"Welche Norm regelt den Auffanggurt?", antworten:["DIN EN 358","DIN EN 354","DIN EN 361","DIN EN 795"], richtig:2},
    {frage:"Wohin leitet ein korrekt angelegter Auffanggurt die Fangkräfte ab?", antworten:["In die Schultern und den Rücken","In die Wirbelsäule","In tragfähige Körperteile wie Becken und Oberschenkel","In die Arme und den Brustkorb"], richtig:2},
    {frage:"Welches Material wird für tragende Gurtbänder nach DIN EN 361 verwendet?", antworten:["Nylon und Baumwolle","Hochfestes Polyester oder Polyamid (mind. 40mm Breite)","Carbon und Kevlar","Leder und Stahl"], richtig:1},
    {frage:"Was sind die drei Kernanforderungen an einen Auffanggurt?", antworten:["Leicht, günstig, wartungsfrei","Sicherer Halt, Lastverteilung, Stabilität nach dem Auffangen","Komfort, Mobilität, Langlebigkeit","Waschbar, UV-beständig, chemikalienresistent"], richtig:1},
    {frage:"Was ist beim Anlegen eines Auffanggurts zwingend zu beachten?", antworten:["Der Gurt muss möglichst locker sitzen für Komfort","Der Gurt muss korrekt und körpergerecht angelegt sein – zu locker oder falsch kann beim Auffangen gefährlich sein","Der Dorsal-Anschlagpunkt muss vorne sein","Brustgurt und Beinschlaufen sind optional"], richtig:1}
  ],
  'psaga-07-verbindungskomponenten': [
    {frage:"Welche Norm regelt Karabiner als Verbindungselement?", antworten:["DIN EN 795","DIN EN 362","DIN EN 354","DIN EN 361"], richtig:1},
    {frage:"Was ist die Aufgabe eines Falldämpfers im PSAgA-System?", antworten:["Den Anschlagpunkt zu sichern","Die Zugkraft auf den Gurt zu erhöhen","Die Sturzenergie zu absorbieren und den Fangstoß auf den Körper zu begrenzen","Das Seil vor Kanten zu schützen"], richtig:2},
    {frage:"Was beschreibt das Prinzip 'Sicherungskette'?", antworten:["Eine Kette aus Stahlgliedern als Verbindungsmittel","Alle Systemteile sind nur so sicher wie das schwächste Glied – jedes Bauteil muss funktionieren","Die Reihenfolge der Prüfungen","Die Verbindung mehrerer Anwender"], richtig:1},
    {frage:"Was muss bei einem Schraubverschlusskarabiner nach dem Einhängen zwingend erfolgen?", antworten:["Er schließt automatisch","Manuelles vollständiges Verschrauben der Hülse","Anbringen einer Sicherungslasche","Prüfung mit einem Prüfwerkzeug"], richtig:1},
    {frage:"Welche drei Bauteilgruppen sind typische Verbindungskomponenten im PSAgA-System?", antworten:["Gurt, Helm, Schuhe","Karabiner, Verbindungsmittel (Seile/Bänder), Falldämpfer","Anschlagpunkt, Dreibein, Winde","Schrauben, Bolzen, Nieten"], richtig:1}
  ],
  'psaga-08-hoehensicherungsgeraete': [
    {frage:"Wie funktioniert der Sperrmechanismus eines Höhensicherungsgeräts?", antworten:["Durch manuelles Festziehen","Durch eine Fliehkraftbremse, die bei schnellem Auszug blockiert","Durch eine Schraube die sich bei Zug festzieht","Durch einen Gummidämpfer"], richtig:1},
    {frage:"Welcher Vorteil bietet ein HSG gegenüber herkömmlichen Verbindungsmitteln?", antworten:["Es ist günstiger in der Anschaffung","Es minimiert die Fallstrecke durch frühzeitiges Blockieren","Es braucht keinen Anschlagpunkt","Es kann unter Wasser eingesetzt werden"], richtig:1},
    {frage:"Was hält das Verbindungsmittel eines HSG stets straff?", antworten:["Schwerkraft","Eine interne Federkraft (Einzugmechanik)","Der Anwender selbst","Ein Elektromotor"], richtig:1},
    {frage:"Was ist bei einem HSG nach einem Sturzereignis zu tun?", antworten:["Weiter benutzen wenn keine Schäden sichtbar sind","Nur Seilende prüfen","HSG sofort außer Betrieb nehmen und zur Herstellerinspektion einschicken","Seil ersetzen und weiternutzen"], richtig:2},
    {frage:"Wofür steht die Abkürzung HSG?", antworten:["Hauptsicherungsgerät","Höhensicherungsgerät","Hochsicherheitsgurt","Hakenstahlgestell"], richtig:1}
  ],
  'psaga-09-steigschutzsysteme': [
    {frage:"Welche Norm regelt mitlaufende Auffanggeräte an fester Führung?", antworten:["DIN EN 353-2","DIN EN 361","DIN EN 353-1","DIN EN 795"], richtig:2},
    {frage:"Was ist die 'feste Führung' bei Steigschutzleitern?", antworten:["Ein Sicherheitsseil das der Anwender selbst spannt","Eine dauerhaft mit der Leiter verbundene Schiene oder ein Drahtseil","Ein mobiles Dreibeinstativ","Ein Gurt der an der Leiter befestigt wird"], richtig:1},
    {frage:"Was tut der 'Läufer' im Steigschutzsystem beim Auf- und Abstieg?", antworten:["Er bleibt am untersten Punkt fixiert","Er begleitet die Person und blockiert selbsttätig im Sturzfall","Er wird vor dem Aufstieg oben eingehängt","Er bremst die Person beim normalen Abstieg"], richtig:1},
    {frage:"Wofür werden Steigschutzsysteme mit fester Führung eingesetzt?", antworten:["Für Horizontalarbeiten auf dem Dach","Für den Schutz beim Auf- und Abstieg an dauerhaft installierten Leitern (z.B. Masten, Türme)","Für Arbeitsplatzpositionierung","Für Dachneigungen unter 30°"], richtig:1},
    {frage:"Welchen Vorteil bieten Zwischenhalter bei der festen Führung?", antworten:["Kosteneinsparung","Begrenzung des Pendelschlags und Übertragung der Last in die Struktur","Ermöglichung von Horizontalbewegungen","Vereinfachung der Prüfung"], richtig:1}
  ],
  'psaga-10-auffanggeraete': [
    {frage:"Welche Norm regelt mitlaufende Auffanggeräte an beweglicher Führung?", antworten:["DIN EN 353-1","DIN EN 795","DIN EN 353-2","DIN EN 363"], richtig:2},
    {frage:"Was ist der wesentliche Unterschied zwischen fester und beweglicher Führung?", antworten:["Bewegliche Führung ist billiger","Bewegliche Führung ist temporär/mobil, feste Führung ist permanent installiert","Feste Führung ist für alle Bereiche geeignet","Bewegliche Führung blockiert schneller"], richtig:1},
    {frage:"Was verhindert Endsicherungen an der beweglichen Ankerleine?", antworten:["Das Verrutschen des Läufers","Das unbeabsichtigte Abrutschen des Läufers vom Seilende","Das Verknoten des Seils","Das Einfrieren des Seils"], richtig:1},
    {frage:"Welches Material wird bevorzugt für bewegliche Ankerleinen verwendet?", antworten:["Hanfseil","Kernmantelseile aus Chemiefaser oder Drahtseil","Gummiband","Stahlkette"], richtig:1},
    {frage:"Woran ist vor jedem Einsatz die Ankerleine zu prüfen?", antworten:["An der Farbe","Auf Reißfestigkeit mittels Lasttest","Auf Abrieb, Schäden, korrekten Sitz und ausreichende Befestigung am Anschlagpunkt","Nur auf die Länge"], richtig:2}
  ],
  'psaga-11-anschlageinrichtungen': [
    {frage:"Welche Norm regelt Anschlageinrichtungen für PSAgA?", antworten:["DIN EN 361","DIN EN 354","DIN EN 795","DIN EN 362"], richtig:2},
    {frage:"Was kennzeichnet einen Anschlagpunkt des Typs B nach DIN EN 795?", antworten:["Permanent am Bauwerk befestigt","Transportabel und wiederentfernbar (z.B. Trägerklemmen, Dreibeine)","Ein horizontales Schienensystem","Ein Einpunktsystem aus Stahl"], richtig:1},
    {frage:"Warum reicht eine Normkennzeichnung allein nicht für einen sicheren Anschlagpunkt?", antworten:["Weil Normen nicht verbindlich sind","Weil Planung, Untergrundnachweis, Montage und regelmäßige Prüfung ebenso entscheidend sind","Weil nur die Tragfähigkeit zählt","Weil die Norm nur für Stahl gilt"], richtig:1},
    {frage:"Was sind permanente Anschlageinrichtungen (Typ A, C, D)?", antworten:["Mobile Systeme für temporären Einsatz","Dauerhaft am Objekt verbleibende Systeme die statische Nachweise erfordern","Tragbare Einpunktsysteme","Systeme nur für Dacharbeiten"], richtig:1},
    {frage:"Was ist bei horizontalen Schienensystemen (Typ C) zu beachten?", antworten:["Sie sind für Vertikalbewegungen gedacht","Sie erlauben laterale Bewegungen und müssen an Endpunkten verankert sein","Sie erfordern keinen statischen Nachweis","Sie sind nur für eine Person geeignet"], richtig:1}
  ],
  'psaga-12-tragfaehigkeit-untergrund': [
    {frage:"Welche Mindest-Tragkraft muss ein Anschlagpunkt nach DIN EN 795 für eine Person (statisch) aufweisen?", antworten:["2 kN","4 kN","6 kN","10 kN"], richtig:2},
    {frage:"Was ist bei Stahlbeton als Untergrund für Anschlageinrichtungen kritisch zu prüfen?", antworten:["Nur die Betonoberfläche","Randabstände, Bewehrungslage und Mindestfestigkeitsklasse C20/25","Allein die Betondicke","Die Farbe des Betons"], richtig:1},
    {frage:"Warum ist die '6 kN-Regel' als allgemeine Vorgabe missverständlich?", antworten:["Weil 6 kN zu hoch ist","Weil im Sturzfall deutlich höhere dynamische Kräfte entstehen können und die tatsächliche Last von vielen Faktoren abhängt","Weil sie nur für Holz gilt","Weil sie veraltet ist"], richtig:1},
    {frage:"Was bedeutet 'dynamische Lastspitze' im Zusammenhang mit Anschlagpunkten?", antworten:["Die statische Dauerlast","Die kurzzeitig sehr hohe Kraft die beim Auffangen eines Sturzes entsteht","Das Eigengewicht des Anwenders","Die Windlast auf das System"], richtig:1},
    {frage:"Wer darf die Planung und Montage von permanenten Anschlageinrichtungen durchführen?", antworten:["Jeder Handwerker","Nur zertifizierte Fachfirmen nach Statiknachweis","Der Arbeitgeber selbst","Nur der Hersteller der PSAgA"], richtig:1}
  ],
  'psaga-13-check-vor-gebrauch': [
    {frage:"Was ist der Zweck der Prüfung vor Gebrauch (Pre-Use Check)?", antworten:["Den jährlichen Sachkundigencheck zu ersetzen","Erkennbare Schäden und Funktionsmängel vor dem Einsatz zu entdecken – nicht die technische Jahresprüfung","Nur die Länge des Seils zu kontrollieren","Die PSAgA für den nächsten Anwender vorzubereiten"], richtig:1},
    {frage:"Welche Rechtsgrundlage verpflichtet den Anwender zur Prüfung vor Gebrauch?", antworten:["Nur Herstellerhinweise","DGUV Regel 112-198 und § 15 ArbSchG","DIN EN 361","ISO 9001"], richtig:1},
    {frage:"Was umfasst die 'Sichtprüfung' beim Pre-Use Check?", antworten:["Nur Karabiner und Ösen","Gurtbänder, Seile, Nähte, Metallteile und Gehäuse auf Risse, Abrieb, Verformung, Korrosion","Nur das Etikett auf Datum","Die Gebrauchsanleitung lesen"], richtig:1},
    {frage:"Was gehört zur 'Funktionsprüfung' bei der Vorkontrolle?", antworten:["Wiegen der Ausrüstung","Testen von Schnallen, Karabinerverschlüssen und Mechaniken der Verbindungsmittel","Messen der Seillänge","Dokumentation in einem Prüfbuch"], richtig:1},
    {frage:"Was tut man ZUERST bei der täglichen Routine vor der Arbeit in der Höhe?", antworten:["PSAgA anlegen und sofort aufsteigen","Aufgabe, Anschlagmöglichkeiten, Wetter, Kanten, Fallraum und Rettungsplan prüfen – BEVOR Ausrüstung angelegt wird","Kollegen informieren","Jahresprotokoll kontrollieren"], richtig:1}
  ],
  'psaga-14-kantenproblematik': [
    {frage:"Welcher Kantenradius gilt im Arbeitsschutz als 'scharf'?", antworten:["Weniger als 5 mm","Weniger als 2 mm","Weniger als 0,5 mm","Weniger als 0,1 mm"], richtig:2},
    {frage:"Welche zwei physikalischen Schädigungsmechanismen entstehen an einer Kante?", antworten:["Dehnung und Kompression","Schnittgefahr (direkte Durchtrennung) und Reibungswärme (Schmelzen der Fasern)","Korrosion und UV-Abbau","Verdrillung und Knotenbildung"], richtig:1},
    {frage:"Welche Materialien sind besonders gefährlich für textile PSAgA?", antworten:["Holz und Kunststoff","Beton, Stahl und Glaskanten","Gummi und Schaumstoff","Textile Oberflächen"], richtig:1},
    {frage:"Welche Maßnahme schützt Seile und Verbindungsmittel an scharfen Kanten?", antworten:["Nass machen des Seils","Verwendung von Kantenschutz, Kantenschutzrollen oder speziell kantentauglichen Verbindungsmitteln","Schneller Zug über die Kante","Verwenden älterer Seile"], richtig:1},
    {frage:"Warum darf eine PSAgA nach Kantenberührung unter Last keinesfalls weiterbenutzt werden?", antworten:["Sie muss nur gereinigt werden","Faserschäden sind oft unsichtbar aber die Tragfähigkeit kann massiv reduziert sein","Nur äußere Risse sind relevant","Beschädigungen heilen sich beim nächsten Einsatz aus"], richtig:1}
  ],
  'psaga-15-lagerung-werterhalt': [
    {frage:"Was sind die drei Hauptfeinde bei der Lagerung von PSAgA?", antworten:["Feuchtigkeit, Kälte, Erschütterung","Licht (UV), Hitze, Chemikalien","Staub, Druck, Licht","Temperaturschwankung, Lagerzeit, Feuchtigkeit"], richtig:1},
    {frage:"Welche Wirkung hat UV-Strahlung auf textile PSAgA?", antworten:["Sie verbessert die Flexibilität","Sie baut Polymerketten ab, macht Fasern brüchig und reduziert die Tragfähigkeit","Sie sterilisiert die Ausrüstung","Sie hat keine Wirkung auf Polyester"], richtig:1},
    {frage:"Ab welcher Temperatur können physikalische Eigenschaften von Gurtbändern dauerhaft verändert werden?", antworten:["Ab 30°C","Ab 60°C","Ab 100°C","Ab 200°C"], richtig:1},
    {frage:"Was ist beim Lagern von PSAgA in der Nähe von Chemikalien zu beachten?", antworten:["Chemikalien verbessern die Haltbarkeit","Säuren, Laugen und Lösungsmittel können PSAgA unsichtbar schädigen – getrennte Lagerung ist Pflicht","Nur bei direktem Kontakt besteht Gefahr","Chemikalien sind nur für Metallteile schädlich"], richtig:1},
    {frage:"Wie ist PSAgA korrekt zu lagern?", antworten:["Auf dem Boden gefaltet unter direktem Sonnenlicht","Trocken, dunkel, kühl, gut durchlüftet und getrennt von Chemikalien – idealerweise aufgehängt","Zusammen mit Reinigungsmitteln","In luftdichten Plastikbeuteln bei hoher Temperatur"], richtig:1}
  ],
  'psaga-16-reinigung-materialpflege': [
    {frage:"Welche maximale Temperatur gilt für die Wäsche textiler PSAgA?", antworten:["60°C","40°C","30°C (bzw. lt. Herstellerangaben)","20°C"], richtig:2},
    {frage:"Wie wirkt Schmutz (Sand, Staub) auf PSAgA-Fasern?", antworten:["Er schützt vor UV-Strahlung","Er wirkt wie winzige Messer zwischen den Fasern und schädigt diese bei Bewegung (innere Abrasion)","Er ist harmlos","Er erhöht die Griffigkeit"], richtig:1},
    {frage:"Was ist bei Reinigungsmitteln für PSAgA zu beachten?", antworten:["Je aggressiver desto besser","Nur milde, pH-neutrale Mittel verwenden – aggressive Chemikalien können Fasern und Beschichtungen schädigen","Bleichmittel sind geeignet für helle Gurte","Reinigungsmittel sind egal wenn man danach spült"], richtig:1},
    {frage:"Wie muss PSAgA nach der Reinigung getrocknet werden?", antworten:["Im Wäschetrockner bei hoher Temperatur","An der Luft bei Raumtemperatur, nicht in direktem Sonnenlicht","Mit einem Heißluftgebläse","Direkt über einer Heizung"], richtig:1},
    {frage:"Wann muss PSAgA trotz optisch gutem Zustand außer Betrieb genommen werden?", antworten:["Nur wenn sie zerrissen ist","Nach Einwirkung unbekannter Chemikalien oder nach einem Sturzereignis – auch wenn keine sichtbaren Schäden erkennbar sind","Erst nach 20 Jahren","Wenn sie unangenehm riecht"], richtig:1}
  ],
  'psaga-17-ablegereife-lebensdauer': [
    {frage:"Welche Norm / Regel regelt die Ablegereife von PSAgA?", antworten:["DIN EN 361","DGUV Regel 112-198 und Herstellerangaben","ISO 9001","DIN EN 795"], richtig:1},
    {frage:"Welche maximale Einsatzdauer gilt als Faustregel für textile PSAgA-Komponenten?", antworten:["5 Jahre ab Inbetriebnahme","10 Jahre ab Herstellungsdatum (je nach Herstellerangabe)","20 Jahre","Keine Begrenzung wenn regelmäßig geprüft"], richtig:1},
    {frage:"Was führt zur sofortigen Ablegereife unabhängig von Alter oder Zustand?", antworten:["Eine optisch sichtbare Verschmutzung","Ein Sturzereignis oder extreme chemische Einflüsse","Das Erreichen von 5 Einsatzjahren","Ein verblasstes Etikett"], richtig:1},
    {frage:"Warum reicht eine alleinige Zeitgrenze (z.B. 10 Jahre) nicht aus?", antworten:["Weil Zeitgrenzen gesetzlich nicht existieren","Weil Nutzungsintensität, Lagerung und Ereignisse die Ablegereife schon früher auslösen können","Weil nur der Hersteller entscheiden darf","Weil 10 Jahre immer ausreicht"], richtig:1},
    {frage:"Was ist beim Ausmustern von PSAgA zu tun?", antworten:["Sie reparieren und wieder einsetzen","Sie kennzeichnen und vernichten – sie darf nicht anderweitig eingesetzt werden","Im Lager behalten als Reserve","Einem anderen Mitarbeiter geben"], richtig:1}
  ],
  'psaga-18-pruefpflicht-sachkundigenpruefung': [
    {frage:"Wie häufig muss PSAgA nach DGUV Regel 112-198 durch einen Sachkundigen geprüft werden?", antworten:["Alle 2 Jahre","Alle 6 Monate","Mindestens alle 12 Monate","Nur bei sichtbaren Schäden"], richtig:2},
    {frage:"Was kann kürzere Prüfintervalle als 12 Monate erforderlich machen?", antworten:["Neue Ausrüstung","Extreme Beanspruchung durch Chemie, Hitze, Gase oder Staubentwicklung","Wechselnde Anwender","Lagerung im Freien"], richtig:1},
    {frage:"Wer darf die wiederkehrende Sachkundigenprüfung von PSAgA durchführen?", antworten:["Jeder Arbeitnehmer","Eine vom Arbeitgeber beauftragte Sachkundige Person mit nachgewiesener Qualifikation","Der Hersteller der PSAgA ausschließlich","Jeder Vorgesetzte"], richtig:1},
    {frage:"Was ermöglicht die lückenlose Dokumentation der Sachkundigenprüfung?", antworten:["Nichts – sie ist nur eine Formalie","Haftungsschutz für den Unternehmer und Nachweis der ordnungsgemäßen Überprüfung","Kostenersparnis","Verlängerung der Prüfintervalle"], richtig:1},
    {frage:"Was ist bei PSAgA nach einem Sturzereignis bezüglich der Prüfung zu tun?", antworten:["Weiterverwenden wenn das nächste Prüfjahr noch nicht erreicht ist","Sofort außer Betrieb nehmen und zur Überprüfung durch einen Sachkundigen einschicken – unabhängig vom regulären Intervall","Nur die Karabiner prüfen","Normales Prüfintervall abwarten"], richtig:1}
  ],
  'psaga-19-rettungskonzept': [
    {frage:"Wann muss ein Rettungskonzept für PSAgA-Einsätze vorhanden sein?", antworten:["Nur bei Arbeiten über 10 Meter Höhe","Vor jeder Arbeit mit PSAgA – das Konzept muss vor dem Aufstieg existieren","Nur bei mehr als 5 Arbeitern","Erst nach einem Unfall"], richtig:1},
    {frage:"Welche gesetzliche Grundlage verpflichtet den Arbeitgeber zur Rettungsplanung?", antworten:["Nur die DGUV Regel 112-198","§ 10 ArbSchG (Erste Hilfe, Brandbekämpfung, Evakuierung) und DGUV R 112-199","Nur die Betriebsvereinbarung","DIN EN 361"], richtig:1},
    {frage:"Was droht einer im Gurt hängenden Person wenn sie nicht schnell gerettet wird?", antworten:["Nur Erschöpfung","Hängetrauma (orthostatischer Schock) durch mangelnden Blutrückstrom","Überhitzung","Sehverlust"], richtig:1},
    {frage:"Was ist beim Retten einer hängenden Person IMMER zuerst zu tun?", antworten:["Sofort klettern ohne Sicherung","Notruf 112 absetzen und eigene Sicherung herstellen – Eigenschutz hat Vorrang","Die Person schütteln","Auf den Einsatzleiter warten"], richtig:1},
    {frage:"Welche Aussage zum Rettungskonzept ist korrekt?", antworten:["Improvisation ist für Experten akzeptabel","Das Rettungskonzept muss allen Beteiligten bekannt sein und Mittel sowie Verantwortlichkeiten benennen","Ein Konzept ist nur für Hochhäuser nötig","Feuerwehr ist immer schnell genug – kein eigenes Konzept nötig"], richtig:1}
  ],
  'psaga-20-haengetrauma': [
    {frage:"Was ist ein Hängetrauma?", antworten:["Ein Knochenbruch durch den Sturz","Ein orthostatischer Schock durch regungsloses Hängen im Gurt mit Einschränkung des Blutkreislaufs","Eine psychische Reaktion nach dem Sturz","Eine Verletzung durch den Gurt selbst"], richtig:1},
    {frage:"Warum ist regungsloses Hängen im Gurt gefährlich?", antworten:["Der Gurt schnürt den Bauch ein","Die Beinmuskelpumpe fällt aus – Blut versackt in den Beinen, das Herz bekommt zu wenig zurück","Der Gurt dreht sich und verursacht Schwindel","Der Anwender kann nicht atmen"], richtig:1},
    {frage:"Nach wie vielen Minuten regungslosen Hängens kann es zu lebensbedrohlichen Situationen kommen?", antworten:["Erst nach 2 Stunden","Nach 30 bis 60 Minuten","Bereits nach ca. 5 bis 20 Minuten (individuell unterschiedlich)","Nie, wenn man weiter atmet"], richtig:2},
    {frage:"Was müssen hängende Personen tun um das Hängetrauma zu verzögern?", antworten:["Stillhalten und auf Rettung warten","Sich so weit möglich bewegen – Beine anwinkeln, Pedalieren – um die Muskelpumpe aktiv zu halten","Schreien","Den Gurt lockern"], richtig:1},
    {frage:"Wie ist eine gerettete Person nach Hängetrauma-Verdacht NICHT zu lagern?", antworten:["Stabil sitzend oder leicht angewinkelt","Flach auf dem Rücken mit hochgelagerten Beinen – dies kann den Zustand verschlechtern","Sitzend mit angewinkelten Knien","In der stabilen Seitenlage wenn bewusstlos"], richtig:1}
  ],
  'psaga-21-erste-hilfe-nach-sturz': [
    {frage:"Was ist nach einem aufgefangenen Sturz sofort zu tun?", antworten:["Abwarten ob der Gestürzte von selbst aufsteht","Notruf 112 absetzen, Eigenschutz sichern, Person schnellstmöglich aus der Hängeposition retten","PSAgA auf Schäden prüfen","Sturz protokollieren"], richtig:1},
    {frage:"Warum hat Eigenschutz bei der Rettung absolute Priorität?", antworten:["Damit man keine Haftung übernimmt","Ein zweiter Unfall nützt niemanden – ungesicherter Ersthelfer gefährdet sich selbst und kann nicht helfen","Weil es so vorgeschrieben ist","Um die Versicherung nicht zu gefährden"], richtig:1},
    {frage:"Welche Informationen sind beim Notruf (112) zu einem Sturz-Unfall besonders wichtig?", antworten:["Nur Name und Firma","Ort, Art des Unfalls, 'Sturz in den Gurt / Hängetrauma-Gefahr' und Anzahl der Verletzten","Nur Telefonnummer","Versicherungsnummer"], richtig:1},
    {frage:"Wie ist eine bewusstlose Person nach der Rettung aus dem Gurt zu lagern?", antworten:["Auf dem Bauch","Stehend abgestützt","In der stabilen Seitenlage","Flach auf dem Rücken mit hochgelegten Beinen"], richtig:2},
    {frage:"Wie lange darf eine gerettete Person nach Sturz ohne medizinische Untersuchung sein?", antworten:["48 Stunden","Bis zum nächsten Werktag","Gar nicht – jede gestürzte Person muss umgehend medizinisch untersucht werden","Bis Symptome auftreten"], richtig:2}
  ]
};

// ── Quiz-Status ───────────────────────────────────────────────────────────────
let psagaQuizIndex  = 0;
let psagaQuizFehler = 0;
let psagaQuizRichtig = [];
let psagaQuizModulId = null;

const PSAGA_MODULE = [
  {
    id:        'psaga-00-einleitung',
    titel:     'PSAgA Schulung – Einleitung',
    untertitel:'Modul 00 — Überblick & Lernziele',
    folien:    12,
    pfad:      '00-psaga-schulung-einleitung',
    icon:      '📖',
    hasAudio:  true
  },
  {
    id:        'psaga-01-rechtliche-grundlagen',
    titel:     'PSAgA Schulung nach DGUV 112-198',
    untertitel:'Modul 01 — Rechtliche Grundlagen & PSA-Pflichten',
    folien:    21,
    pfad:      '01-psaga-01-rechtliche-grundlagen',
    icon:      '⚖️',
    hasAudio:  true
  },
  {
    id:        'psaga-02-gefaehrdungsbeurteilung',
    titel:     'Gefährdungsbeurteilung & STOP-Prinzip',
    untertitel:'Modul 02 — Strategische Sicherheit bei Arbeiten in der Höhe',
    folien:    10,
    pfad:      '02-psaga-02-gefaehrdungsbeurteilung',
    icon:      '🔎',
    hasAudio:  true
  },
  { id:'psaga-03-rueckhaltesysteme', titel:'Rückhaltesysteme', untertitel:'Modul 03 — Absturzprävention durch Bewegungsbegrenzung', folien:11, pfad:'03-psaga-03-rueckhaltesysteme', icon:'🔗', hasAudio:true },
  { id:'psaga-04-arbeitsplatzpositionierung', titel:'Arbeitsplatzpositionierung', untertitel:'Modul 04 — Stabiler Halt und ergonomisches Arbeiten', folien:11, pfad:'04-psaga-04-arbeitsplatzpositionierung', icon:'🧰', hasAudio:true },
  { id:'psaga-05-auffangsysteme', titel:'Auffangsysteme', untertitel:'Modul 05 — Den freien Fall sicher stoppen', folien:10, pfad:'05-psaga-05-auffangsysteme', icon:'🛡️', hasAudio:true },
  { id:'psaga-06-auffanggurte', titel:'Auffanggurte', untertitel:'Modul 06 — Aufbau und Funktion nach DIN EN 361', folien:11, pfad:'06-psaga-06-auffanggurte', icon:'🦺', hasAudio:true },
  { id:'psaga-07-verbindungskomponenten', titel:'Verbindungskomponenten', untertitel:'Modul 07 — Karabiner, Falldämpfer und Verbindungsmittel', folien:11, pfad:'07-psaga-07-verbindungskomponenten', icon:'🔩', hasAudio:true },
  { id:'psaga-08-hoehensicherungsgeraete', titel:'Höhensicherungsgeräte', untertitel:'Modul 08 — Selbsttätig einziehende Auffanggeräte', folien:10, pfad:'08-psaga-08-hoehensicherungsgeraete', icon:'↕️', hasAudio:true },
  { id:'psaga-09-steigschutzsysteme', titel:'Steigschutzsysteme', untertitel:'Modul 09 — Mitlaufende Auffanggeräte an fester Führung', folien:10, pfad:'09-psaga-09-steigschutzsysteme', icon:'🪜', hasAudio:true },
  { id:'psaga-10-auffanggeraete', titel:'Auffanggeräte – bewegliche Führung', untertitel:'Modul 10 — Mitlaufende Auffanggeräte nach DIN EN 353-2', folien:10, pfad:'10-psaga-10-auffanggeraete', icon:'🎣', hasAudio:true },
  { id:'psaga-11-anschlageinrichtungen', titel:'Anschlageinrichtungen', untertitel:'Modul 11 — Typen nach DIN EN 795', folien:11, pfad:'11-psaga-11-anschlageinrichtungen', icon:'⚓', hasAudio:true },
  { id:'psaga-12-tragfaehigkeit-untergrund', titel:'Tragfähigkeit & Untergrund', untertitel:'Modul 12 — Statik, Befestigung und Materialgüte', folien:11, pfad:'12-psaga-12-tragfaehigkeit-untergrund', icon:'🏗️', hasAudio:true },
  { id:'psaga-13-check-vor-gebrauch', titel:'Check vor Gebrauch', untertitel:'Modul 13 — Sicht- und Funktionsprüfung durch den Anwender', folien:11, pfad:'13-psaga-13-check-vor-gebrauch', icon:'🔍', hasAudio:true },
  { id:'psaga-14-kantenproblematik', titel:'Kantenproblematik', untertitel:'Modul 14 — Warum scharfe Kanten für PSAgA lebensgefährlich sind', folien:11, pfad:'14-psaga-14-kantenproblematik', icon:'⚠️', hasAudio:true },
  { id:'psaga-15-lagerung-werterhalt', titel:'Lagerung & Werterhalt', untertitel:'Modul 15 — Schutz vor Licht, Hitze und Chemie', folien:11, pfad:'15-psaga-15-lagerung-werterhalt', icon:'📦', hasAudio:true },
  { id:'psaga-16-reinigung-materialpflege', titel:'Reinigung & Materialpflege', untertitel:'Modul 16 — Werterhalt und Sicherheit durch korrekte Pflege', folien:11, pfad:'16-psaga-16-reinigung-materialpflege', icon:'🧹', hasAudio:true },
  { id:'psaga-17-ablegereife-lebensdauer', titel:'Ablegereife & Lebensdauer', untertitel:'Modul 17 — Wann muss PSAgA ausgemustert werden?', folien:11, pfad:'17-psaga-17-ablegereife-lebensdauer', icon:'⏱️', hasAudio:true },
  { id:'psaga-18-pruefpflicht-sachkundigenpruefung', titel:'Prüfpflicht & Sachkundigenprüfung', untertitel:'Modul 18 — Gesetzliche Anforderungen nach DGUV 112-198', folien:11, pfad:'18-psaga-18-pruefpflicht-sachkundigenpruefung', icon:'📋', hasAudio:true },
  { id:'psaga-19-rettungskonzept', titel:'Rettungskonzept', untertitel:'Modul 19 — Planung und zeitkritische Intervention', folien:11, pfad:'19-psaga-19-rettungskonzept', icon:'🚑', hasAudio:true },
  { id:'psaga-20-haengetrauma', titel:'Hängetrauma', untertitel:'Modul 20 — Orthostatischer Schock: Erkennung und Prävention', folien:11, pfad:'20-psaga-20-haengetrauma', icon:'🏥', hasAudio:true },
  { id:'psaga-21-erste-hilfe-nach-sturz', titel:'Erste Hilfe nach Sturz', untertitel:'Modul 21 — Fachgerechte Maßnahmen nach einem Sturz', folien:11, pfad:'21-psaga-21-erste-hilfe-nach-sturz', icon:'🆘', hasAudio:true }
];

let psagaAktivesModul   = null;
let psagaAktuelleFolie  = 1;

function psagaFolienUrl(modul, nr) {
  const pad = String(nr).padStart(2, '0');
  return `${PSAGA_SUPABASE_URL}/storage/v1/object/public/${PSAGA_BUCKET}/${modul.pfad}/folie-${pad}.png`;
}

// PSAgA-Button anzeigen (für Mitarbeiter und Verantwortliche)
function psagaSchulungenInit() {
  const wrap = document.getElementById('psaga-schulungen-btn-wrap');
  if (!wrap) return;
  if (currentUser && (currentUser.role === 'mitarbeiter' || currentUser.role === 'verantwortlicher')) {
    wrap.style.display = '';
    const sub = document.getElementById('btn-psaga-sub');
    if (sub) sub.textContent = `${PSAGA_MODULE.length} Modul${PSAGA_MODULE.length !== 1 ? 'e' : ''} verfügbar`;
  }
}

function psagaSchulungenToggle() {
  const cont  = document.getElementById('psaga-schulungen-container');
  const pfeil = document.getElementById('btn-psaga-pfeil');
  if (!cont) return;
  const open = cont.style.display === 'block';
  cont.style.display = open ? 'none' : 'block';
  if (pfeil) pfeil.style.transform = open ? '' : 'rotate(180deg)';
  if (!open) psagaSchulungenRender();
}

async function psagaSchulungenRender() {
  const cont = document.getElementById('psaga-schulungen-container');
  if (!cont) return;

  const userId = currentUser?.userId || '';

  // Supabase-Fortschritt nachladen falls localStorage leer
  try {
    const sbFortschritt = await SB.get('psaga_zuweisung', 
      `user_id=eq.${encodeURIComponent(userId)}&bestanden=eq.true`);
    if (sbFortschritt && sbFortschritt.length) {
      sbFortschritt.forEach(r => {
        const key = `psaga_bestanden_${r.modul_id}_${userId}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify({ bestanden: true, bestanden_am: r.bestanden_am }));
        }
      });
    }
  } catch(e) { console.warn('PSAgA Fortschritt-Sync:', e); }

  // Fortschritts-Zähler: wie viele Module bestanden?
  const bestandenAnzahl = PSAGA_MODULE.filter(m =>
    !!localStorage.getItem(`psaga_bestanden_${m.id}_${userId}`)
  ).length;
  const gesamtAnzahl = PSAGA_MODULE.length;

  let html = `<div style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden;margin-bottom:10px">
    <div style="padding:10px 14px;background:#1a3a5c;color:#fff">
      <div style="font-weight:700;font-size:.85rem">🪝 PSAgA Schulungsmodule</div>
      <div style="font-size:.72rem;opacity:.8;margin-top:2px">Schritt für Schritt — ${bestandenAnzahl} von ${gesamtAnzahl} Kapiteln abgeschlossen</div>
      <div style="margin-top:6px;height:5px;background:rgba(255,255,255,.2);border-radius:3px">
        <div style="height:100%;background:#22c55e;border-radius:3px;width:${Math.round(bestandenAnzahl/gesamtAnzahl*100)}%;transition:width .4s"></div>
      </div>
    </div>`;

  PSAGA_MODULE.forEach((m, idx) => {
    const bestanden = !!localStorage.getItem(`psaga_bestanden_${m.id}_${userId}`);
    // Modul 00 (Index 0) ist immer zugänglich.
    // Alle weiteren: zugänglich wenn das VORHERIGE Modul bestanden ist.
    const vorherigBestanden = idx === 0 || !!localStorage.getItem(`psaga_bestanden_${PSAGA_MODULE[idx-1].id}_${userId}`);
    const gesperrt = !vorherigBestanden && !bestanden;

    let hintergrund, symbol, symbolStyle, cursorStyle, hinweis;
    if (bestanden) {
      hintergrund = '#f0fdf4';
      symbol = '✅';
      symbolStyle = 'color:#16a34a;font-weight:700';
      cursorStyle = 'pointer';
      hinweis = '';
    } else if (gesperrt) {
      hintergrund = '#f9fafb';
      symbol = '🔒';
      symbolStyle = 'color:#d1d5db';
      cursorStyle = 'not-allowed';
      hinweis = `<div style="font-size:.68rem;color:#f59e0b;margin-top:3px">⚠️ Bitte zuerst Kapitel ${idx} abschließen</div>`;
    } else {
      hintergrund = '#fff';
      symbol = '▶';
      symbolStyle = 'color:#9ca3af';
      cursorStyle = 'pointer';
      hinweis = '';
    }

    const clickHandler = gesperrt
      ? `showToast('🔒 Bitte zuerst Kapitel ${idx} absolvieren und bestehen!', '#92400e')`
      : `psagaFolienOeffnen('${m.id}')`;

    html += `
      <div onclick="${clickHandler}"
        style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid #f0f2f5;cursor:${cursorStyle};background:${hintergrund};opacity:${gesperrt ? '0.6' : '1'}">
        <span style="font-size:2rem;flex-shrink:0">${gesperrt ? '🔒' : m.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:.85rem;color:${gesperrt ? '#9ca3af' : '#1a3a5c'}">${escHtml(m.titel)}</div>
          <div style="font-size:.72rem;color:#6b7280;margin-top:2px">${escHtml(m.untertitel)}</div>
          <div style="font-size:.7rem;color:#9ca3af;margin-top:3px">📊 ${m.folien} Folien</div>
          ${hinweis}
        </div>
        <span style="font-size:1.3rem;flex-shrink:0;${symbolStyle}">${symbol}</span>
      </div>`;
  });

  html += `</div>`;
  cont.innerHTML = html;
}

// PSAgA Geräte-Sync: Folien-Position und Quiz-Stand in Supabase speichern
async function psagaSyncSpeichern(modulId, foliePosition, quizState) {
  if (!currentUser?.userId || !modulId) return;
  try {
    const syncData = { folie: foliePosition || 1, quiz_state: quizState || null, updated: new Date().toISOString() };
    await SB.upsert('psaga_zuweisung', {
      id: `psaga_sync_${currentUser.userId}_${modulId}`,
      user_id: currentUser.userId,
      tenant_id: currentUser.tenantId || '',
      modul_id: '__sync__',
      bestanden: false,
      bestanden_am: JSON.stringify(syncData)
    });
  } catch(e) { /* Sync-Fehler silent */ }
}

// PSAgA Geräte-Sync: Folien-Position und Quiz-Stand aus Supabase laden
async function psagaSyncLaden(modulId) {
  if (!currentUser?.userId || !modulId) return null;
  try {
    const rows = await SB.get('psaga_zuweisung',
      `id=eq.${encodeURIComponent(`psaga_sync_${currentUser.userId}_${modulId}`)}`);
    if (rows && rows.length && rows[0].bestanden_am) {
      return JSON.parse(rows[0].bestanden_am);
    }
  } catch(e) { /* Sync-Fehler silent */ }
  return null;
}

// PSAgA Geräte-Sync: Sync-Eintrag löschen (nach Abschluss)
async function psagaSyncLoeschen(modulId) {
  if (!currentUser?.userId || !modulId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/psaga_zuweisung?id=eq.${encodeURIComponent(`psaga_sync_${currentUser.userId}_${modulId}`)}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    });
  } catch(e) { /* silent */ }
}

function psagaFolienOeffnen(modulId) {
  psagaAktivesModul  = PSAGA_MODULE.find(m => m.id === modulId);
  if (!psagaAktivesModul) return;

  // Sicherheitsprüfung: Modul gesperrt wenn Vorgänger nicht bestanden
  const idx = PSAGA_MODULE.findIndex(m => m.id === modulId);
  const userId = currentUser?.userId || '';
  if (idx > 0) {
    const vorherigBestanden = !!localStorage.getItem(`psaga_bestanden_${PSAGA_MODULE[idx-1].id}_${userId}`);
    if (!vorherigBestanden) {
      showToast(`🔒 Bitte zuerst Kapitel ${idx} abschließen!`, '#92400e');
      psagaAktivesModul = null;
      return;
    }
  }

  psagaAktuelleFolie = 1;
  // Gespeicherte Position laden (zuerst localStorage, dann Supabase)
  const fsKey = `psaga_folie_${psagaAktivesModul.id}_${currentUser?.userId||''}`;
  const localSaved = localStorage.getItem(fsKey);
  if (localSaved) {
    const savedIdx = parseInt(localSaved, 10);
    const maxIdx = psagaAktivesModul.folien;
    if (savedIdx > 1 && savedIdx <= maxIdx) {
      psagaAktuelleFolie = savedIdx;
      setTimeout(() => showToast('📌 Weiter ab Folie ' + savedIdx), 500);
    }
  } else {
    // Supabase-Sync prüfen (für Gerätewechsel)
    psagaSyncLaden(psagaAktivesModul.id).then(syncData => {
      if (syncData && syncData.folie > 1) {
        const maxIdx = psagaAktivesModul?.folien || 999;
        if (syncData.folie <= maxIdx) {
          psagaAktuelleFolie = syncData.folie;
          // localStorage auch setzen für nächste Male
          localStorage.setItem(fsKey, String(syncData.folie));
          psagaFolienAnzeigen();
          showToast('📌 Weiter ab Folie ' + syncData.folie + ' (anderes Gerät)');
        }
      }
    }).catch(() => {});
  }
  psagaAutoModus = false;
  psagaAutoPause = false;
  psagaFolienAnzeigen();
  psagaAutoButtonUpdate();
  const modal = document.getElementById('psaga-folien-modal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
}

// TTS / Audio für PSAgA-Folien
// Modul 00: Original-MP3 aus Supabase Storage + Auto-Durchlauf
// Modul 01+: Web Speech API (TTS-Texte)
let psagaTTSAktiv = false;
let psagaTTSUtterance = null;
let psagaAudioEl = null;     // <audio>-Element für Modul-00-MP3s
let psagaAutoModus = false;  // Auto-Durchlauf aktiv?
let psagaAutoPause = false;  // Pausiert (aber nicht deaktiviert)?
let psagaAutoTimer = null;   // setTimeout-Handle für 1,5s Wartezeit

function psagaAudioStop() {
  if (psagaAutoTimer) { clearTimeout(psagaAutoTimer); psagaAutoTimer = null; }
  if (psagaAudioEl) {
    psagaAudioEl.onended = null;
    psagaAudioEl.pause();
    psagaAudioEl.src = '';
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// Auto-Button: nur für Modul 00 sichtbar
function psagaAutoButtonUpdate() {
  const autoBtn = document.getElementById('psaga-auto-btn');
  if (!autoBtn) return;
  const istModul00 = psagaAktivesModul && psagaAktivesModul.hasAudio;
  autoBtn.style.display = istModul00 ? '' : 'none';
  if (!psagaAutoModus) {
    autoBtn.textContent = '▶ Auto';
    autoBtn.style.background = '';
    autoBtn.classList.add('pulsing');
  } else if (psagaAutoPause) {
    autoBtn.textContent = '▶ Weiter';
    autoBtn.style.background = '#92400e';
    autoBtn.classList.remove('pulsing');
  } else {
    autoBtn.textContent = '⏸ Pause';
    autoBtn.style.background = '#065f46';
    autoBtn.classList.remove('pulsing');
  }
}

function psagaAutoToggle() {
  if (!psagaAutoModus) {
    // Auto starten
    psagaAutoModus = true;
    psagaAutoPause = false;
    // Ton automatisch einschalten falls aus
    if (!psagaTTSAktiv) {
      psagaTTSAktiv = true;
      const ttsBtn = document.getElementById('psaga-tts-btn');
      if (ttsBtn) ttsBtn.textContent = '🔊 Ton AN';
    }
    psagaAutoButtonUpdate();
    psagaTTSSprechen();
  } else if (!psagaAutoPause) {
    // Pause
    psagaAutoPause = true;
    if (psagaAutoTimer) { clearTimeout(psagaAutoTimer); psagaAutoTimer = null; }
    if (psagaAudioEl) psagaAudioEl.pause();
    psagaAutoButtonUpdate();
  } else {
    // Weiter nach Pause
    psagaAutoPause = false;
    psagaAutoButtonUpdate();
    if (psagaAudioEl && psagaAudioEl.src && !psagaAudioEl.ended) {
      // Audio war pausiert → fortsetzen
      psagaAudioEl.play().catch(() => {});
    } else {
      // Audio war bereits fertig → nächste Folie
      psagaAutoWeiter();
    }
  }
}

function psagaAutoWeiter() {
  if (!psagaAutoModus || psagaAutoPause || !psagaAktivesModul) return;
  if (psagaAktuelleFolie < psagaAktivesModul.folien) {
    psagaAktuelleFolie++;
    psagaFolienAnzeigen();
  } else {
    // Letzte Folie erreicht → Auto-Modus beenden, normal abschließen
    psagaAutoModus = false;
    psagaAutoPause = false;
    psagaAutoButtonUpdate();
    psagaFolienNext(); // löst Quiz oder Abschließen aus
  }
}

function psagaTTSToggle() {
  psagaTTSAktiv = !psagaTTSAktiv;
  const btn = document.getElementById('psaga-tts-btn');
  if (btn) btn.textContent = psagaTTSAktiv ? '🔊 Ton AN' : '🔊 Ton';
  if (psagaTTSAktiv) {
    psagaTTSSprechen();
  } else {
    // Ton aus → auch Auto-Modus beenden
    psagaAutoModus = false;
    psagaAutoPause = false;
    psagaAutoButtonUpdate();
    psagaAudioStop();
  }
}

function psagaTTSSprechen() {
  if (!psagaTTSAktiv || !psagaAktivesModul) return;
  psagaAudioStop();

  // Modul mit Original-MP3-Tonspur: aus PPTX extrahierte Audio-Dateien abspielen
  if (psagaAktivesModul.hasAudio) {
    const nr = String(psagaAktuelleFolie).padStart(2, '0');
    const url = `${SUPABASE_URL}/storage/v1/object/public/schulung-folien/${psagaAktivesModul.pfad}/audio-${nr}.mp3`;
    if (!psagaAudioEl) {
      psagaAudioEl = document.createElement('audio');
      psagaAudioEl.style.display = 'none';
      document.body.appendChild(psagaAudioEl);
    }
    psagaAudioEl.src = url;
    // Auto-Modus: nach Ende 1,5s warten dann weiterblättern
    psagaAudioEl.onended = function() {
      if (psagaAutoModus && !psagaAutoPause) {
        psagaAutoTimer = setTimeout(psagaAutoWeiter, 1500);
      }
    };
    psagaAudioEl.play().catch(() => {});
    return;
  }

  // Modul 01+: Web Speech API
  if (!window.speechSynthesis) return;
  const texte = PSAGA_TTS_TEXTE && PSAGA_TTS_TEXTE[psagaAktivesModul.id];
  if (!texte) return;
  const text = texte[psagaAktuelleFolie - 1];
  if (!text) return;
  psagaTTSUtterance = new SpeechSynthesisUtterance(text);
  psagaTTSUtterance.lang = 'de-DE';
  psagaTTSUtterance.rate = 0.92;
  window.speechSynthesis.speak(psagaTTSUtterance);
}

function psagaFolienAnzeigen() {
  if (!psagaAktivesModul) return;
  const bild    = document.getElementById('psaga-folien-bild');
  const titel   = document.getElementById('psaga-folien-titel');
  const zaehler = document.getElementById('psaga-folien-zaehler');
  const nextBtn = document.getElementById('psaga-folien-next-btn');
  const progBar = document.getElementById('psaga-progress-bar');
  if (bild)    bild.src = psagaFolienUrl(psagaAktivesModul, psagaAktuelleFolie);
  if (titel)   titel.textContent = psagaAktivesModul.titel;
  if (zaehler) zaehler.textContent = `Folie ${psagaAktuelleFolie} von ${psagaAktivesModul.folien}`;
  if (progBar) progBar.style.width = `${Math.round(psagaAktuelleFolie / psagaAktivesModul.folien * 100)}%`;
  const isLetzte = psagaAktuelleFolie === psagaAktivesModul.folien;
  if (nextBtn) {
    nextBtn.textContent = isLetzte ? '✅ Abschließen' : 'Weiter ›';
    nextBtn.style.background = isLetzte ? '#0f5132' : '#1a3a5c';
  }
  psagaTTSSprechen();
}

function psagaFolienNext() {
  if (!psagaAktivesModul) return;
  if (psagaAktuelleFolie < psagaAktivesModul.folien) {
    psagaAktuelleFolie++;
    // Folien-Position merken (localStorage + Supabase alle 3 Folien)
    const fsKey = `psaga_folie_${psagaAktivesModul.id}_${currentUser?.userId||''}`;
    localStorage.setItem(fsKey, String(psagaAktuelleFolie));
    if (psagaAktuelleFolie % 3 === 0) { // Supabase-Sync alle 3 Folien (nicht bei jedem Klick)
      psagaSyncSpeichern(psagaAktivesModul.id, psagaAktuelleFolie, null);
    }
    psagaFolienAnzeigen();
  } else {
    // Letzte Folie: Quiz starten (wenn vorhanden) oder direkt abschließen
    const modulKopie = psagaAktivesModul; // Kopie VOR schliessen (schliessen setzt auf null!)
    const hatQuiz = !!(PSAGA_QUIZ[modulKopie.id] && PSAGA_QUIZ[modulKopie.id].length);
    // Gespeicherte Position nach Abschluss löschen
    const fsKey = `psaga_folie_${modulKopie.id}_${currentUser?.userId||''}`;
    localStorage.removeItem(fsKey);
    psagaSyncLoeschen(modulKopie.id); // Supabase-Sync-Eintrag löschen
    psagaFolienSchliessen();
    if (hatQuiz) {
      psagaQuizStarten(modulKopie);
    } else {
      psagaBestanden(modulKopie);
    }
  }
}

async function psagaQuizStarten(modul) {
  psagaQuizModulId = modul.id;
  // 1. localStorage prüfen (schnell, offline)
  const savedRaw = localStorage.getItem('psaga_quiz_state');
  if (savedRaw) {
    try {
      const saved = JSON.parse(savedRaw);
      if (saved.modulId === modul.id && saved.index > 0) {
        psagaQuizIndex   = saved.index;
        psagaQuizFehler  = saved.fehler || 0;
        psagaQuizRichtig = saved.richtig || [];
        localStorage.removeItem('psaga_quiz_state');
        psagaSyncLoeschen(modul.id);
        psagaQuizAnzeigen();
        return;
      }
    } catch(e) {}
  }
  // 2. Supabase-Sync prüfen (Gerätewechsel)
  const syncData = await psagaSyncLaden(modul.id).catch(() => null);
  if (syncData && syncData.quiz_state && syncData.quiz_state.modulId === modul.id && syncData.quiz_state.index > 0) {
    psagaQuizIndex   = syncData.quiz_state.index;
    psagaQuizFehler  = syncData.quiz_state.fehler || 0;
    psagaQuizRichtig = syncData.quiz_state.richtig || [];
    psagaSyncLoeschen(modul.id);
    showToast('📌 Quiz-Stand vom anderen Gerät geladen');
    psagaQuizAnzeigen();
    return;
  }
  // 3. Von vorne
  psagaQuizIndex   = 0;
  psagaQuizFehler  = 0;
  psagaQuizRichtig = [];
  psagaQuizAnzeigen();
}

function psagaQuizAnzeigen() {
  const fragen = PSAGA_QUIZ[psagaQuizModulId] || [];
  // Modal dynamisch erstellen falls nicht im DOM
  let modal = document.getElementById('psaga-quiz-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'psaga-quiz-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:#0f172a;z-index:10000;flex-direction:column;overflow:hidden';
    document.body.appendChild(modal);
  }
  if (psagaQuizIndex >= fragen.length) {
    // Alle Fragen richtig beantwortet
    modal.style.display = 'none';
    const modul = PSAGA_MODULE.find(m => m.id === psagaQuizModulId);
    if (modul) psagaBestanden(modul);
    return;
  }
  const q = fragen[psagaQuizIndex];
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  modal.innerHTML = `
    <div style="background:#1a2d4e;color:#fff;padding:16px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:relative">
      <button onclick="const qState={modulId:psagaQuizModulId,index:psagaQuizIndex,fehler:psagaQuizFehler,richtig:psagaQuizRichtig};localStorage.setItem('psaga_quiz_state',JSON.stringify(qState));psagaSyncSpeichern(psagaQuizModulId, 0, qState);this.closest('#psaga-quiz-modal').style.display='none'; document.body.style.overflow=''; document.querySelectorAll('#psaga-quiz-modal').forEach(e=>e.remove());" 
        style="position:absolute;top:10px;right:12px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#999;" 
        title="Schließen">✕</button>
      <span style="font-size:1.3em">📝</span>
      <span style="font-weight:700;font-size:1.1em">Wissenstest — Frage ${psagaQuizIndex+1} von ${fragen.length}</span>
    </div>
    <div style="flex:1;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column;gap:16px">
      <div style="font-size:1.1em;font-weight:600;color:#e2e8f0;line-height:1.5">${q.frage}</div>
      <div id="quiz-antworten" style="display:flex;flex-direction:column;gap:10px">
        ${q.antworten.map((a, i) => `
          <button onclick="psagaAntwortPruefen(${i})"
            style="background:#1e3a5f;color:#e2e8f0;border:1px solid #2e5a8f;border-radius:8px;padding:14px 16px;text-align:left;font-size:1em;cursor:pointer;line-height:1.4">
            <span style="color:#60a5fa;font-weight:700;margin-right:8px">${String.fromCharCode(65+i)})</span>${a}
          </button>`).join('')}
      </div>
    </div>`;
}

function psagaQuizAnzeigenMitHinweis() {
  const fragen = PSAGA_QUIZ[psagaQuizModulId] || [];
  let modal = document.getElementById('psaga-quiz-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'psaga-quiz-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:#0f172a;z-index:10000;flex-direction:column;overflow:hidden';
    document.body.appendChild(modal);
  }
  const q = fragen[psagaQuizIndex];
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div style="background:#1a2d4e;color:#fff;padding:16px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0;position:relative">
      <button onclick="const qState={modulId:psagaQuizModulId,index:psagaQuizIndex,fehler:psagaQuizFehler,richtig:psagaQuizRichtig};localStorage.setItem('psaga_quiz_state',JSON.stringify(qState));psagaSyncSpeichern(psagaQuizModulId, 0, qState);this.closest('#psaga-quiz-modal').style.display='none'; document.body.style.overflow=''; document.querySelectorAll('#psaga-quiz-modal').forEach(e=>e.remove());" 
        style="position:absolute;top:10px;right:12px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:#999;" 
        title="Schließen">✕</button>
      <span style="font-size:1.3em">📝</span>
      <span style="font-weight:700;font-size:1.1em">Wissenstest — Frage ${psagaQuizIndex+1} von ${fragen.length}</span>
    </div>
    <div style="background:#7f1d1d;color:#fca5a5;padding:12px 20px;font-weight:600;flex-shrink:0">
      ⚠️ Falsche Antwort — bitte erneut beantworten!
    </div>
    <div style="flex:1;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column;gap:16px">
      <div style="font-size:1.1em;font-weight:600;color:#e2e8f0;line-height:1.5">${q.frage}</div>
      <div id="quiz-antworten" style="display:flex;flex-direction:column;gap:10px">
        ${q.antworten.map((a, i) => `
          <button onclick="psagaAntwortPruefen(${i})"
            style="background:#1e3a5f;color:#e2e8f0;border:1px solid #2e5a8f;border-radius:8px;padding:14px 16px;text-align:left;font-size:1em;cursor:pointer;line-height:1.4">
            <span style="color:#60a5fa;font-weight:700;margin-right:8px">${String.fromCharCode(65+i)})</span>${a}
          </button>`).join('')}
      </div>
    </div>`;
}

function psagaAntwortPruefen(gewaehlterIndex) {
  const fragen = PSAGA_QUIZ[psagaQuizModulId] || [];
  const q      = fragen[psagaQuizIndex];
  const richtig = gewaehlterIndex === q.richtig;
  if (richtig) {
    // Alle Buttons sperren + richtigen grün einfärben
    const btns = document.querySelectorAll('#quiz-antworten button');
    btns.forEach((b, i) => {
      b.disabled = true;
      b.style.opacity = '0.6';
      if (i === q.richtig) { b.style.background = '#14532d'; b.style.borderColor = '#22c55e'; b.style.opacity = '1'; }
    });
    psagaQuizRichtig.push(psagaQuizIndex);
    // Weiter-Button einblenden
    const cont = document.getElementById('psaga-quiz-modal') || document.querySelector('[id="psaga-quiz-modal"]');
    if (cont) {
      const weiterDiv = document.createElement('div');
      weiterDiv.style.cssText = 'padding:16px 20px;display:flex;justify-content:space-between;align-items:center;background:#0f172a;flex-shrink:0';
      weiterDiv.innerHTML = `
        <span style="color:#22c55e;font-weight:600">✅ Richtig!</span>
        <button onclick="psagaQuizIndex++;psagaQuizAnzeigen()"
          style="background:#1a3a5c;color:#fff;border:none;border-radius:8px;padding:12px 24px;font-size:1em;font-weight:600;cursor:pointer">
          ${psagaQuizIndex+1 >= fragen.length ? '📄 Bescheinigung erstellen' : 'Weiter →'}
        </button>`;
      cont.appendChild(weiterDiv);
    }
  } else {
    psagaQuizFehler++;
    psagaQuizAnzeigenMitHinweis();
  }
}

async function psagaBestanden(modul) {
  const userId   = currentUser?.userId || '';
  const userName = currentUser?.name   || 'Mitarbeiter';
  const tenantId = currentUser?.tenantId || '';
  const jetzt    = new Date();
  const ablauf   = new Date(jetzt.getTime() + 364*24*60*60*1000);
  // localStorage-Eintrag
  localStorage.setItem(`psaga_bestanden_${modul.id}_${userId}`, JSON.stringify({
    modulId: modul.id, modulTitel: modul.titel,
    datum: jetzt.toISOString(), ablauf: ablauf.toISOString(),
    fehler: psagaQuizFehler
  }));
  // Supabase-Sync PSAgA-Fortschritt
  try {
    await SB.upsert('psaga_zuweisung', {
      id: `psaga_${userId}_${modul.id}`,
      user_id: userId,
      tenant_id: currentUser.tenantId || '',
      modul_id: modul.id,
      bestanden: true,
      bestanden_am: new Date().toISOString()
    });
  } catch(e) { console.warn('PSAgA Supabase-Sync fehlgeschlagen:', e); }
  // Audit
  sbAudit('PSAGA_BESTANDEN', JSON.stringify({
    modul_id: modul.id, modul_titel: modul.titel,
    user_id: userId, user_name: userName, tenant_id: tenantId,
    ablauf_datum: ablauf.toISOString().slice(0,10)
  })).catch(()=>{});

  // Modulliste neu rendern (Sperr-Status aktualisieren)
  psagaSchulungenRender();

  // Prüfen: Alle Module bestanden?
  const alleModule = PSAGA_MODULE;
  const allebestanden = alleModule.every(m =>
    !!localStorage.getItem(`psaga_bestanden_${m.id}_${userId}`)
  );

  if (allebestanden) {
    // 🏆 Alle Kapitel abgeschlossen → Zertifikat ausstellen
    showToast('🏆 Alle Kapitel bestanden! Teilnahmebescheinigung wird erstellt…', '#0f5132');
    setTimeout(() => psagaZertifikatPDF(modul, userName, tenantId, jetzt, ablauf), 800);
  } else {
    // Nächstes offenes Modul ermitteln
    const aktIdx = alleModule.findIndex(m => m.id === modul.id);
    const naechstes = alleModule[aktIdx + 1];
    showToast(`✅ Kapitel ${aktIdx + 1} bestanden! Weiter mit Kapitel ${aktIdx + 2}…`, '#1a3a5c');
  }
}

function psagaFolienPrev() {
  if (!psagaAktivesModul) return;
  if (psagaAktuelleFolie > 1) {
    psagaAktuelleFolie--;
    // Folien-Position merken
    const fsKey = `psaga_folie_${psagaAktivesModul.id}_${currentUser?.userId||''}`;
    localStorage.setItem(fsKey, String(psagaAktuelleFolie));
    if (psagaAktuelleFolie % 3 === 0) {
      psagaSyncSpeichern(psagaAktivesModul.id, psagaAktuelleFolie, null);
    }
    psagaFolienAnzeigen();
  }
}

function psagaFolienSchliessen() {
  psagaAutoModus = false;
  psagaAutoPause = false;
  psagaAudioStop();
  psagaTTSAktiv = false;
  const btn = document.getElementById('psaga-tts-btn');
  if (btn) btn.textContent = '🔊 Ton';
  const modal = document.getElementById('psaga-folien-modal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  psagaAktivesModul = null;
}

// Keyboard-Navigation für Folien-Viewer
document.addEventListener('keydown', function(e) {
  if (!psagaAktivesModul) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') psagaFolienNext();
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   psagaFolienPrev();
  if (e.key === 'Escape') psagaFolienSchliessen();
});

const SIBEDA_LOGO_B64 = "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";
const FISAT_LOGO_B64 = "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";
const ISO9001_LOGO_B64 = "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";
const ISO14001_LOGO_B64 = "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";

// ── PSAgA Zertifikat-PDF (jsPDF) ─────────────────────────────────────────────
async function psagaZertifikatPDF(modul, userName, tenantId, datum, ablauf) {
  try {
    if (typeof window.jspdf === 'undefined') {
      showToast('⚠️ PDF-Bibliothek nicht geladen', '#7f1d1d'); return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, ML = 12, MR = 12, CW = W - ML - MR;

    // ── Farben ────────────────────────────────────────────────────────────────
    const DUNKELBLAU = [26, 45, 78];
    const BLAU       = [46, 122, 191];
    const CYAN       = [0, 180, 210];
    const GOLD       = [220, 160, 0];
    const GRUEN      = [30, 160, 80];
    const WEISS      = [255, 255, 255];
    const HELLBLAU   = [235, 244, 255];
    const HELLGRUEN  = [230, 248, 238];
    const HELLGOLD   = [255, 248, 220];
    const GRAU_TEXT  = [70, 80, 100];
    const GRAU_LEICHT= [245, 247, 251];
    const GRAU_LINIE = [200, 210, 225];

    const fmtDat = d => d.toLocaleDateString('de-DE', {day:'2-digit',month:'2-digit',year:'numeric'});

    // ── Header — hell, professionell ──────────────────────────────────────────
    const HH = 56; // etwas höher für bessere Aufteilung
    // Leichter Hintergrundverlauf (simuliert mit Rechtecken)
    for (let i = 0; i < HH; i++) {
      const v = Math.round(248 - i / HH * 12);
      doc.setFillColor(v, v, Math.min(255, v + 8));
      doc.rect(0, i * (HH / HH), W, 1.05, 'F');
    }
    // Dicker Dunkelblau-Balken ganz links
    doc.setFillColor(...DUNKELBLAU); doc.rect(0, 0, 6, HH, 'F');
    // Goldene Akzentlinie rechts neben dem Balken
    doc.setFillColor(...GOLD); doc.rect(6, 0, 2, HH, 'F');
    // Blaue Trennlinie unten
    doc.setFillColor(...BLAU); doc.rect(0, HH - 1, W, 1, 'F');

    // SIBEDA-Logo — links, proportional skaliert auf Höhe 24mm
    // Original SIBEDA-Logo ist Querformat → Breite berechnen aus Seitenverhältnis ~3:1
    try {
      const sibeH = 24;
      const sibeW = Math.round(sibeH * 3.0); // Querformat ca. 3:1 → 72mm breit wäre zu viel
      // Sicherer Wert: 58mm breit bei 24mm hoch (gemessen am Original)
      doc.addImage(SIBEDA_LOGO_B64, 'JPEG', 10, (HH - sibeH) / 2, 58, sibeH);
    } catch(e) {}

    // Titel — vertikal zentriert in oberer Hälfte, links neben ISO-Siegeln
    // ISO-Siegel sind ca. 2×22mm = 47mm + Abstand → Titel endet bei ~W-60
    const txStart = 74;
    const titleAreaW = W - txStart - 52; // Platz lassen für ISO-Siegel rechts
    doc.setTextColor(...DUNKELBLAU);
    doc.setFontSize(20); doc.setFont('helvetica','bold');
    doc.text('TEILNAHMEBESCHEINIGUNG', txStart, 18);
    // Unterstreichung
    doc.setFillColor(...BLAU); doc.rect(txStart, 21, titleAreaW, 1, 'F');
    doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.setTextColor(...GRAU_TEXT);
    doc.text('gemäß DGUV Regel 112-198  ·  PSA-BV  ·  ArbSchG', txStart, 29);

    // ISO-Siegel — rechts, in der UNTEREN Hälfte des Headers (unter Titel-Höhe)
    // So überdecken sie den Schriftzug nicht
    try {
      const isoH = 16, isoW = Math.round(isoH * 299 / 229); // proportional ~21mm
      const isoGap = 3;
      const isoY = HH - isoH - 4; // 4mm vom unteren Rand des Headers
      const iso14X = W - MR - isoW;
      const iso9X  = iso14X - isoGap - isoW;
      doc.addImage(ISO9001_LOGO_B64,  'PNG', iso9X,  isoY, isoW, isoH);
      doc.addImage(ISO14001_LOGO_B64, 'PNG', iso14X, isoY, isoW, isoH);
    } catch(e) {}

    let y = HH + 8;

    // ── Teilnehmer-Box ────────────────────────────────────────────────────────
    doc.setFillColor(...HELLBLAU);
    doc.roundedRect(ML, y, CW, 24, 3, 3, 'F');
    doc.setFillColor(...DUNKELBLAU);
    doc.roundedRect(ML, y, 4, 24, 2, 2, 'F');
    doc.setFontSize(15); doc.setFont('helvetica','bold');
    doc.setTextColor(...DUNKELBLAU);
    doc.text(userName, ML+8, y+10);
    doc.setFontSize(8); doc.setFont('helvetica','normal');
    doc.setTextColor(...GRAU_TEXT);
    const tenant = APP_TENANTS ? APP_TENANTS.find(t => t.id === tenantId) : null;
    const tenantName = tenant ? tenant.name + '  ·  ' : '';
    doc.text(tenantName + 'Petermax-Müller-Straße 3  ·  30880 Laatzen', ML+8, y+18);
    // Grüner Haken-Badge rechts
    doc.setFillColor(...GRUEN);
    doc.circle(ML+CW-8, y+12, 5, 'F');
    doc.setFontSize(10); doc.setFont('helvetica','bold');
    doc.setTextColor(255,255,255);
    doc.text('✓', ML+CW-8, y+14.5, {align:'center'});
    y += 30;

    // ── Datum-Zeile ───────────────────────────────────────────────────────────
    const colW2 = (CW - 4) / 2;
    // Schulungsdatum
    doc.setFillColor(...HELLBLAU);
    doc.roundedRect(ML, y, colW2, 16, 3, 3, 'F');
    doc.setFillColor(...BLAU); doc.roundedRect(ML, y, 4, 16, 2, 2, 'F');
    doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(...BLAU);
    doc.text('SCHULUNGSDATUM', ML+8, y+6);
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(...DUNKELBLAU);
    doc.text(fmtDat(datum), ML+8, y+13);
    // Gültig bis
    doc.setFillColor(...HELLGOLD);
    doc.roundedRect(ML+colW2+4, y, colW2, 16, 3, 3, 'F');
    doc.setFillColor(...GOLD); doc.roundedRect(ML+colW2+4, y, 4, 16, 2, 2, 'F');
    doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(...GOLD);
    doc.text('GÜLTIG BIS', ML+colW2+12, y+6);
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(...DUNKELBLAU);
    doc.text(fmtDat(ablauf), ML+colW2+12, y+13);
    y += 22;

    // ── Modul-Box ─────────────────────────────────────────────────────────────
    doc.setFillColor(...DUNKELBLAU);
    doc.roundedRect(ML, y, CW, 18, 3, 3, 'F');
    doc.setFillColor(...CYAN); doc.roundedRect(ML, y, 4, 18, 2, 2, 'F');
    doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255);
    doc.text(modul.titel || 'PSAgA Schulung nach DGUV 112-198', ML+8, y+7);
    doc.setFontSize(7.5); doc.setFont('helvetica','normal');
    doc.setTextColor(180, 210, 240);
    doc.text(modul.untertitel || 'Modul 01 — Rechtliche Grundlagen persönlicher Schutzausrüstung gegen Absturz', ML+8, y+14);
    y += 22;

    // ── Schulungsinhalte — dynamisch aus PSAGA_MODULE ─────────────────────────
    doc.setFillColor(...GRUEN); doc.rect(ML, y, 4, 8, 'F');
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(...DUNKELBLAU);
    doc.text('Schulungsinhalte', ML+7, y+6);
    y += 11;

    // Alle absolvierten Module des aktuellen Nutzers ermitteln (localStorage)
    const userId = (typeof currentUser !== 'undefined' && currentUser?.userId) ? currentUser.userId : '';
    const bestandeneModule = PSAGA_MODULE.filter(m =>
      localStorage.getItem('psaga_bestanden_' + m.id + '_' + userId)
    );
    // Fallback: wenn nichts im localStorage → aktuelles Modul anzeigen
    const moduleListeFuerZertifikat = bestandeneModule.length > 0
      ? bestandeneModule
      : [modul];
    // Kapitel-Liste: "Nr. Titel (Untertitel-Kurzform)"
    const kapitel = moduleListeFuerZertifikat.map((m, i) => {
      const nr = m.id.replace('psaga-','').split('-')[0];
      const anzeige = (parseInt(nr) || (i+1)) + '.  ' + m.titel;
      return anzeige;
    });

    const tcw = (CW - 6) / 2, th = 6.5;
    doc.setFontSize(7.5); doc.setFont('helvetica','normal');
    kapitel.forEach((k, ti) => {
      const col = ti % 2, row = Math.floor(ti / 2);
      const tx = ML + col * (tcw + 6), ty2 = y + row * th;
      doc.setFillColor(...GRAU_LEICHT);
      doc.roundedRect(tx, ty2 - 2, tcw, th - 0.3, 1, 1, 'F');
      doc.setFillColor(...BLAU); doc.rect(tx, ty2 - 2, 2.5, th - 0.3, 'F');
      doc.setTextColor(...GRAU_TEXT);
      doc.text(k, tx + 5, ty2 + 1.5, {maxWidth: tcw - 6});
    });
    y += Math.ceil(kapitel.length / 2) * th + 6;

    // ── Trennlinie ────────────────────────────────────────────────────────────
    doc.setFillColor(...GRAU_LINIE); doc.rect(ML, y, CW, 0.8, 'F');
    y += 7;

    // ── Unterschrift-Block ────────────────────────────────────────────────────
    const sigH = 36, halfW = (CW - 4) / 2;

    // Links: Trainer-Signatur
    doc.setFillColor(...HELLBLAU);
    doc.roundedRect(ML, y, halfW, sigH, 3, 3, 'F');
    doc.setFillColor(...BLAU); doc.roundedRect(ML, y, 4, sigH, 2, 2, 'F');
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(...GRAU_TEXT);
    doc.text('Ausgebildeter Trainer', ML+8, y+7);
    doc.setDrawColor(...BLAU); doc.setLineWidth(0.5);
    doc.line(ML+8, y+17, ML+halfW-4, y+17);
    doc.setFontSize(13); doc.setFont('helvetica','bolditalic'); doc.setTextColor(...BLAU);
    doc.text('gez. Thomas Schmoldt', ML+8, y+25);
    doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(120,120,120);
    doc.text('CSC GmbH  ·  ' + fmtDat(datum), ML+8, y+32);

    // Rechts: FISAT zentriert
    const rx = ML + halfW + 4;
    doc.setFillColor(...HELLGRUEN);
    doc.roundedRect(rx, y, halfW, sigH, 3, 3, 'F');
    doc.setFillColor(...GRUEN); doc.roundedRect(rx, y, 4, sigH, 2, 2, 'F');
    try {
      const lw = 22, lh = 22;
      const lx = rx + 4 + (halfW - 4 - lw) / 2;
      const ly = y + (sigH - lh) / 2 - 3;
      doc.addImage(FISAT_LOGO_B64, 'PNG', lx, ly, lw, lh);
      doc.setFontSize(6); doc.setFont('helvetica','bold'); doc.setTextColor(...GRUEN);
      doc.text('FISAT MITGLIED', rx + 4 + (halfW - 4) / 2, ly + lh + 4, {align:'center'});
    } catch(e) {}
    y += sigH + 6;

    // ── Rechtsgrundlagen ──────────────────────────────────────────────────────
    doc.setFillColor(...HELLGRUEN);
    doc.roundedRect(ML, y, CW, 10, 2, 2, 'F');
    doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(...GRUEN);
    doc.text('Rechtsgrundlagen: ArbSchG § 12  ·  PSA-BV  ·  DGUV 112-198  ·  EU-VO 2016/425  ·  DIN EN 361', W/2, y+6.5, {align:'center'});
    y += 14;

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.setFillColor(...DUNKELBLAU); doc.rect(0, y, W, 20, 'F');
    doc.setFillColor(...GOLD); doc.rect(0, y, 6, 20, 'F');
    doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(255,255,255);
    doc.text('CSC GmbH  ·  Petermax-Müller-Straße 3  ·  30880 Laatzen  ·  www.csc-hannover.de', W/2, y+8, {align:'center'});
    const zertNr = 'TB-PSAgA-' + datum.getFullYear() + '-' + String(datum.getMonth()+1).padStart(2,'0') + '-' + String(Date.now()).slice(-5);
    doc.setTextColor(180, 210, 240);
    doc.text('Bescheinigungs-Nr.:  ' + zertNr, W/2, y+15, {align:'center'});

    // ── Speichern in Supabase Storage + Download ──────────────────────────────
    const blob = doc.output('blob');
    const url  = URL.createObjectURL(blob);
    window.open(url, '_blank');
    showToast('📄 Teilnahmebescheinigung erstellt!', '#0f5132');

    // In Supabase Storage speichern
    try {
      const userId  = currentUser?.userId || 'unbekannt';
      const datStr  = datum.toISOString().slice(0,10).replace(/-/g,'');
      const fileName = `psaga_bescheinigung_${userId}_${datStr}.pdf`;
      const storagePath = `${tenantId || 'allgemein'}/${fileName}`;
      const publicUrl = await SB.uploadPdf(blob, storagePath);

      // In DB speichern — eigene Tabelle psaga_bescheinigungen (falls vorhanden) oder audit
      try {
        await SB.post('psaga_bescheinigungen', {
          id: 'psagab_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
          user_id: userId,
          user_name: userName,
          tenant_id: tenantId || null,
          datum: datum.toISOString().slice(0,10),
          ablauf: ablauf.toISOString().slice(0,10),
          bescheinigungs_nr: zertNr,
          pdf_url: publicUrl,
          erstellt_am: new Date().toISOString()
        });
        showToast('🗄️ Bescheinigung gespeichert', '#0f5132');
      } catch(dbErr) {
        // Tabelle existiert noch nicht → nur Audit-Log
        await sbAudit('PSAGA_BESCHEINIGUNG', JSON.stringify({
          user_id: userId, user_name: userName, tenant_id: tenantId,
          datum: datum.toISOString().slice(0,10), nr: zertNr, pdf_url: publicUrl
        })).catch(()=>{});
        showToast('🗄️ Bescheinigung in Audit gespeichert', '#2563eb');
      }
    } catch(uploadErr) {
      console.warn('Bescheinigung-Upload fehlgeschlagen:', uploadErr.message);
      showToast('⚠️ PDF geöffnet, aber Speicherung fehlgeschlagen: ' + uploadErr.message, '#b45309');
    }
  } catch(e) {
    console.error('Zertifikat-Fehler:', e);
    showToast('⚠️ Zertifikat konnte nicht erstellt werden: ' + e.message, '#7f1d1d');
  }
}
