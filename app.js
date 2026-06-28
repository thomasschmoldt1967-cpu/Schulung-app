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
    ar: "لا يجوز لك البدء في العمل تحت تأثير الكحول أو المخدرات أو الحشيش — فهذا يُعرّضك أنت والآخرين للخطر. إذا كنت تتناول أدوية تؤثر على قدرة التفاعل لديك يجب إبلاغ مشرفك. يمكن أن تؤدي المخالفات إلى الفصل الفوري من العمل."
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
      SB.get('users', 'select=id,name,email,tenant_id,role')
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
  showScreen('screen-login');
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
  loginBtn.textContent = '…';
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
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#screen-admin .tab-content').forEach(t => t.style.display='none');
  document.getElementById(`tab-${tabName}`).style.display='';
  if (tabName==='protokoll') loadAuditFromDB();
  if (tabName==='unternehmen') nuRenderListe();
  if (tabName==='kalender') renderKalender();
  if (tabName==='archiv') renderArchiv();
  if (tabName==='uebersicht') renderAdminCharts();
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
function renderAdminStats() {
  let g=0,y=0,r=0;
  zuweisungen.forEach(z => { const s=berechneStatus(z); if(s==='gruen')g++; else if(s==='gelb')y++; else r++; });
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-tile gruen"><div class="zahl">${g}</div><div class="label">Abgeschlossen</div></div>
    <div class="stat-tile gelb"><div class="zahl">${y}</div><div class="label">In Bearbeitung</div></div>
    <div class="stat-tile rot"><div class="zahl">${r}</div><div class="label">Offen / Überfällig</div></div>
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
          <div style="font-weight:700;font-size:.93rem;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(z.v ? z.v.titel : z.vorlagenId)}</div>
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
      return `<div class="schulung-item" onclick="adminDetailAnzeigen('${z.id}')">
        <div>
          <div class="titel">${v?escHtml(v.titel):z.vorlagenId}</div>
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
  let feldHtml='';
  if (form.felder && vorlage) {
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
  document.getElementById('detail-body').innerHTML = `
    <div class="card">
      <div class="card-title">${vorlage?escHtml(vorlage.titel):zuwId}</div>
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
    return `<div class="schulung-item">
      <div>
        <div class="titel">${v?escHtml(v.titel):z.vorlagenId}</div>
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
  document.getElementById('az-vorlage-selected-label').textContent = `📄 ${titel}`;
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

  if (!gefiltert.length) {
    el.innerHTML = `<div style="padding:16px;text-align:center;color:#9ca3af;font-size:.85rem">${s ? `Keine Vorlage für „${escHtml(s)}"` : 'Keine Vorlagen vorhanden'}</div>`;
    return;
  }

  el.innerHTML = gefiltert.map((v, i) => `
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
  const neu = tenants.map(tid => ({ id:`z_${tid}_${vorlagenId}_${Date.now()}`, vorlage_id:vorlagenId, tenant_id:tid, frist, pflicht }));
  try {
    await SB.post('zuweisungen', neu);
    neu.forEach(z => zuweisungen.push({ id:z.id, vorlagenId:z.vorlage_id, tenantId:z.tenant_id, frist:z.frist, pflicht:z.pflicht }));
    await sbAudit('ZUWEISUNG', `Vorlage "${vorlagenId}" → ${tenants.join(',')} (Frist: ${frist})`);
    msgEl.textContent=`${tenants.length} Zuweisung(en) erstellt.`; msgEl.style.color='';
    msgEl.classList.add('show'); setTimeout(()=>msgEl.classList.remove('show'),3000);
    renderAdminZuweisungen(); renderAdminStats(); renderAdminTenantTable();
  } catch(e) { msgEl.textContent='Fehler: '+e.message; msgEl.style.color='#dc2626'; msgEl.classList.add('show'); }
}
async function deleteZuweisung(id) {
  // Sicherheitsprüfung: abgeschlossene Formulare NICHT löschen
  const form = formulare[id];
  if (form && form.abgeschlossen) {
    alert('⚠️ Diese Zuweisung kann nicht gelöscht werden, da bereits ein ausgefülltes Formular existiert.\n\nAbgeschlossene Schulungsnachweise dürfen nicht entfernt werden (Dokumentationspflicht).');
    return;
  }
  const hatEintrag = form && form.gestartet;
  const warnung = hatEintrag
    ? 'Zuweisung löschen?\n\n⚠️ Es gibt bereits einen begonnenen Eintrag. Dieser wird ebenfalls gelöscht.'
    : 'Zuweisung wirklich löschen?';
  if (!confirm(warnung)) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/zuweisungen?id=eq.${id}`, { method:'DELETE', headers:SB.h });
    await fetch(`${SUPABASE_URL}/rest/v1/formulare?id=eq.${id}`,   { method:'DELETE', headers:SB.h });
    zuweisungen = zuweisungen.filter(z=>z.id!==id);
    delete formulare[id];
    await sbAudit('LOESCHEN',`Zuweisung ${id} gelöscht`);
    renderAdminZuweisungen(); renderAdminStats(); renderAdminTenantTable();
  } catch(e) { alert('Fehler: '+e.message); }
}

// ══════════════════════════════════════════════════════════════
//  UNTERNEHMEN DASHBOARD
// ══════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════
//  MITARBEITERLISTE (Verantwortlicher)
// ══════════════════════════════════════════════════════════════
// ── MITARBEITER: AKTIV/PASSIV/ARCHIV ───────────────────────────
async function mitarbeiterToggleAktiv(userId, jetztAktiv) {
  if (!confirm(jetztAktiv
    ? 'Mitarbeiter auf PASSIV setzen? Er erhält dann keine neuen Schulungen.'
    : 'Mitarbeiter wieder auf AKTIV setzen?')) return;
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
}

async function mitarbeiterArchivieren(userId, name) {
  if (!confirm(`Mitarbeiter „${name}" wirklich archivieren?\n\nEr wird aus der aktiven Liste entfernt und im Archiv gespeichert.`)) return;
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
      }
    } catch(e) { /* ignorieren, kein Datenverlust */ }

    // Pro Mitarbeiter: Ampelstatus aus seinen abgeschlossenen Formularen ableiten
    const rows = mitarbeiter.map(m => {
      // SICHERHEIT: Nur Formulare aus Zuweisungen des eigenen Tenants zählen
      const mFormulare = Object.entries(formulare)
        .filter(([zuwId, f]) => {
          const zuw = meineZuws.find(z => z.id === zuwId);
          return zuw && zuw.tenantId === currentUser.tenantId && f.abgeschlossenVon === m.id;
        });

      const gesamtZuws  = meineZuws.length;
      const abgeschl    = mFormulare.filter(([,f]) => f.abgeschlossen).length;
      const gestartet   = mFormulare.filter(([,f]) => f.gestartet && !f.abgeschlossen).length;
      const offen       = Math.max(0, gesamtZuws - abgeschl - gestartet);

      // Pro Zuweisung: Status für diesen Mitarbeiter ermitteln
      const unterweisungsZeilen = meineZuws.map(z => {
        const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
        const titel = v ? v.titel : z.vorlagenId;
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
                <div style="font-size:.72rem;font-weight:700;color:#0f5132;margin-bottom:4px">✅ Lernpfad vollständig unterzeichnet</div>
                <div style="font-size:.7rem;color:#166534;line-height:1.6">
                  👤 MA: <b>${escHtml(lpUnt.vollname)}</b> · ${maDatum}<br>
                  🧑‍💼 Verantw.: <b>${escHtml(lpUnt.verantwortlicher_name)}</b> · ${vDatum}
                </div>
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
        <div onclick="mitarbeiterDetailOeffnen('${m.id}')" style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;padding:12px 14px;
                    display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;cursor:pointer;
                    ${istArchiviert?'opacity:0.7':''}transition:box-shadow .15s" 
             onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.10)'" 
             onmouseout="this.style.boxShadow=''">
          <div style="font-size:1.3rem;flex-shrink:0;padding-top:2px">${c.dot}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.92rem;color:#1e3a5f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escHtml(m.name)}
            </div>
            <div style="font-size:.78rem;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escHtml(m.email)}
            </div>
            ${(m.standort||m.bereich) ? `<div style="font-size:.75rem;color:#4b5563;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap">
              ${m.standort ? `<span>📍 ${escHtml(m.standort)}</span>` : ''}
              ${m.bereich  ? `<span>🏷 ${escHtml(m.bereich)}</span>` : ''}
            </div>` : ''}
            <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
              ${btnToggle}${btnArchiv}${btnQr}${btnHistorie}
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div style="font-size:.78rem;font-weight:700;color:${c.text}">${c.label}</div>
            ${gesamtZuws > 0 && !istArchiviert ? `<div style="font-size:.72rem;color:#6b7280;margin-top:2px">
              🟢 ${abgeschl} · 🟡 ${gestartet} · 🔴 ${offen}
            </div>` : ''}
          </div>
        </div>
        ${gesamtZuws > 0 && !istArchiviert ? `
        <div style="margin-top:6px;padding:8px 10px;background:rgba(255,255,255,.6);border-radius:7px;border:1px solid rgba(0,0,0,.06)">
          ${unterweisungsZeilen}
        </div>` : ''}
        ${lpUntBlock}
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
    // Kein Intervall → Verantwortlicher gibt Datum ein
    neueFrist = prompt(`Neue Frist für „${v?.titel}" eingeben (Format: JJJJ-MM-TT):`,
      new Date(Date.now() + 365*86400000).toISOString().split('T')[0]);
    if (!neueFrist) return;
  }

  if (!confirm(`Neue Schulungsrunde starten?\n\nFormular: ${v?.titel}\nNeue Frist: ${neueFrist}\n\nDas bisherige abgeschlossene Formular bleibt im Archiv erhalten.`)) return;

  try {
    // Neues Formular-ID (bisheriges Formular bleibt erhalten)
    const neueZuwId = `z_${z.tenantId}_${z.vorlagenId}_${Date.now()}`;
    // Neue Zuweisung anlegen
    await fetch(`${SUPABASE_URL}/rest/v1/zuweisungen`, {
      method: 'POST',
      headers: { ...SB.h, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        id: neueZuwId,
        vorlage_id: z.vorlagenId,
        tenant_id: z.tenantId,
        frist: neueFrist,
        pflicht: z.pflicht,
        intervall_monate: z.intervallMonate || null
      })
    });
    zuweisungen.push({
      id: neueZuwId,
      vorlagenId: z.vorlagenId,
      tenantId: z.tenantId,
      frist: neueFrist,
      pflicht: z.pflicht,
      intervallMonate: z.intervallMonate || null
    });
    formulare[neueZuwId] = {};
    await sbAudit('SCHULUNG_NEU_GESTARTET', `Neue Runde: ${v?.titel} (Frist: ${neueFrist})`);
    showToast(`✅ Neue Schulungsrunde gestartet — Frist: ${neueFrist}`, '#16a34a');
    renderSubDashboard();
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

function renderSubDashboard() {
  const tenant = APP_TENANTS.find(t=>t.id===currentUser.tenantId);
  document.getElementById('sub-username').textContent   = currentUser.name;
  document.getElementById('sub-tenantname').textContent = tenant ? tenant.name : '';
  const meineZuws = zuweisungen.filter(z=>z.tenantId===currentUser.tenantId);
  const stati = meineZuws.map(z=>berechneStatus(z));
  const g=stati.filter(s=>s==='gruen').length, y=stati.filter(s=>s==='gelb').length, r=stati.filter(s=>s==='rot').length;
  document.getElementById('sub-stats').innerHTML = `
    <div class="stat-tile gruen"><div class="zahl">${g}</div><div class="label">Abgeschlossen</div></div>
    <div class="stat-tile gelb"><div class="zahl">${y}</div><div class="label">In Bearbeitung</div></div>
    <div class="stat-tile rot"><div class="zahl">${r}</div><div class="label">Offen / Dringend</div></div>`;
  // Buttons für Mitarbeiter-Rolle ausblenden (nur Unterweisungsthemen anzeigen)
  const isMitarbeiter = currentUser.role === 'mitarbeiter';
  const maBtns = document.getElementById('sub-ma-buttons');
  const kalBtns = document.getElementById('sub-kalender-buttons');
  if (maBtns) maBtns.style.display = isMitarbeiter ? 'none' : '';
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
  // Mitarbeiterliste rendern (nur für Verantwortliche)
  renderMitarbeiterListe();
  document.getElementById('sub-schulungen-list') && (document.getElementById('sub-schulungen-list').innerHTML = '');
  if (!meineZuws.length) return;
  // Schulungsliste intern verfügbar (für PDF etc.), aber nicht mehr im UI angezeigt
  // Der "Unterweisungsthemen"-Button wurde entfernt — Inhalte sind im Lernpfad abgebildet.
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
  const zuw=zuweisungen.find(z=>z.id===activeZuwId), vorlage=SCHULUNG_VORLAGEN.find(v=>v.id===zuw.vorlagenId);
  const tenant=APP_TENANTS.find(t=>t.id===zuw.tenantId);
  const ts=now();
  closeModal();
  await saveFormularToDB(felder, true, ts, currentUser.id);
  await sbAudit('ABSCHLUSS', `Schulung "${vorlage.titel}" abgeschlossen (${zuw.tenantId})`);
  // Push-Benachrichtigung senden
  pushSchulungsAbschluss(vorlage, tenant);
  // PDF generieren und zu Supabase Storage hochladen
  generatePdf(activeZuwId, false);
  setTimeout(() => {
    if (currentUser.role==='admin') { renderAdminDashboard(); showScreen('screen-admin'); }
    else { renderSubDashboard(); showScreen('screen-sub'); }
  }, 1500);
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
  if (!downloadOnly && form.abgeschlossen) {
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

  msgEl.style.color = '#2563eb';
  msgEl.textContent = '⏳ Wird angelegt …';

  try {
    // 1. Tenant anlegen
    const tenantId = 'tenant_' + Date.now();
    const tRes = await SB.post('tenants', { id: tenantId, name });
    if (tRes.error) throw new Error('Tenant: ' + (tRes.error.message || JSON.stringify(tRes.error)));

    // 2. Passwort hashen (bcrypt)
    const hash = await hashPasswort(passwort);

    // 3. User (Verantwortlicher) anlegen
    const userId = 'user_' + Date.now();
    const uRes = await SB.post('users', {
      id: userId,
      name: kontakt,
      email,
      password_hash: hash,
      role: 'verantwortlicher',
      tenant_id: tenantId
    });
    if (uRes.error) throw new Error('User: ' + (uRes.error.message || JSON.stringify(uRes.error)));

    // 4. App-State aktualisieren
    APP_TENANTS.push({ id: tenantId, name });
    await sbAudit('UNTERNEHMEN_NEU', `Unternehmen "${name}" angelegt, Verantwortlicher: ${email}`);

    msgEl.style.color = '#16a34a';
    msgEl.textContent = `✅ "${name}" erfolgreich angelegt! Login: ${email} / ${passwort}`;

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

    // Mitarbeiterliste aktualisieren
    renderMitarbeiterListe();

    // Ergebnis anzeigen
    document.getElementById('einzel-formular').style.display = 'none';
    document.getElementById('einzel-ergebnis-daten').innerHTML =
      `<div style="margin-bottom:6px"><strong>Name:</strong> ${name}</div>` +
      `<div style="margin-bottom:6px"><strong>E-Mail:</strong> ${email}</div>` +
      (standort ? `<div style="margin-bottom:6px"><strong>Standort:</strong> ${escHtml(standort)}</div>` : '') +
      (bereich  ? `<div style="margin-bottom:6px"><strong>Bereich:</strong> ${escHtml(bereich)}</div>` : '') +
      `<div><strong>Passwort:</strong> <code style="background:#dcfce7;padding:2px 6px;border-radius:4px;font-size:.9rem">${pw}</code></div>`;
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
  // Wird beim Admin-Login aufgerufen — prüft ob Schulungen erneut zugewiesen werden müssen
  if (currentUser?.role !== 'admin') return;
  const jetzt = new Date();
  const neuZuweisungen = [];

  for (const zuw of zuweisungen) {
    const form = formulare[zuw.id];
    if (!form?.abgeschlossen || !form.abgeschlossenAm) continue;

    const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
    if (!vorlage?.intervallMonate || vorlage.intervallMonate <= 0) continue;

    // Nächste Fälligkeit berechnen
    const abgeschlossenAm = new Date(form.abgeschlossenAm);
    const naechsteFaelligkeit = new Date(abgeschlossenAm);
    naechsteFaelligkeit.setMonth(naechsteFaelligkeit.getMonth() + vorlage.intervallMonate);

    // Frist 30 Tage vor Fälligkeit — beginne Benachrichtigung
    const erinnerungAb = new Date(naechsteFaelligkeit);
    erinnerungAb.setDate(erinnerungAb.getDate() - 30);

    if (jetzt >= erinnerungAb) {
      // Prüfen ob es bereits eine neue Zuweisung für diese Vorlage+Tenant gibt, die neuere Frist hat
      const neuereFrist = zuw.frist ? new Date(zuw.frist) : null;
      const hatNeueZuweisung = zuweisungen.some(z =>
        z.id !== zuw.id &&
        z.vorlagenId === zuw.vorlagenId &&
        z.tenantId === zuw.tenantId &&
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
  const el = document.getElementById('wiederkehrende-hinweise');
  if (!el) return;

  const html = liste.map(({ vorlage, zuw, naechsteFaelligkeit }) => {
    const tenant = APP_TENANTS.find(t => t.id === zuw.tenantId);
    const fristStr = naechsteFaelligkeit.toISOString().slice(0, 10);
    return `<div style="padding:10px 14px;border-bottom:1px solid #fde68a;display:flex;align-items:center;gap:12px">
      <div style="font-size:1.2rem">🔄</div>
      <div style="flex:1">
        <div style="font-size:.88rem;font-weight:600">${escHtml(vorlage.titel)}</div>
        <div style="font-size:.76rem;color:#92400e">${escHtml(tenant?.name||'')} • Nächste Fälligkeit: ${new Date(fristStr).toLocaleDateString('de-DE')}</div>
      </div>
      <button onclick="wiederkehrendeZuweisen('${zuw.vorlagenId}','${zuw.tenantId}','${fristStr}')" class="btn btn-sm" style="background:#f59e0b;color:#fff;font-size:.72rem;white-space:nowrap">➕ Neu zuweisen</button>
    </div>`;
  }).join('');

  el.innerHTML = `<div class="card" style="margin-bottom:14px;border:2px solid #fde68a;background:#fffbeb">
    <div class="card-title" style="color:#92400e">🔄 Wiederkehrende Schulungen fällig (${liste.length})</div>
    ${html}
  </div>`;
  el.style.display = '';
}

async function wiederkehrendeZuweisen(vorlagenId, tenantId, frist) {
  const id = 'zuw_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  try {
    const res = await SB.post('zuweisungen', {
      id, vorlage_id: vorlagenId, tenant_id: tenantId, frist, pflicht: true
    });
    if (res?.error) throw new Error(res.error.message);
    zuweisungen.push({ id, vorlagenId, tenantId, frist, pflicht: true });
    formulare[id] = {};
    await sbAudit('WIEDERKEHREND_NEU', `Wiederkehrende Zuweisung: ${vorlagenId} → ${tenantId}, Frist: ${frist}`);
    showToast('✅ Neue Zuweisung erstellt!', '#16a34a');
    // Hinweis entfernen
    const btn = event?.target;
    if (btn) btn.closest('div[style*="padding"]')?.remove();
    renderAdminStats();
    renderAdminTenantTable();
    renderAdminZuweisungen();
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
const EDGE_FN_URL = 'https://vziankbxuiqwekdbjewg.supabase.co/functions/v1/send-email';
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
    // Alle abgeschlossenen Formulare für diesen User laden
    const alleFormulare = await SB.get('formulare',
      `abgeschlossen_von=eq.${encodeURIComponent(userId)}&order=abgeschlossen_am.desc&limit=100`
    );

    // Lernpfad-Unterschrift für diesen Mitarbeiter laden
    const lpUntRow = await lernpfadUnterschriftFuerMA(userId, currentUser.tenantId);

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
            <div style="font-size:1rem;font-weight:700;color:#fff">📚 22-Kapitel Lernpfad — Unterschriften</div>
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
      <div style="margin-bottom:10px;font-size:.85rem;color:#6b7280">${alleFormulare.length} Schulung${alleFormulare.length !== 1 ? 'en' : ''} abgeschlossen</div>
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
  if (!vorlagen.length) {
    el.innerHTML = '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:.84rem">Keine Schulungsvorlagen verfügbar</div>';
    return;
  }
  const gef = s ? vorlagen.filter(v => v.titel.toLowerCase().includes(s) || (v.beschreibung||'').toLowerCase().includes(s)) : vorlagen;
  if (!gef.length) {
    el.innerHTML = `<div style="padding:12px;text-align:center;color:#9ca3af;font-size:.84rem">Keine Vorlage für „${escHtml(s)}"</div>`;
    return;
  }
  el.innerHTML = gef.map((v, i) => `
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


// ── KALENDER: Detailansicht einer Zuweisung (alle betroffenen Mitarbeiter) ──
function kalenderEintragDetail(zuwId) {
  const z = zuweisungen.find(zw => zw.id === zuwId);
  if (!z) return;
  const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
  const t = APP_TENANTS.find(tn => tn.id === z.tenantId);
  const titel = v?.titel || z.vorlagenId;
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

const LP_STORAGE_KEY = () => `lernpfad_${currentUser?.id || 'anon'}`;
const SAEULE_FARBEN = { A: '#1a3a5c', B: '#7c3aed', C: '#b45309' };
const SAEULE_LABEL  = { A: '🛡 Säule A — Gesetzliche Basis', B: '🧪 Säule B — Reinigungstechnologie', C: '🔒 Säule C — Datenschutz & DSGVO' };

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
    de: '✍️ Die Unterzeichnung wird freigeschaltet, wenn alle 22 Kapitel abgehakt wurden.',
    tr: '✍️ İmzalama seçeneği, tüm 22 bölüm işaretlendiğinde etkinleştirilecektir.',
    ro: '✍️ Semnarea va fi activată după ce toate cele 22 de capitole au fost bifate.',
    sr: '✍️ Потписивање ће бити омогућено када се означе сва 22 поглавља.',
    pl: '✍️ Możliwość podpisania zostanie odblokowana po odhaczeniu wszystkich 22 rozdziałów.',
    en: '✍️ Signing will be unlocked once all 22 chapters have been checked off.',
    ar: '✍️ سيتم تفعيل التوقيع بعد الانتهاء من جميع الفصول الـ 22.'
  },
  hinweis_komplett: {
    de: '🎉 Alle 22 Kapitel abgeschlossen! Bitte jetzt unterzeichnen.',
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
  // 1. Aus localStorage (sofort, offline-fähig)
  try {
    const stored = localStorage.getItem(LP_STORAGE_KEY());
    if (stored) lernpfadFortschritt = JSON.parse(stored);
  } catch(e) {}

  // 2. Aus Supabase (wenn online — überschreibt localStorage bei Konflikten)
  try {
    const rows = await SB.select('lernpfad_fortschritt',
      `user_id=eq.${currentUser.id}&tenant_id=eq.${currentUser.tenantId || ''}`);
    if (rows && rows.length) {
      rows.forEach(r => {
        lernpfadFortschritt[r.kapitel_id] = {
          abgehakt:     r.abgehakt,
          abgehaktAm:   r.abgehakt_am,
          bestaetigtAm: r.bestaetigt_am,
          bestaetigtVon:r.bestaetigt_von
        };
      });
      // Lokal synchronisieren
      localStorage.setItem(LP_STORAGE_KEY(), JSON.stringify(lernpfadFortschritt));
    }
  } catch(e) {
    // Offline — localStorage-Daten reichen für die Anzeige
  }

  // 3. Unterschrift laden (aus Supabase)
  await lernpfadUnterschriftLaden();
}

// ── Unterschrift laden ──────────────────────────────────────
async function lernpfadUnterschriftLaden() {
  try {
    const rows = await SB.select('lernpfad_unterschriften',
      `user_id=eq.${currentUser.id}&tenant_id=eq.${currentUser.tenantId || ''}`);
    if (rows && rows.length) {
      lernpfadUnterschrift = {
        vollname:              rows[0].vollname,
        unterzeichnetAm:       rows[0].unterzeichnet_am,
        verantwortlicherId:    rows[0].verantwortlicher_id,
        verantwortlicherName:  rows[0].verantwortlicher_name,
        verantwortlicherAm:    rows[0].verantwortlicher_am
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
    const rows = await SB.select('lernpfad_unterschriften',
      `user_id=eq.${userId}&tenant_id=eq.${encodeURIComponent(tenantId || '')}`);
    if (rows && rows.length) return rows[0];
    return null;
  } catch(e) { return null; }
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

  const verantwortlicherName = currentUser.name;
  const ts = now();
  const datumAnzeige = new Date().toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  if (!confirm(`Lernpfad von „${ma.name}" als Verantwortlicher unterzeichnen?\n\nIhre Unterschrift:\n${verantwortlicherName}\n${datumAnzeige}`)) return;

  try {
    await SB.upsert('lernpfad_unterschriften', {
      id:                   userId,        // selber Primary Key wie MA-Unterschrift
      user_id:              userId,
      tenant_id:            currentUser.tenantId || '',
      vollname:             existing.vollname,
      unterzeichnet_am:     existing.unterzeichnet_am,
      verantwortlicher_id:  currentUser.id,
      verantwortlicher_name: verantwortlicherName,
      verantwortlicher_am:  ts,
      aktualisiert_am:      ts
    });

    await sbAudit('LERNPFAD_V_UNTERZEICHNET',
      `Lernpfad von ${ma.name} durch Verantwortlichen ${verantwortlicherName} unterzeichnet`);
    showToast(`✅ Lernpfad von ${ma.name} unterzeichnet!`, '#0f5132');
    renderMitarbeiterListe(); // Ansicht aktualisieren
  } catch(e) {
    showToast('❌ Fehler: ' + e.message, '#dc2626');
  }
}

// ── Jetzt unterzeichnen ─────────────────────────────────────
async function lernpfadUnterzeichnen() {
  const gesamt   = LERNPFAD_KAPITEL.length;
  const bestanden = LERNPFAD_KAPITEL.filter(k => lernpfadFortschritt[k.id]?.abgehakt).length;
  if (bestanden < gesamt) {
    showToast('⚠️ Bitte zuerst alle Kapitel abhaken!', '#f59e0b');
    return;
  }

  const vollname = currentUser.name;
  const ts       = now();

  // Confirm-Dialog
  if (!confirm(`Als „${vollname}" unterzeichnen?\n\nDatum/Uhrzeit: ${new Date().toLocaleString('de-DE')}`)) return;

  try {
    await SB.upsert('lernpfad_unterschriften', {
      id:               currentUser.id,
      user_id:          currentUser.id,
      tenant_id:        currentUser.tenantId || '',
      vollname:         vollname,
      unterzeichnet_am: ts,
      alle_kapitel_am:  ts,
      aktualisiert_am:  ts
    });

    lernpfadUnterschrift = { vollname, unterzeichnetAm: ts };
    await sbAudit('LERNPFAD_UNTERZEICHNET', `Lernpfad unterzeichnet von ${vollname}`);
    showToast('✅ Lernpfad erfolgreich unterzeichnet!', '#0f5132');
    renderLernpfad();
  } catch(e) {
    showToast('❌ Fehler beim Speichern: ' + e.message, '#dc2626');
  }
}

// ── Kapitel abhaken / Haken entfernen ────────────────────────
async function lernpfadKapitelToggle(kapitelId) {
  const kap = LERNPFAD_KAPITEL.find(k => k.id === kapitelId);
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
      id:          `${currentUser.id}_${kapitelId}`,
      user_id:     currentUser.id,
      tenant_id:   currentUser.tenantId || '',
      kapitel_id:  kapitelId,
      abgehakt:    neu,
      abgehakt_am: neu ? ts : null,
      bestaetigt_am:  null,
      bestaetigt_von: null
    });
    await sbAudit(
      neu ? 'LERNPFAD_ABGEHAKT' : 'LERNPFAD_HAKEN_ENTFERNT',
      `Kapitel ${kap.nr}: "${kap.titel}"`
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
    if (userId === currentUser.id) {
      lernpfadFortschritt[kapitelId] = { abgehakt: true, abgehaktAm: ts, bestaetigtAm: ts, bestaetigtVon: currentUser.id };
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
function renderLernpfad() {
  const cont = document.getElementById('lernpfad-container');
  if (!cont) return;
  const isVerantwortlicher = currentUser.role === 'verantwortlicher';

  // Fortschrittsbalken oben
  const gesamt   = LERNPFAD_KAPITEL.length;
  const bestanden = LERNPFAD_KAPITEL.filter(k => lernpfadFortschritt[k.id]?.abgehakt).length;
  const pct      = Math.round(bestanden / gesamt * 100);
  const alle22   = bestanden === gesamt;

  let html = `
    <div style="background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);overflow:hidden;margin-bottom:10px">
      <div style="padding:14px 16px;background:#0f5132;color:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:.95rem">📚 Lernpfad</span>
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
      </div>
      ${alle22 ? `<div style="padding:10px 16px;background:#f0fdf4;border-bottom:1px solid #bbf7d0;font-size:.82rem;color:#166534;font-weight:600">
        🎓 Lernpfad abgeschlossen! ${isVerantwortlicher ? 'Zertifikat kann ausgestellt werden.' : (lernpfadUnterschrift ? '✅ Unterzeichnet.' : 'Bitte jetzt unterzeichnen ↓')}
      </div>` : ''}
    </div>`;

  // Pro Säule gruppiert
  ['A','B','C'].forEach(saeule => {
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
        aktionsBtn = `<button onclick="lernpfadBestaetigen('${kap.id}','${currentUser.id}')"
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
  if (sub) sub.textContent = `${bestanden}/${gesamt} Kapitel — Tippen zum Anzeigen`;
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
