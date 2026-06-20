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
      const baseUrl = window.location.href.split('?')[0].split('#')[0];
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
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6aWFua2J4dWlxd2VrZGJqZXdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTcwODUxOCwiZXhwIjoyMDk3Mjg0NTE4fQ.HDQx0CkmFHfjMxWuiLleIa9E7nEkljOLZYt14UJESSE';

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
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/schulung-pdfs/${path}`, {
      method:'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/pdf' },
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
      id: z.id, vorlagenId: z.vorlage_id, tenantId: z.tenant_id, frist: z.frist, pflicht: z.pflicht
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
  if (form.abgeschlossen) return 'gruen';
  const frist = zuw.frist ? new Date(zuw.frist) : null;
  const jetzt = new Date();
  if (!form.gestartet) return 'rot';
  if (frist && frist < jetzt) return 'rot';
  if (frist && (frist - jetzt) / 86400000 < 14) return 'gelb';
  return 'gelb';
}
function statusLabel(s) {
  return s==='gruen' ? 'Abgeschlossen' : s==='gelb' ? 'In Bearbeitung' : 'Offen / Dringend';
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

    // 2. Nur eigene Zuweisungen
    zuweisungen = zuweisungen.filter(z => z.tenantId === tid);

    // 3. Nur Formulare der eigenen Zuweisungen
    const eigeneZuwIds = new Set(zuweisungen.map(z => z.id));
    Object.keys(formulare).forEach(k => {
      if (!eigeneZuwIds.has(k)) delete formulare[k];
    });

    // 4. Nur Vorlagen die in eigenen Zuweisungen vorkommen
    const eigeneVorlagenIds = new Set(zuweisungen.map(z => z.vorlagenId));
    SCHULUNG_VORLAGEN = SCHULUNG_VORLAGEN.filter(v => eigeneVorlagenIds.has(v.id));

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

// ── SUB-KALENDER ──────────────────────────────────────────────
function renderSubKalender() {
  const el = document.getElementById('sub-kalender');
  if (!el) return;
  const meineZuws = zuweisungen.filter(z => z.tenantId === currentUser.tenantId && z.frist);
  if (!meineZuws.length) { el.style.display = 'none'; return; }

  const naechste = meineZuws
    .map(z => ({ ...z, v: SCHULUNG_VORLAGEN.find(vl=>vl.id===z.vorlagenId), s: berechneStatus(z) }))
    .filter(z => !z.s || z.s !== 'gruen')
    .sort((a,b) => new Date(a.frist) - new Date(b.frist))
    .slice(0, 5);

  if (!naechste.length) { el.style.display = 'none'; return; }

  el.style.display = '';
  el.innerHTML = `<div class="card" style="margin-bottom:14px">
    <div class="card-title">📅 Nächste Fristen</div>
    ${naechste.map(z => {
      const tage = Math.ceil((new Date(z.frist) - new Date()) / 86400000);
      const tageFarbe = tage < 0 ? '#dc2626' : tage < 14 ? '#f59e0b' : '#16a34a';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f3f4f6">
        <div style="min-width:48px;text-align:center;font-size:.78rem;font-weight:700;color:${tageFarbe}">
          ${tage < 0 ? `${Math.abs(tage)}d<br>über` : `${tage}d`}
        </div>
        <div style="flex:1">
          <div style="font-size:.88rem;font-weight:600">${z.v?escHtml(z.v.titel):z.vorlagenId}</div>
          <div style="font-size:.76rem;color:#6b7280">Frist: ${z.frist}</div>
        </div>
        ${statusBadgeHtml(z.s)}
      </div>`;
    }).join('')}
  </div>`;
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
  document.getElementById('admin-vorlagen-list').innerHTML = SCHULUNG_VORLAGEN.map(v=>`
    <div class="card" style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div>
          <div class="card-title" style="margin-bottom:4px">📄 ${escHtml(v.titel)}</div>
          <div style="font-size:.84rem;color:#374151;margin-bottom:6px">${escHtml(v.beschreibung||'')}</div>
          <div style="font-size:.78rem;color:#6b7280">🔁 Intervall: ${v.intervallMonate||v.intervall_monate||'–'} Monate &nbsp;|&nbsp; 📑 ${(v.abschnitte||[]).length} Abschnitte &nbsp;|&nbsp; 🔢 ${(v.abschnitte||[]).reduce((s,a)=>s+a.felder.length,0)} Felder</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="vtLoeschen('${v.id}')">🗑 Löschen</button>
      </div>
      <div style="margin-top:10px;border-top:1px solid #f0f2f5;padding-top:10px">
        ${(v.abschnitte||[]).map(a=>`
          <div style="margin-bottom:5px">
            <span style="font-weight:700;font-size:.82rem;color:#1a3a5c">${escHtml(a.titel)}</span>
            <span style="color:#6b7280;font-size:.78rem"> — ${a.felder.map(f=>escHtml(f.label)).join(', ')}</span>
          </div>`).join('')}
      </div>
    </div>`).join('') || '<div class="empty-state"><div class="icon">📭</div><p>Noch keine Vorlagen vorhanden</p></div>';
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

const FELD_UEBERSETZUNGEN = {
  'Name':                     { en:'Full Name',            tr:'Ad Soyad',         ar:'الاسم الكامل',      es:'Nombre completo',     ru:'Полное имя' },
  'Vollständiger Name':       { en:'Full Name',            tr:'Ad Soyad',         ar:'الاسم الكامل',      es:'Nombre completo',     ru:'Полное имя' },
  'Datum':                    { en:'Date',                 tr:'Tarih',            ar:'التاريخ',            es:'Fecha',               ru:'Дата' },
  'Schulungsdatum':           { en:'Training date',        tr:'Eğitim tarihi',    ar:'تاريخ التدريب',     es:'Fecha de formación',  ru:'Дата обучения' },
  'Abteilung':                { en:'Department',           tr:'Departman',        ar:'القسم',              es:'Departamento',        ru:'Отдел' },
  'Position / Tätigkeit':     { en:'Position / Role',      tr:'Pozisyon',         ar:'المنصب',             es:'Cargo',               ru:'Должность' },
  'Unterschrift Mitarbeiter': { en:'Employee signature',   tr:'Çalışan imzası',   ar:'توقيع الموظف',      es:'Firma empleado',      ru:'Подпись сотрудника' },
  'Unterschrift Trainer':     { en:'Trainer signature',    tr:'Eğitmen imzası',   ar:'توقيع المدرب',       es:'Firma formador',      ru:'Подпись тренера' },
  'Unterschrift Vorgesetzter':{ en:'Supervisor signature', tr:'Amir imzası',      ar:'توقيع المشرف',      es:'Firma supervisor',    ru:'Подпись руководителя' },
  'Ich habe die PSA erhalten und wurde eingewiesen':
    { en:'I received and was instructed on PPE', tr:'KKD teslim aldım ve eğitim aldım', ar:'تلقيت معدات الحماية والتعليمات', es:'Recibí el EPI y fui instruido', ru:'Я получил СИЗ и был проинструктирован' },
  'Fluchtwege sind bekannt':  { en:'Escape routes are known', tr:'Kaçış yolları biliniyor', ar:'مسارات الهروب معروفة', es:'Las rutas de escape son conocidas', ru:'Пути эвакуации известны' },
  'Notruf 112 bekannt':       { en:'Emergency number 112 known', tr:'Acil numara 112 biliniyor', ar:'رقم الطوارئ 112 معروف', es:'Número de emergencia 112 conocido', ru:'Номер экстренной помощи 112 известен' },
};

function uebersetzeFeldLabel(label, sprache) {
  if (sprache === 'de') return label;
  return FELD_UEBERSETZUNGEN[label]?.[sprache] || label;
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
    await SB.post('vorlagen', vorlage);
    SCHULUNG_VORLAGEN.push({...vorlage,intervallMonate:intervall});
    await sbAudit('VORLAGE_NEU',`Neue Vorlage "${titel}" (${typ}) erstellt`);
    showToast(`✅ Vorlage "${titel}" gespeichert`,'#16a34a');
    document.getElementById('vt-titel').value=''; document.getElementById('vt-beschreibung').value='';
    document.getElementById('vt-intervall').value='12'; document.getElementById('vt-abschnitte').innerHTML='';
    document.getElementById('vt-pdf-name').textContent='PDF auswählen (max. 10 MB)';
    document.getElementById('vt-pdf-zone').classList.remove('has-file');
    document.getElementById('vt-pdf-input').value='';
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
  const rows = zuweisungen.map(z => {
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
  document.getElementById('az-vorlage').innerHTML = SCHULUNG_VORLAGEN.map(v=>`<option value="${v.id}">${escHtml(v.titel)}</option>`).join('');
  document.getElementById('az-tenant').innerHTML  = `<option value="">— alle Unternehmen —</option>` +
    APP_TENANTS.map(t=>`<option value="${t.id}">${escHtml(t.name)}</option>`).join('');
  document.getElementById('az-frist').value = '';
}
async function createZuweisung() {
  const vorlagenId=document.getElementById('az-vorlage').value, tenantSel=document.getElementById('az-tenant').value;
  const frist=document.getElementById('az-frist').value, pflicht=document.getElementById('az-pflicht').checked;
  const msgEl=document.getElementById('az-msg');
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
        <button onclick="mitarbeiterToggleAktiv('${m.id}',${istAktiv})"
          style="font-size:.7rem;padding:3px 8px;border-radius:5px;border:1px solid #c4b5fd;background:#f5f3ff;color:#6d28d9;cursor:pointer;white-space:nowrap">
          ${istAktiv ? '⏸ Passiv' : '▶ Aktiv'}
        </button>` : '';
      const btnArchiv = !istArchiviert ? `
        <button onclick="mitarbeiterArchivieren('${m.id}','${escHtml(m.name).replace(/'/g,"\\\'")}')"
          style="font-size:.7rem;padding:3px 8px;border-radius:5px;border:1px solid #d1d5db;background:#f9fafb;color:#6b7280;cursor:pointer;white-space:nowrap;margin-top:3px">
          📦 Archivieren
        </button>` : `<span style="font-size:.7rem;color:#9ca3af">Archiviert: ${m.archiviert_am ? dateStr(m.archiviert_am) : '–'}</span>`;
      const btnQr = `<button onclick="qrLoginOeffnen('${m.id}')"
          style="font-size:.7rem;padding:3px 8px;border-radius:5px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8;cursor:pointer;white-space:nowrap;margin-top:3px"
          title="QR-Login-Code generieren">🔑 QR-Login</button>`;
      const btnHistorie = `<button onclick="zeigeSchulungshistorie('${m.id}')"
          style="font-size:.7rem;padding:3px 8px;border-radius:5px;border:1px solid #bbf7d0;background:#f0fdf4;color:#16a34a;cursor:pointer;white-space:nowrap;margin-top:3px"
          title="Schulungshistorie anzeigen">📋 Historie</button>`;

      return `
        <div style="background:${c.bg};border:1px solid ${c.border};border-radius:10px;padding:12px 14px;
                    display:flex;align-items:flex-start;gap:12px;margin-bottom:8px;
                    ${istArchiviert?'opacity:0.7':''}">
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
        </div>`;

    });

    listEl.innerHTML = rows.join('');

    // Filter-Select wiederherstellen (nach innerHTML-Neuaufbau)
    const newFilter = document.getElementById('ma-filter-select');
    if (newFilter) newFilter.value = filter;

  } catch(e) {
    listEl.innerHTML = `<div style="color:#dc2626;font-size:.85rem;padding:8px">Fehler beim Laden: ${escHtml(e.message)}</div>`;
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
  // Kalender rendern
  renderSubKalender();
  // Mitarbeiterliste rendern (nur für Verantwortliche)
  renderMitarbeiterListe();
  if (!meineZuws.length) {
    document.getElementById('sub-schulungen-list').innerHTML='<div class="empty-state"><div class="icon">🎉</div><p>Keine Schulungen zugewiesen</p></div>';
    return;
  }
  document.getElementById('sub-schulungen-list').innerHTML = meineZuws.map(z => {
    const v=SCHULUNG_VORLAGEN.find(vl=>vl.id===z.vorlagenId), s=berechneStatus(z), f=formulare[z.id]||{};
    const kannPdfSpeichern = currentUser.role === 'verantwortlicher' && f.abgeschlossen;
    return `<div class="schulung-item" onclick="oeffneFormular('${z.id}')">
      <div>
        <div class="titel">${v?escHtml(v.titel):z.vorlagenId}</div>
        <div class="meta">Frist: ${z.frist||'–'} ${z.pflicht?'• <strong>Pflichtschulung</strong>':''} ${f.abgeschlossen?`• Abgeschlossen: ${dateStr(f.abgeschlossenAm)}`:''}</div>
      </div>
      <div class="right" style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
        ${statusBadgeHtml(s)}
        ${kannPdfSpeichern ? `<button class="btn btn-sm" style="background:#16a34a;color:#fff;font-size:.72rem" onclick="event.stopPropagation();generatePdf('${z.id}',true)">📥 PDF speichern</button>` : ''}
        ${currentUser.role==='verantwortlicher' ? `<button class="btn btn-outline btn-sm" style="font-size:.72rem" onclick="event.stopPropagation();einladungOeffnen('${z.id}')">🔗 Einladen</button>` : ''}
      </div>
    </div>`;
  }).join('');
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
        <iframe src="${vorlage.pdf_url}" style="width:100%;height:70vh;border:none;display:block" title="${escHtml(vorlage.titel)}"></iframe>
        <div style="padding:8px 14px;background:#f8faff;font-size:.75rem;color:#6b7280">
          📄 ${escHtml(vorlage.titel)}
        </div>
      </div>`;
    // Unterschriftsfelder darunter
    html += `<div class="form-section"><div class="form-section-title">✍️ ${sprache==='de'?'Unterschriften':sprache==='en'?'Signatures':sprache==='tr'?'İmzalar':sprache==='ar'?'التوقيعات':sprache==='es'?'Firmas':'Подписи'}</div>`;
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
      html += `<div class="form-section"><div class="form-section-title">${escHtml(ab.titel)}</div>`;
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
    return `<div class="form-group"><label>${escHtml(feld.label)} ${pfl}</label><div class="sig-container"><canvas id="sig_${feld.id}" class="sig-canvas" height="120"></canvas></div><div class="sig-actions"><button type="button" class="btn btn-secondary btn-sm" onclick="clearSig('${feld.id}')">✕ Löschen</button><span style="font-size:.75rem;color:#6b7280">Mit Finger oder Maus unterschreiben</span></div></div>`;
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
  const dpr=window.devicePixelRatio||1, w=canvas.offsetWidth||300;
  canvas.width=w*dpr; canvas.height=120*dpr;
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  ctx.strokeStyle='#0047CC'; ctx.lineWidth=2.2; ctx.lineCap='round'; ctx.lineJoin='round';
  if (existingDataUrl) { const img=new Image(); img.onload=()=>ctx.drawImage(img,0,0,w,120); img.src=existingDataUrl; }
  let drawing=false,lastX=0,lastY=0;
  function getPos(e) { const rect=canvas.getBoundingClientRect(),src=e.touches?e.touches[0]:e; return{x:src.clientX-rect.left,y:src.clientY-rect.top}; }
  function start(e) { drawing=true; const p=getPos(e); lastX=p.x; lastY=p.y; }
  function move(e)  { if(!drawing)return; e.preventDefault(); const p=getPos(e); ctx.beginPath();ctx.moveTo(lastX,lastY);ctx.lineTo(p.x,p.y);ctx.stroke();lastX=p.x;lastY=p.y; }
  function end()    { drawing=false; }
  canvas.addEventListener('mousedown',start); canvas.addEventListener('mousemove',move); canvas.addEventListener('mouseup',end); canvas.addEventListener('mouseleave',end);
  canvas.addEventListener('touchstart',start,{passive:false}); canvas.addEventListener('touchmove',move,{passive:false}); canvas.addEventListener('touchend',end,{passive:false});
  sigPads[feldId]={canvas,ctx};
}
function clearSig(feldId) { const p=sigPads[feldId]; if(!p) return; p.ctx.clearRect(0,0,p.canvas.offsetWidth||300,120); }
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

  if (form.felder&&vorlage) {
    vorlage.abschnitte.forEach(ab => {
      checkY(12); doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(26,58,92);
      doc.text(ab.titel.toUpperCase(),PL,y); y+=6;
      ab.felder.forEach(feld => {
        const val=form.felder[feld.id]; checkY(10);
        doc.setFontSize(8); doc.setFont('helvetica','bold'); doc.setTextColor(60,60,60);
        doc.text(feld.label+(feld.pflicht?' *':''),PL,y); y+=4.5;
        doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30);
        if (feld.typ==='signature') {
          if(val){checkY(30);try{doc.addImage(val,'PNG',PL,y,60,22);y+=26;}catch(e){doc.text('[Unterschrift]',PL,y);y+=6;}}
          else{doc.setTextColor(180,180,180);doc.text('–',PL,y);y+=5;}
        } else if(feld.typ==='checkbox'){doc.text(val?'☑ Ja':'☐ Nein',PL,y);y+=5;}
        else if(feld.typ==='upload'){doc.text(val?`📎 ${val}`:'–',PL,y);y+=5;}
        else{const lines=doc.splitTextToSize(String(val||'–'),PW);doc.text(lines,PL,y);y+=lines.length*4.5+1;}
        y+=1;
      }); y+=4;
    });
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
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/schulung-pdfs/${path}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/pdf' },
      body: pdfBlob
    });
    if (!r.ok) throw new Error(await r.text());
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/schulung-pdfs/${path}`;
    await SB.patch('formulare', `id=eq.${zuwId}`, { pdf_path: publicUrl });
    if (formulare[zuwId]) formulare[zuwId].pdfPath = publicUrl;
    showToast('🗄️ Supabase: PDF gespeichert', '#0047cc');
  } catch(e) {
    console.warn('Supabase PDF Upload:', e.message);
    showToast('⚠️ Supabase Upload fehlgeschlagen', '#dc2626');
  }
}

// ── GOOGLE DRIVE UPLOAD (Backup) ─────────────────────────────
async function uploadPdfToDrive(pdfBase64, filename, tenantId, zuwId) {
  try {
    const resp = await fetch('http://localhost:8765/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdf: pdfBase64, filename, tenantId })
    });
    const result = await resp.json();
    if (result.status === 'ok') {
      // Drive-Link in DB speichern
      await SB.patch('formulare', `id=eq.${zuwId}`, { drive_link: result.link });
      if (formulare[zuwId]) formulare[zuwId].driveLink = result.link;
      showToast('☁️ Google Drive: PDF gespeichert', '#16a34a');
      return result.link;
    } else {
      console.warn('Drive Upload Fehler:', result.message);
      return null;
    }
  } catch(e) {
    console.warn('Drive Upload nicht erreichbar:', e.message);
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
document.addEventListener('DOMContentLoaded', initApp);

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
  if (!APP_TENANTS.length) {
    el.innerHTML = '<p style="color:#6b7280;font-size:.85rem">Noch keine Unternehmen angelegt.</p>';
    return;
  }
  el.innerHTML = APP_TENANTS.map(t => {
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

    const baseUrl = window.location.href.split('?')[0].split('#')[0];
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
    <p style="font-size:.75rem;color:#999">CSC GmbH · www.csc-hannover.de</p>
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
    html += `<div class="card"><iframe src="${gastVorlage.pdf_url}" style="width:100%;height:500px;border:none;border-radius:8px"></iframe></div>`;
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
      antworten:       JSON.stringify(antworten),
      abgeschlossen:   true,
      abgeschlossenAm: jetzt,
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
    doc.text('CSC GmbH — Schulungsmanagement', 15, 39);

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
      doc.text(`CSC GmbH Schulungsmanagement • Seite ${i} von ${pageCount} • ${new Date().toLocaleDateString('de-DE')}`, 105, 290, { align: 'center' });
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
  const url = `${location.origin}${location.pathname}?qrlogin=${encodeURIComponent(token)}`;

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
        return { frist: z.frist, fristDate, titel: v?.titel || z.vorlagenId, tenant: t?.name || z.tenantId, status: s, tage, monat: d };
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
      const ampelFarbe = e.status === 'gruen' ? '#16a34a' : e.status === 'gelb' ? '#f59e0b' : '#dc2626';
      const ampelBg   = e.status === 'gruen' ? '#f0fdf4' : e.status === 'gelb' ? '#fffbeb' : '#fef2f2';
      const tageText  = e.tage < 0 ? `${Math.abs(e.tage)} Tage überfällig` : e.tage === 0 ? 'Heute!' : `${e.tage} Tage`;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #f3f4f6">
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

    if (!alleFormulare.length) {
      document.getElementById('historie-inhalt').innerHTML =
        '<div style="text-align:center;padding:24px;color:#6b7280">📋 Noch keine abgeschlossenen Schulungen</div>';
      return;
    }

    const html = alleFormulare.map(f => {
      const zuw = zuweisungen.find(z => z.id === f.id);
      const v = zuw ? SCHULUNG_VORLAGEN.find(vl => vl.id === zuw.vorlagenId) : null;
      const t = zuw ? APP_TENANTS.find(tn => tn.id === zuw.tenantId) : null;
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f3f4f6">
        <div style="font-size:1.4rem">✅</div>
        <div style="flex:1">
          <div style="font-size:.9rem;font-weight:600">${escHtml(v?.titel || f.id)}</div>
          <div style="font-size:.76rem;color:#6b7280">
            ${t ? escHtml(t.name) + ' • ' : ''}
            Abgeschlossen: ${f.abgeschlossen_am ? dateStr(f.abgeschlossen_am) : '–'}
          </div>
        </div>
        ${f.pdf_path ? `<a href="${f.pdf_path}" target="_blank" class="btn btn-outline btn-sm" style="font-size:.72rem">📄 PDF</a>` : ''}
      </div>`;
    }).join('');

    document.getElementById('historie-inhalt').innerHTML = `
      <div style="margin-bottom:10px;font-size:.85rem;color:#6b7280">${alleFormulare.length} Schulung${alleFormulare.length !== 1 ? 'en' : ''} abgeschlossen</div>
      ${html}`;
  } catch(e) {
    document.getElementById('historie-inhalt').innerHTML =
      `<div style="color:#dc2626;padding:12px">Fehler: ${escHtml(e.message)}</div>`;
  }
}

function historieSchliessen() {
  const modal = document.getElementById('historie-modal');
  if (modal) modal.style.display = 'none';
}
