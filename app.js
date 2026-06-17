// ============================================================
//  app.js  —  Schulungsverwaltungs-App
//  Multi-Tenant | Ampelsystem | Audit-Trail | PDF-Export
// ============================================================
'use strict';

// ── KONSTANTEN ───────────────────────────────────────────────
const SESSION_KEY   = 'schulung_session';
const SESSION_HOURS = 24;
const STATE_KEY     = 'schulung_state';   // Alle Fortschritte & Zuweisungen
const AUDIT_KEY     = 'schulung_audit';   // Audit-Trail

// ── GLOBALER APP-ZUSTAND ─────────────────────────────────────
let currentUser    = null;   // eingeloggter User
let appState       = {};     // { zuweisungen: [...], formulare: { zuwId: {...} } }
let auditLog       = [];     // [ { ts, user, action, detail } ]
let activeZuwId    = null;   // aktuell im Formular bearbeitete Zuweisung-ID
let abschlussCallback = null; // für Modal
let activeAdminTab = 'uebersicht';

// ── UTILS ────────────────────────────────────────────────────
function now() { return new Date().toISOString(); }
function dateStr(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}
function today() { return new Date().toISOString().slice(0,10); }
function addAudit(action, detail) {
  const entry = {
    ts: now(),
    user: currentUser ? currentUser.name : '–',
    email: currentUser ? currentUser.email : '',
    action,
    detail
  };
  auditLog.unshift(entry);
  if (auditLog.length > 200) auditLog.pop();
  localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));
}

// ── SHA-256 (Web Crypto) ─────────────────────────────────────
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── PASSWORT-HASHES (aus data.js werden echte hashes ergänzt) ──
// Für Demo: wir berechnen die Hashes beim ersten Aufruf und cachen sie
const DEMO_PASSWORDS = {
  'admin@csc.de':            'Admin2024!',
  'mueller@reinigung-a.de':  'SubA2024!',
  'schmidt@reinigung-a.de':  'MitA2024!',
  'weber@sicherheit-b.de':   'SubB2024!',
  'fischer@service-c.de':    'SubC2024!'
};
let _computedHashes = null;
async function getComputedHashes() {
  if (_computedHashes) return _computedHashes;
  _computedHashes = {};
  for (const [email, pw] of Object.entries(DEMO_PASSWORDS)) {
    _computedHashes[email] = await sha256(pw);
  }
  return _computedHashes;
}

// ── STATE LADEN/SPEICHERN ────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) {
      appState = JSON.parse(raw);
    } else {
      // Initiale Zuweisungen aus data.js laden
      appState = {
        zuweisungen: JSON.parse(JSON.stringify(ZUWEISUNGEN_INIT)),
        formulare: {}
      };
      saveState();
    }
  } catch(e) {
    appState = { zuweisungen: JSON.parse(JSON.stringify(ZUWEISUNGEN_INIT)), formulare: {} };
  }
  try {
    auditLog = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
  } catch(e) { auditLog = []; }
}
function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(appState));
}

// ── AMPEL-STATUS BERECHNEN ───────────────────────────────────
function berechneStatus(zuw) {
  const formular = appState.formulare[zuw.id] || {};
  if (formular.abgeschlossen) return 'gruen';
  const frist = zuw.frist ? new Date(zuw.frist) : null;
  const jetzt  = new Date();
  if (!formular.gestartet) {
    if (frist && frist < jetzt) return 'rot';
    return 'rot'; // noch nicht begonnen = rot
  }
  // in Bearbeitung
  if (frist && frist < jetzt) return 'rot';
  if (frist) {
    const tage = (frist - jetzt) / (1000 * 60 * 60 * 24);
    if (tage < 14) return 'gelb';
  }
  return 'gelb';
}
function statusLabel(s) {
  if (s === 'gruen') return 'Abgeschlossen';
  if (s === 'gelb')  return 'In Bearbeitung';
  return 'Offen / Dringend';
}
function statusBadgeHtml(s) {
  const cls   = `badge badge-${s}`;
  const dot   = `<span class="ampel-dot dot-${s}"></span>`;
  const label = statusLabel(s);
  return `<span class="${cls}">${dot}${label}</span>`;
}

// ── SCREEN NAVIGATION ────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0,0);
}

