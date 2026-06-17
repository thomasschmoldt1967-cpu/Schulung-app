// ============================================================
//  app.js  —  Schulungsverwaltungs-App (Supabase Edition)
//  Multi-Tenant | Ampelsystem | Audit-Trail | PDF-Export
// ============================================================
'use strict';

// ── KONSTANTEN ───────────────────────────────────────────────
const SESSION_KEY   = 'schulung_session';
const SESSION_HOURS = 24;

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

// ── UTILS ────────────────────────────────────────────────────
function now()     { return new Date().toISOString(); }
function dateStr(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── SHA-256 ──────────────────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
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
  }
};

// ── APP INITIALISIEREN ───────────────────────────────────────
async function initApp() {
  showScreen('screen-loading');
  try {
    const [tenants, vorlagen, zuws] = await Promise.all([
      SB.get('tenants'),
      SB.get('vorlagen'),
      SB.get('zuweisungen')
    ]);
    APP_TENANTS       = tenants;
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
    if (session) { currentUser = session; routeAfterLogin(); }
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
  showScreen('screen-login');
}
function routeAfterLogin() {
  if (currentUser.role === 'admin') {
    renderAdminDashboard();
    showScreen('screen-admin');
  } else {
    // ── MANDANTENTRENNUNG: Sub-User sieht NUR eigene Daten ──
    // APP_TENANTS auf eigenen Tenant beschränken
    APP_TENANTS = APP_TENANTS.filter(t => t.id === currentUser.tenantId);
    // Zuweisungen nur für eigenen Tenant
    zuweisungen = zuweisungen.filter(z => z.tenantId === currentUser.tenantId);
    // Formulare nur für eigene Zuweisungen
    const eigeneZuwIds = new Set(zuweisungen.map(z => z.id));
    Object.keys(formulare).forEach(k => { if (!eigeneZuwIds.has(k)) delete formulare[k]; });
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
    const hash  = await sha256(pw);
    const users = await SB.get('users', `email=eq.${encodeURIComponent(email)}&password_hash=eq.${hash}`);
    if (!users.length) {
      errEl.textContent='E-Mail oder Passwort falsch.'; errEl.classList.add('show');
      loginBtn.textContent='Anmelden'; loginBtn.disabled=false; return;
    }
    const user = users[0];
    const session = {
      userId: user.id, name: user.name, email: user.email,
      role: user.role, tenantId: user.tenant_id,
      expires: Date.now() + SESSION_HOURS * 3600 * 1000
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    currentUser = session;
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
}
function adminTab(tabName, btn) {
  activeAdminTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#screen-admin .tab-content').forEach(t => t.style.display='none');
  document.getElementById(`tab-${tabName}`).style.display='';
  if (tabName==='protokoll') loadAuditFromDB();
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
}
function renderAdminTenantTable() {
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
  if (!confirm(`Vorlage "${v?.titel}" wirklich löschen?\n\nAcht: Alle Zuweisungen dieser Vorlage werden ebenfalls gelöscht!`)) return;
  try {
    // Zuweisungen dieser Vorlage löschen
    const zuws = zuweisungen.filter(z=>z.vorlagenId===id);
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

async function vtSpeichern() {
  const titel      = document.getElementById('vt-titel').value.trim();
  const beschr     = document.getElementById('vt-beschreibung').value.trim();
  const intervall  = parseInt(document.getElementById('vt-intervall').value) || 12;
  const msgEl      = document.getElementById('vt-msg');
  msgEl.classList.remove('show');

  if (!titel) { msgEl.textContent='Bitte einen Titel eingeben.'; msgEl.classList.add('show'); return; }

  // Abschnitte einlesen
  const abschnitte = [];
  document.querySelectorAll('#vt-abschnitte > div[id^="ab_"]').forEach(abDiv => {
    const abId    = abDiv.id;
    const abTitel = document.getElementById(`ab_titel_${abId}`)?.value.trim() || 'Abschnitt';
    const felder  = [];
    abDiv.querySelectorAll('div[id^="feld_"]').forEach(fDiv => {
      const fId  = fDiv.id;
      const label = document.getElementById(`label_${fId}`)?.value.trim();
      const typ   = document.getElementById(`typ_${fId}`)?.value || 'text';
      const pflicht = document.getElementById(`pfl_${fId}`)?.checked || false;
      if (label) felder.push({ id: `f_${fId}_${Date.now()}`, label, typ, pflicht });
    });
    if (felder.length) abschnitte.push({ titel: abTitel, felder });
  });

  if (!abschnitte.length) { msgEl.textContent='Bitte mindestens einen Abschnitt mit Feldern anlegen.'; msgEl.classList.add('show'); return; }

  const id = `vorlage_${titel.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')}_${Date.now()}`;
  const vorlage = { id, titel, beschreibung: beschr, intervall_monate: intervall, abschnitte };

  try {
    await SB.post('vorlagen', vorlage);
    SCHULUNG_VORLAGEN.push({ ...vorlage, intervallMonate: intervall });
    await sbAudit('VORLAGE_NEU', `Neue Vorlage "${titel}" erstellt`);
    showToast(`✅ Vorlage "${titel}" gespeichert`, '#16a34a');

    // Formular zurücksetzen
    document.getElementById('vt-titel').value       = '';
    document.getElementById('vt-beschreibung').value = '';
    document.getElementById('vt-intervall').value    = '12';
    document.getElementById('vt-abschnitte').innerHTML = '';
    vtAbschnittCount = 0;

    renderAdminVorlagen();
    populateZuweisungsForm();
  } catch(e) {
    msgEl.textContent = 'Fehler: '+e.message; msgEl.classList.add('show');
  }
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
  if (!confirm('Zuweisung wirklich löschen?')) return;
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
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//  FORMULAR
// ══════════════════════════════════════════════════════════════
function oeffneFormular(zuwId) {
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
  const ts=now();
  closeModal();
  await saveFormularToDB(felder, true, ts, currentUser.name);
  await sbAudit('ABSCHLUSS', `Schulung "${vorlage.titel}" abgeschlossen (${zuw.tenantId})`);
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
  if (form.abgeschlossen) { doc.text(`Abgeschlossen: ${dateStr(form.abgeschlossenAm)} von ${form.abgeschlossenVon||'–'}`,PL,y); y+=5; }
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