// ── LOGIN ────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pw    = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-fehler');
  errEl.classList.remove('show');

  if (!email || !pw) {
    errEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
    errEl.classList.add('show'); return;
  }

  const hashes = await getComputedHashes();
  const expectedHash = hashes[email];
  const inputHash    = await sha256(pw);

  if (!expectedHash || expectedHash !== inputHash) {
    errEl.textContent = 'E-Mail oder Passwort falsch.';
    errEl.classList.add('show'); return;
  }

  const user = APP_USERS.find(u => u.email === email);
  if (!user) {
    errEl.textContent = 'Benutzer nicht gefunden.';
    errEl.classList.add('show'); return;
  }

  // Session speichern
  const session = {
    userId:   user.id,
    name:     user.name,
    email:    user.email,
    role:     user.role,
    tenantId: user.tenantId,
    expires:  Date.now() + SESSION_HOURS * 3600 * 1000
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  currentUser = session;
  addAudit('LOGIN', `Benutzer angemeldet`);
  routeAfterLogin();
}

function checkSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!s || Date.now() > s.expires) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch(e) { return null; }
}

function doLogout() {
  addAudit('LOGOUT', 'Benutzer abgemeldet');
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  showScreen('screen-login');
}

function routeAfterLogin() {
  if (currentUser.role === 'admin') {
    renderAdminDashboard();
    showScreen('screen-admin');
  } else {
    renderSubDashboard();
    showScreen('screen-sub');
  }
}

// ── PASSWORT-TOGGLE ──────────────────────────────────────────
document.getElementById('pw-toggle-btn').addEventListener('click', () => {
  const inp = document.getElementById('login-password');
  const btn = document.getElementById('pw-toggle-btn');
  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
  else                         { inp.type = 'password'; btn.textContent = '👁'; }
});
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

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
  document.querySelectorAll('#screen-admin .tab-content').forEach(t => t.style.display = 'none');
  document.getElementById(`tab-${tabName}`).style.display = '';
}

function renderAdminStats() {
  const zuws  = appState.zuweisungen;
  let green=0, yellow=0, red=0;
  zuws.forEach(z => {
    const s = berechneStatus(z);
    if (s==='gruen') green++;
    else if (s==='gelb') yellow++;
    else red++;
  });
  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-tile gruen"><div class="zahl">${green}</div><div class="label">Abgeschlossen</div></div>
    <div class="stat-tile gelb"><div class="zahl">${yellow}</div><div class="label">In Bearbeitung</div></div>
    <div class="stat-tile rot"><div class="zahl">${red}</div><div class="label">Offen / Überfällig</div></div>
  `;
}

function renderAdminTenantTable() {
  const rows = APP_TENANTS.map(tenant => {
    const zuws = appState.zuweisungen.filter(z => z.tenantId === tenant.id);
    const stati = zuws.map(z => berechneStatus(z));
    const g = stati.filter(s=>s==='gruen').length;
    const y = stati.filter(s=>s==='gelb').length;
    const r = stati.filter(s=>s==='rot').length;
    const total = zuws.length || 1;
    const pct   = Math.round((g / total) * 100);

    return `
      <tr>
        <td class="td-name">${tenant.name}</td>
        <td>${zuws.length}</td>
        <td>
          <span class="badge badge-gruen"><span class="ampel-dot dot-gruen"></span>${g}</span>
          <span class="badge badge-gelb"  style="margin-left:4px"><span class="ampel-dot dot-gelb"></span>${y}</span>
          <span class="badge badge-rot"   style="margin-left:4px"><span class="ampel-dot dot-rot"></span>${r}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="progress-bar" style="width:100px">
              <div class="progress-fill ${pct===100?'fill-gruen':pct>0?'fill-gelb':'fill-rot'}" style="width:${pct}%"></div>
            </div>
            <span style="font-size:.78rem;color:#374151">${pct}%</span>
          </div>
        </td>
        <td><button class="btn btn-outline btn-sm" onclick="adminZeigeTenant('${tenant.id}')">Details</button></td>
      </tr>
    `;
  }).join('');

  document.getElementById('admin-tenant-table').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Subunternehmen</th><th>Schulungen</th><th>Ampelstatus</th><th>Fortschritt</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function adminZeigeTenant(tenantId) {
  const tenant = APP_TENANTS.find(t => t.id === tenantId);
  const zuws   = appState.zuweisungen.filter(z => z.tenantId === tenantId);

  const html = `
    <div class="card">
      <div class="card-title">🏢 ${tenant.name}</div>
      ${zuws.map(z => {
        const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === z.vorlagenId);
        const status  = berechneStatus(z);
        const form    = appState.formulare[z.id] || {};
        return `
          <div class="schulung-item" onclick="adminDetailAnzeigen('${z.id}')">
            <div>
              <div class="titel">${vorlage ? vorlage.titel : z.vorlagenId}</div>
              <div class="meta">Frist: ${z.frist || '–'} ${z.pflicht ? '• <strong>Pflicht</strong>' : ''}</div>
              ${form.abgeschlossen ? `<div class="meta">Abgeschlossen: ${dateStr(form.abgeschlossenAm)}</div>` : ''}
            </div>
            <div class="right">${statusBadgeHtml(status)}</div>
          </div>
        `;
      }).join('')}
      ${zuws.length === 0 ? '<div class="empty-state"><div class="icon">📭</div><p>Keine Zuweisungen</p></div>' : ''}
    </div>
  `;
  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail-user-info').textContent = currentUser.name;
  showScreen('screen-admin-detail');
}

let activeDetailZuwId = null;
function adminDetailAnzeigen(zuwId) {
  activeDetailZuwId = zuwId;
  const zuw     = appState.zuweisungen.find(z => z.id === zuwId);
  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
  const tenant  = APP_TENANTS.find(t => t.id === zuw.tenantId);
  const form    = appState.formulare[zuwId] || {};
  const status  = berechneStatus(zuw);

  let feldHtml = '';
  if (form.felder && vorlage) {
    vorlage.abschnitte.forEach(abschnitt => {
      feldHtml += `<div class="form-section-title">${abschnitt.titel}</div>`;
      abschnitt.felder.forEach(feld => {
        const val = form.felder[feld.id];
        if (feld.typ === 'signature') {
          if (val) feldHtml += `<div class="form-group"><label>${feld.label}</label><img src="${val}" style="max-width:250px;border:1px solid #dde2e9;border-radius:6px"></div>`;
        } else if (feld.typ === 'upload') {
          feldHtml += `<div class="form-group"><label>${feld.label}</label><span style="color:#16a34a">✓ ${val || 'Datei hochgeladen'}</span></div>`;
        } else if (feld.typ === 'checkbox') {
          feldHtml += `<div class="form-group"><label>${feld.label}</label><span>${val ? '✅ Ja' : '☐ Nein'}</span></div>`;
        } else {
          feldHtml += `<div class="form-group"><label>${feld.label}</label><div style="padding:8px;background:#f4f6f9;border-radius:6px">${val || '–'}</div></div>`;
        }
      });
    });
  }

  document.getElementById('detail-body').innerHTML = `
    <div class="card">
      <div class="card-title">${vorlage ? vorlage.titel : zuwId}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        ${statusBadgeHtml(status)}
        <span class="tenant-badge">${tenant ? tenant.name : zuw.tenantId}</span>
        ${zuw.pflicht ? '<span class="badge" style="background:#fce7f3;color:#9d174d">Pflichtschulung</span>' : ''}
      </div>
      <div style="font-size:.82rem;color:#6b7280;margin-bottom:14px">
        Frist: ${zuw.frist || '–'} | 
        ${form.abgeschlossen ? `Abgeschlossen: ${dateStr(form.abgeschlossenAm)}` : 'Noch offen'}
      </div>
      ${feldHtml || '<div class="empty-state"><div class="icon">📝</div><p>Noch kein Formular ausgefüllt</p></div>'}
    </div>
  `;
  document.getElementById('detail-user-info').textContent = currentUser.name;
  showScreen('screen-admin-detail');
}

function exportDetailPdf() {
  if (!activeDetailZuwId) return;
  generatePdf(activeDetailZuwId, true);
}

function renderAdminVorlagen() {
  document.getElementById('admin-vorlagen-list').innerHTML = SCHULUNG_VORLAGEN.map(v => `
    <div class="card">
      <div class="card-title">📄 ${v.titel}</div>
      <div style="font-size:.84rem;color:#374151;margin-bottom:8px">${v.beschreibung}</div>
      <div style="font-size:.78rem;color:#6b7280">Wiederholungsintervall: ${v.intervallMonate} Monate</div>
      <div style="margin-top:10px">
        ${v.abschnitte.map(a => `
          <div style="margin-bottom:6px">
            <span style="font-weight:700;font-size:.82rem">${a.titel}</span>
            <span style="color:#6b7280;font-size:.78rem"> — ${a.felder.length} Felder</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderAdminZuweisungen() {
  const rows = appState.zuweisungen.map(z => {
    const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
    const t = APP_TENANTS.find(tn => tn.id === z.tenantId);
    const s = berechneStatus(z);
    return `
      <div class="schulung-item">
        <div>
          <div class="titel">${v ? v.titel : z.vorlagenId}</div>
          <div class="meta">${t ? t.name : z.tenantId} • Frist: ${z.frist || '–'} ${z.pflicht?'• <strong>Pflicht</strong>':''}</div>
        </div>
        <div class="right" style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
          ${statusBadgeHtml(s)}
          <button class="btn btn-danger btn-sm" onclick="deleteZuweisung('${z.id}')">🗑</button>
        </div>
      </div>
    `;
  }).join('') || '<div class="empty-state"><div class="icon">📭</div><p>Keine Zuweisungen vorhanden</p></div>';
  document.getElementById('admin-zuw-list').innerHTML = rows;
}

function renderAuditTrail() {
  const html = auditLog.slice(0,50).map(e => `
    <div class="audit-item">
      <span class="audit-icon">${e.action==='LOGIN'?'🔑':e.action==='LOGOUT'?'🔓':e.action==='ABSCHLUSS'?'✅':e.action==='ZWISCHENSPEICHERN'?'💾':'📝'}</span>
      <div>
        <div style="font-size:.82rem"><strong>${e.action}</strong> — ${e.detail}</div>
        <div class="audit-time">${dateStr(e.ts)} • ${e.user}</div>
      </div>
    </div>
  `).join('') || '<div class="empty-state"><div class="icon">📋</div><p>Noch keine Einträge</p></div>';
  document.getElementById('audit-list').innerHTML = html;
}

function populateZuweisungsForm() {
  const vSel = document.getElementById('az-vorlage');
  vSel.innerHTML = SCHULUNG_VORLAGEN.map(v => `<option value="${v.id}">${v.titel}</option>`).join('');
  const tSel = document.getElementById('az-tenant');
  tSel.innerHTML = `<option value="">— alle Subunternehmen —</option>` +
    APP_TENANTS.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  document.getElementById('az-frist').value = '';
}

function createZuweisung() {
  const vorlagenId = document.getElementById('az-vorlage').value;
  const tenantSel  = document.getElementById('az-tenant').value;
  const frist      = document.getElementById('az-frist').value;
  const pflicht    = document.getElementById('az-pflicht').checked;
  const msgEl      = document.getElementById('az-msg');

  if (!frist) { msgEl.textContent = 'Bitte eine Frist angeben.'; msgEl.style.background='#fee2e2';msgEl.style.color='#dc2626'; msgEl.classList.add('show'); return; }

  const tenants = tenantSel ? [tenantSel] : APP_TENANTS.map(t => t.id);
  tenants.forEach(tid => {
    const id = `z_${tid}_${vorlagenId}_${Date.now()}`;
    appState.zuweisungen.push({ id, vorlagenId, tenantId: tid, frist, pflicht });
    addAudit('ZUWEISUNG', `Vorlage "${vorlagenId}" → ${tid} (Frist: ${frist})`);
  });
  saveState();

  msgEl.textContent = `${tenants.length} Zuweisung(en) erstellt.`;
  msgEl.style.background=''; msgEl.style.color='';
  msgEl.classList.add('show');
  setTimeout(()=>msgEl.classList.remove('show'), 3000);
  renderAdminZuweisungen();
  renderAdminStats();
  renderAdminTenantTable();
}

function deleteZuweisung(id) {
  if (!confirm('Zuweisung wirklich löschen?')) return;
  appState.zuweisungen = appState.zuweisungen.filter(z => z.id !== id);
  delete appState.formulare[id];
  saveState();
  addAudit('LOESCHEN', `Zuweisung ${id} gelöscht`);
  renderAdminZuweisungen();
  renderAdminStats();
  renderAdminTenantTable();
}

// ══════════════════════════════════════════════════════════════
//  SUBUNTERNEHMEN DASHBOARD
// ══════════════════════════════════════════════════════════════
function renderSubDashboard() {
  const tenant = APP_TENANTS.find(t => t.id === currentUser.tenantId);
  document.getElementById('sub-username').textContent   = currentUser.name;
  document.getElementById('sub-tenantname').textContent = tenant ? tenant.name : '';

  const meineZuws = appState.zuweisungen.filter(z => z.tenantId === currentUser.tenantId);
  const stati = meineZuws.map(z => berechneStatus(z));
  const g = stati.filter(s=>s==='gruen').length;
  const y = stati.filter(s=>s==='gelb').length;
  const r = stati.filter(s=>s==='rot').length;

  document.getElementById('sub-stats').innerHTML = `
    <div class="stat-tile gruen"><div class="zahl">${g}</div><div class="label">Abgeschlossen</div></div>
    <div class="stat-tile gelb"><div class="zahl">${y}</div><div class="label">In Bearbeitung</div></div>
    <div class="stat-tile rot"><div class="zahl">${r}</div><div class="label">Offen / Dringend</div></div>
  `;

  if (meineZuws.length === 0) {
    document.getElementById('sub-schulungen-list').innerHTML =
      '<div class="empty-state"><div class="icon">🎉</div><p>Keine Schulungen zugewiesen</p></div>';
    return;
  }

  document.getElementById('sub-schulungen-list').innerHTML = meineZuws.map(z => {
    const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === z.vorlagenId);
    const status  = berechneStatus(z);
    const form    = appState.formulare[z.id] || {};
    const readOnly = form.abgeschlossen;
    return `
      <div class="schulung-item" onclick="oeffneFormular('${z.id}')">
        <div>
          <div class="titel">${vorlage ? vorlage.titel : z.vorlagenId}</div>
          <div class="meta">
            Frist: ${z.frist||'–'}
            ${z.pflicht ? ' • <strong>Pflichtschulung</strong>' : ''}
            ${readOnly ? ` • Abgeschlossen: ${dateStr(form.abgeschlossenAm)}` : ''}
          </div>
        </div>
        <div class="right">
          ${statusBadgeHtml(status)}
          ${readOnly ? '<div style="font-size:.72rem;color:#16a34a;margin-top:4px">📄 PDF verfügbar</div>' : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
//  FORMULAR
// ══════════════════════════════════════════════════════════════
let sigPads = {};  // { feldId: { canvas, ctx, drawing } }
let uploadFiles = {};  // { feldId: File }

function oeffneFormular(zuwId) {
  activeZuwId = zuwId;
  sigPads     = {};
  uploadFiles = {};

  const zuw     = appState.zuweisungen.find(z => z.id === zuwId);
  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
  const form    = appState.formulare[zuwId] || {};
  const status  = berechneStatus(zuw);
  const readOnly = !!form.abgeschlossen;

  document.getElementById('formular-titel').textContent = vorlage ? vorlage.titel : zuwId;
  document.getElementById('formular-user-info').textContent = currentUser.name;
  document.getElementById('formular-status-bar').innerHTML = `
    ${statusBadgeHtml(status)}
    <span style="font-size:.8rem;color:#6b7280;margin-left:8px">Frist: ${zuw.frist||'–'}</span>
    ${readOnly ? '<span style="font-size:.8rem;color:#16a34a;margin-left:8px">🔒 Schreibgeschützt</span>' : ''}
  `;

  // Aktions-Buttons ausblenden wenn read-only
  const btnArea = document.querySelector('#screen-formular [style*="margin-top:4px"]');
  if (btnArea) btnArea.style.display = readOnly ? 'none' : 'flex';

  let html = `<p class="pflicht-hinweis"><span>*</span> Pflichtfelder</p>`;
  if (!vorlage) { html += '<p>Vorlage nicht gefunden.</p>'; }
  else {
    vorlage.abschnitte.forEach(abschnitt => {
      html += `<div class="form-section"><div class="form-section-title">${abschnitt.titel}</div>`;
      abschnitt.felder.forEach(feld => {
        const val = (form.felder || {})[feld.id] || '';
        html += renderFeld(feld, val, readOnly);
      });
      html += '</div>';
    });
  }

  document.getElementById('formular-body').innerHTML = html;
  document.getElementById('formular-fehler').classList.remove('show');
  document.getElementById('formular-success').classList.remove('show');

  // Signature-Pads initialisieren
  if (!readOnly && vorlage) {
    vorlage.abschnitte.forEach(ab => {
      ab.felder.filter(f => f.typ === 'signature').forEach(f => {
        initSigPad(f.id, (form.felder||{})[f.id]);
      });
    });
  } else if (readOnly && vorlage) {
    // read-only: Unterschriften als Bild einbetten (schon im HTML via <img>)
  }

  // Upload-Events
  if (!readOnly && vorlage) {
    vorlage.abschnitte.forEach(ab => {
      ab.felder.filter(f => f.typ === 'upload').forEach(f => {
        const input = document.getElementById(`upload_${f.id}`);
        if (input) {
          input.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) {
              uploadFiles[f.id] = file;
              const zone = document.getElementById(`zone_${f.id}`);
              if (zone) { zone.classList.add('has-file'); zone.querySelector('p').textContent = file.name; }
            }
          });
        }
      });
    });
  }

  showScreen('screen-formular');
  window.scrollTo(0,0);
}

function renderFeld(feld, val, readOnly) {
  const pflicht = feld.pflicht ? `<span class="pflicht-mark">*</span>` : '';
  if (feld.typ === 'text') {
    return `<div class="form-group">
      <label>${feld.label} ${pflicht}</label>
      <input type="text" id="feld_${feld.id}" value="${escHtml(val)}" placeholder="${feld.placeholder||''}" ${readOnly?'readonly':''}
             style="${readOnly?'background:#f4f6f9;color:#374151':''}">
    </div>`;
  }
  if (feld.typ === 'textarea') {
    return `<div class="form-group">
      <label>${feld.label} ${pflicht}</label>
      <textarea id="feld_${feld.id}" ${readOnly?'readonly':''}
                style="${readOnly?'background:#f4f6f9;color:#374151':''}">${escHtml(val)}</textarea>
    </div>`;
  }
  if (feld.typ === 'select') {
    const opts = (feld.optionen||[]).map(o =>
      `<option value="${escHtml(o)}" ${val===o?'selected':''}>${escHtml(o)}</option>`
    ).join('');
    return `<div class="form-group">
      <label>${feld.label} ${pflicht}</label>
      <select id="feld_${feld.id}" ${readOnly?'disabled':''}>
        <option value="">— bitte wählen —</option>${opts}
      </select>
    </div>`;
  }
  if (feld.typ === 'checkbox') {
    return `<div class="form-group">
      <div class="checkbox-field ${val?'checked':''}">
        <input type="checkbox" id="feld_${feld.id}" ${val?'checked':''} ${readOnly?'disabled':''}
               onchange="this.closest('.checkbox-field').classList.toggle('checked',this.checked)">
        <label for="feld_${feld.id}">${feld.label} ${pflicht}</label>
      </div>
    </div>`;
  }
  if (feld.typ === 'signature') {
    if (readOnly && val) {
      return `<div class="form-group">
        <label>${feld.label}</label>
        <img src="${val}" style="max-width:300px;border:1px solid #dde2e9;border-radius:8px;display:block">
      </div>`;
    }
    return `<div class="form-group">
      <label>${feld.label} ${pflicht}</label>
      <div class="sig-container">
        <canvas id="sig_${feld.id}" class="sig-canvas" height="120"></canvas>
      </div>
      <div class="sig-actions">
        <button type="button" class="btn btn-secondary btn-sm" onclick="clearSig('${feld.id}')">✕ Löschen</button>
        <span style="font-size:.75rem;color:#6b7280;line-height:1.2">Mit Finger oder Maus unterschreiben</span>
      </div>
    </div>`;
  }
  if (feld.typ === 'upload') {
    if (readOnly && val) {
      return `<div class="form-group">
        <label>${feld.label}</label>
        <span style="color:#16a34a;font-size:.88rem">✓ ${escHtml(val)}</span>
      </div>`;
    }
    return `<div class="form-group">
      <label>${feld.label} ${pflicht}</label>
      <div class="upload-zone" id="zone_${feld.id}" onclick="document.getElementById('upload_${feld.id}').click()">
        <div class="upload-icon">📎</div>
        <p>Tippen zum Hochladen (PDF, Bild)</p>
        <input type="file" id="upload_${feld.id}" accept=".pdf,.png,.jpg,.jpeg">
      </div>
    </div>`;
  }
  return '';
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── SIGNATURE PAD ────────────────────────────────────────────
function initSigPad(feldId, existingDataUrl) {
  const canvas = document.getElementById(`sig_${feldId}`);
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.offsetWidth  || 300;
  canvas.width  = w * dpr;
  canvas.height = 120 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#0047CC';
  ctx.lineWidth   = 2.2;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  if (existingDataUrl) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, w, 120);
    img.src = existingDataUrl;
  }

  let drawing = false, lastX = 0, lastY = 0;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const src  = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }
  function start(e) { drawing=true; const p=getPos(e); lastX=p.x; lastY=p.y; }
  function move(e)  {
    if (!drawing) return;
    e.preventDefault();
    const p=getPos(e);
    ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(p.x,p.y); ctx.stroke();
    lastX=p.x; lastY=p.y;
  }
  function end() { drawing=false; }

  canvas.addEventListener('mousedown',  start);
  canvas.addEventListener('mousemove',  move);
  canvas.addEventListener('mouseup',    end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove',  move,  { passive: false });
  canvas.addEventListener('touchend',   end,   { passive: false });

  sigPads[feldId] = { canvas, ctx };
}

function clearSig(feldId) {
  const pad = sigPads[feldId];
  if (!pad) return;
  const dpr = window.devicePixelRatio || 1;
  const w   = pad.canvas.offsetWidth || 300;
  pad.ctx.clearRect(0, 0, w, 120);
}

function isSigEmpty(feldId) {
  const pad = sigPads[feldId];
  if (!pad) return true;
  const blankCanvas = document.createElement('canvas');
  blankCanvas.width  = pad.canvas.width;
  blankCanvas.height = pad.canvas.height;
  return pad.canvas.toDataURL() === blankCanvas.toDataURL();
}

function getSigDataUrl(feldId) {
  const pad = sigPads[feldId];
  if (!pad || isSigEmpty(feldId)) return null;
  return pad.canvas.toDataURL('image/png');
}

// ── FORMULAR SPEICHERN ───────────────────────────────────────
function formularSpeichern(abschliessen) {
  const zuw     = appState.zuweisungen.find(z => z.id === activeZuwId);
  if (!zuw) return;
  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
  const fehlEl  = document.getElementById('formular-fehler');
  fehlEl.classList.remove('show');

  const felder = {};
  let fehler   = [];

  vorlage.abschnitte.forEach(ab => {
    ab.felder.forEach(feld => {
      if (feld.typ === 'text' || feld.typ === 'textarea') {
        const el = document.getElementById(`feld_${feld.id}`);
        if (el) felder[feld.id] = el.value.trim();
        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label);
      } else if (feld.typ === 'select') {
        const el = document.getElementById(`feld_${feld.id}`);
        if (el) felder[feld.id] = el.value;
        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label);
      } else if (feld.typ === 'checkbox') {
        const el = document.getElementById(`feld_${feld.id}`);
        if (el) felder[feld.id] = el.checked;
        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label);
      } else if (feld.typ === 'signature') {
        const dataUrl = getSigDataUrl(feld.id);
        const existing = (appState.formulare[activeZuwId]||{}).felder?.[feld.id];
        felder[feld.id] = dataUrl || existing || null;
        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label + ' (Unterschrift)');
      } else if (feld.typ === 'upload') {
        const file     = uploadFiles[feld.id];
        const existing = (appState.formulare[activeZuwId]||{}).felder?.[feld.id];
        felder[feld.id] = file ? file.name : (existing || null);
        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label);
      }
    });
  });

  if (fehler.length > 0) {
    fehlEl.textContent = 'Bitte ausfüllen: ' + fehler.join(', ');
    fehlEl.classList.add('show');
    return;
  }

  if (abschliessen) {
    abschlussCallback = () => doAbschluss(felder);
    document.getElementById('modal-abschluss').classList.add('active');
  } else {
    if (!appState.formulare[activeZuwId]) appState.formulare[activeZuwId] = {};
    appState.formulare[activeZuwId].felder    = felder;
    appState.formulare[activeZuwId].gestartet = true;
    appState.formulare[activeZuwId].gespeichertAm = now();
    saveState();
    addAudit('ZWISCHENSPEICHERN', `Schulung "${vorlage.titel}" (${zuw.tenantId})`);
    const succ = document.getElementById('formular-success');
    succ.textContent = '✅ Zwischengespeichert!';
    succ.classList.add('show');
    setTimeout(() => succ.classList.remove('show'), 2500);
  }
}

function doAbschluss(felder) {
  const zuw     = appState.zuweisungen.find(z => z.id === activeZuwId);
  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);

  if (!appState.formulare[activeZuwId]) appState.formulare[activeZuwId] = {};
  appState.formulare[activeZuwId].felder          = felder;
  appState.formulare[activeZuwId].gestartet       = true;
  appState.formulare[activeZuwId].abgeschlossen   = true;
  appState.formulare[activeZuwId].abgeschlossenAm = now();
  appState.formulare[activeZuwId].abgeschlossenVon= currentUser.name;
  saveState();
  addAudit('ABSCHLUSS', `Schulung "${vorlage.titel}" abgeschlossen`);
  closeModal();

  // PDF generieren
  generatePdf(activeZuwId, false);

  // Zurück zum Dashboard
  setTimeout(() => {
    if (currentUser.role === 'admin') { renderAdminDashboard(); showScreen('screen-admin'); }
    else { renderSubDashboard(); showScreen('screen-sub'); }
  }, 1500);
}

function backFromFormular() {
  if (currentUser.role === 'admin') showScreen('screen-admin');
  else showScreen('screen-sub');
}

// ── MODAL ────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('modal-abschluss').classList.remove('active');
}
function abschlussBestaetigt() {
  if (abschlussCallback) abschlussCallback();
  abschlussCallback = null;
}

// ══════════════════════════════════════════════════════════════
//  PDF-EXPORT  (jsPDF)
// ══════════════════════════════════════════════════════════════
function generatePdf(zuwId, downloadOnly) {
  const zuw     = appState.zuweisungen.find(z => z.id === zuwId);
  if (!zuw) return;
  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
  const tenant  = APP_TENANTS.find(t => t.id === zuw.tenantId);
  const form    = appState.formulare[zuwId] || {};
  const status  = berechneStatus(zuw);

  // jsPDF laden (CDN)
  if (typeof window.jspdf === 'undefined') {
    alert('PDF-Bibliothek nicht geladen. Bitte Internetverbindung prüfen.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const PL  = 18;  // links
  const PT  = 18;  // oben
  const PW  = 174; // Breite
  let   y   = PT;

  function addPage() { doc.addPage(); y = PT; }
  function checkY(needed) { if (y + needed > 275) addPage(); }

  // ── Kopfzeile ──
  doc.setFillColor(26, 58, 92);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('Schulungsnachweis', PL, 13);
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleString('de-DE'), 210 - PL, 13, { align: 'right' });
  y = 30;

  // ── Titel ──
  doc.setTextColor(26, 58, 92);
  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text(vorlage ? vorlage.titel : zuwId, PL, y); y += 8;

  // ── Metadaten ──
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(`Subunternehmen: ${tenant ? tenant.name : zuw.tenantId}`, PL, y); y += 5;
  doc.text(`Frist: ${zuw.frist || '–'}  •  Pflichtschulung: ${zuw.pflicht ? 'Ja' : 'Nein'}`, PL, y); y += 5;
  if (form.abgeschlossen) {
    doc.text(`Abgeschlossen: ${dateStr(form.abgeschlossenAm)} von ${form.abgeschlossenVon||'–'}`, PL, y); y += 5;
  }

  // ── Ampel-Indikator ──
  const ampelColor = status === 'gruen' ? [22,163,74] : status === 'gelb' ? [202,138,4] : [220,38,38];
  doc.setFillColor(...ampelColor);
  doc.roundedRect(PL, y, 38, 7, 2, 2, 'F');
  doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text(statusLabel(status).toUpperCase(), PL + 19, y + 4.5, { align: 'center' });
  y += 13;

  // ── Trennlinie ──
  doc.setDrawColor(200,200,200);
  doc.line(PL, y, 210 - PL, y); y += 8;

  // ── Felder ──
  if (form.felder && vorlage) {
    vorlage.abschnitte.forEach(abschnitt => {
      checkY(12);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 58, 92);
      doc.text(abschnitt.titel.toUpperCase(), PL, y); y += 6;

      abschnitt.felder.forEach(feld => {
        const val = form.felder[feld.id];
        checkY(10);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
        doc.text(feld.label + (feld.pflicht ? ' *' : ''), PL, y); y += 4.5;
        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);

        if (feld.typ === 'signature') {
          if (val) {
            checkY(30);
            try {
              doc.addImage(val, 'PNG', PL, y, 60, 22);
              y += 26;
            } catch(e) { doc.text('[Unterschrift nicht darstellbar]', PL, y); y += 6; }
          } else { doc.setTextColor(180,180,180); doc.text('–', PL, y); y += 5; }
        } else if (feld.typ === 'checkbox') {
          const label = val ? '☑ Ja' : '☐ Nein';
          doc.text(label, PL, y); y += 5;
        } else if (feld.typ === 'upload') {
          doc.text(val ? `📎 ${val}` : '–', PL, y); y += 5;
        } else {
          const lines = doc.splitTextToSize(String(val||'–'), PW);
          doc.text(lines, PL, y); y += lines.length * 4.5 + 1;
        }
        checkY(2); y += 1;
      });
      y += 4;
    });
  }

  // ── Fußzeile ──
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(150,150,150);
    doc.text(`Seite ${i} / ${pageCount}  •  Revisionssicher erstellt: ${new Date().toLocaleString('de-DE')}`, 105, 290, { align: 'center' });
    doc.line(PL, 285, 210-PL, 285);
  }

  // Download
  const dt  = new Date().toISOString().slice(0,10);
  const fn  = `${dt}_${(vorlage?.titel||zuwId).replace(/\s+/g,'_')}_${zuw.tenantId}.pdf`;
  doc.save(fn);
}

// ══════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  const session = checkSession();
  if (session) {
    currentUser = session;
    routeAfterLogin();
  } else {
    showScreen('screen-login');
  }
});
