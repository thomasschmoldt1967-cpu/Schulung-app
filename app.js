     1|// ============================================================
     2|//  app.js  —  Schulungsverwaltungs-App
     3|//  Multi-Tenant | Ampelsystem | Audit-Trail | PDF-Export
     4|// ============================================================
     5|'use strict';
     6|
     7|// ── KONSTANTEN ───────────────────────────────────────────────
     8|const SESSION_KEY   = 'schulung_session';
     9|const SESSION_HOURS = 24;
    10|const STATE_KEY     = 'schulung_state';   // Alle Fortschritte & Zuweisungen
    11|const AUDIT_KEY     = 'schulung_audit';   // Audit-Trail
    12|
    13|// ── GLOBALER APP-ZUSTAND ─────────────────────────────────────
    14|let currentUser    = null;   // eingeloggter User
    15|let appState       = {};     // { zuweisungen: [...], formulare: { zuwId: {...} } }
    16|let auditLog       = [];     // [ { ts, user, action, detail } ]
    17|let activeZuwId    = null;   // aktuell im Formular bearbeitete Zuweisung-ID
    18|let abschlussCallback = null; // für Modal
    19|let activeAdminTab = 'uebersicht';
    20|
    21|// ── UTILS ────────────────────────────────────────────────────
    22|function now() { return new Date().toISOString(); }
    23|function dateStr(iso) {
    24|  if (!iso) return '–';
    25|  const d = new Date(iso);
    26|  return d.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    27|}
    28|function today() { return new Date().toISOString().slice(0,10); }
    29|function addAudit(action, detail) {
    30|  const entry = {
    31|    ts: now(),
    32|    user: currentUser ? currentUser.name : '–',
    33|    email: currentUser ? currentUser.email : '',
    34|    action,
    35|    detail
    36|  };
    37|  auditLog.unshift(entry);
    38|  if (auditLog.length > 200) auditLog.pop();
    39|  localStorage.setItem(AUDIT_KEY, JSON.stringify(auditLog));
    40|}
    41|
    42|// ── SHA-256 (Web Crypto) ─────────────────────────────────────
    43|async function sha256(text) {
    44|  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    45|  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    46|}
    47|
    48|// ── PASSWORT-HASHES (aus data.js werden echte hashes ergänzt) ──
    49|// Für Demo: wir berechnen die Hashes beim ersten Aufruf und cachen sie
    50|const DEMO_PASSWORDS = {
    51|  'admin@csc.de':            'Admin2024!',
    52|  'mueller@reinigung-a.de':  'UnternehmenA2024!',
    53|  'schmidt@reinigung-a.de':  'MitA2024!',
    54|  'weber@sicherheit-b.de':   'UnternehmenB2024!',
    55|  'fischer@service-c.de':    'UnternehmenC2024!'
    56|};
    57|let _computedHashes = null;
    58|async function getComputedHashes() {
    59|  if (_computedHashes) return _computedHashes;
    60|  _computedHashes = {};
    61|  for (const [email, pw] of Object.entries(DEMO_PASSWORDS)) {
    62|    _computedHashes[email] = await sha256(pw);
    63|  }
    64|  return _computedHashes;
    65|}
    66|
    67|// ── STATE LADEN/SPEICHERN ────────────────────────────────────
    68|function loadState() {
    69|  try {
    70|    const raw = localStorage.getItem(STATE_KEY);
    71|    if (raw) {
    72|      appState = JSON.parse(raw);
    73|    } else {
    74|      // Initiale Zuweisungen aus data.js laden
    75|      appState = {
    76|        zuweisungen: JSON.parse(JSON.stringify(ZUWEISUNGEN_INIT)),
    77|        formulare: {}
    78|      };
    79|      saveState();
    80|    }
    81|  } catch(e) {
    82|    appState = { zuweisungen: JSON.parse(JSON.stringify(ZUWEISUNGEN_INIT)), formulare: {} };
    83|  }
    84|  try {
    85|    auditLog = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    86|  } catch(e) { auditLog = []; }
    87|}
    88|function saveState() {
    89|  localStorage.setItem(STATE_KEY, JSON.stringify(appState));
    90|}
    91|
    92|// ── AMPEL-STATUS BERECHNEN ───────────────────────────────────
    93|function berechneStatus(zuw) {
    94|  const formular = appState.formulare[zuw.id] || {};
    95|  if (formular.abgeschlossen) return 'gruen';
    96|  const frist = zuw.frist ? new Date(zuw.frist) : null;
    97|  const jetzt  = new Date();
    98|  if (!formular.gestartet) {
    99|    if (frist && frist < jetzt) return 'rot';
   100|    return 'rot'; // noch nicht begonnen = rot
   101|  }
   102|  // in Bearbeitung
   103|  if (frist && frist < jetzt) return 'rot';
   104|  if (frist) {
   105|    const tage = (frist - jetzt) / (1000 * 60 * 60 * 24);
   106|    if (tage < 14) return 'gelb';
   107|  }
   108|  return 'gelb';
   109|}
   110|function statusLabel(s) {
   111|  if (s === 'gruen') return 'Abgeschlossen';
   112|  if (s === 'gelb')  return 'In Bearbeitung';
   113|  return 'Offen / Dringend';
   114|}
   115|function statusBadgeHtml(s) {
   116|  const cls   = `badge badge-${s}`;
   117|  const dot   = `<span class="ampel-dot dot-${s}"></span>`;
   118|  const label = statusLabel(s);
   119|  return `<span class="${cls}">${dot}${label}</span>`;
   120|}
   121|
   122|// ── SCREEN NAVIGATION ────────────────────────────────────────
   123|function showScreen(id) {
   124|  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
   125|  document.getElementById(id).classList.add('active');
   126|  window.scrollTo(0,0);
   127|}
   128|
   129|// ── LOGIN ────────────────────────────────────────────────────
   130|async function doLogin() {
   131|  const email = document.getElementById('login-email').value.trim().toLowerCase();
   132|  const pw    = document.getElementById('login-password').value;
   133|  const errEl = document.getElementById('login-fehler');
   134|  errEl.classList.remove('show');
   135|
   136|  if (!email || !pw) {
   137|    errEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
   138|    errEl.classList.add('show'); return;
   139|  }
   140|
   141|  const hashes = await getComputedHashes();
   142|  const expectedHash = hashes[email];
   143|  const inputHash    = await sha256(pw);
   144|
   145|  if (!expectedHash || expectedHash !== inputHash) {
   146|    errEl.textContent = 'E-Mail oder Passwort falsch.';
   147|    errEl.classList.add('show'); return;
   148|  }
   149|
   150|  const user = APP_USERS.find(u => u.email === email);
   151|  if (!user) {
   152|    errEl.textContent = 'Benutzer nicht gefunden.';
   153|    errEl.classList.add('show'); return;
   154|  }
   155|
   156|  // Session speichern
   157|  const session = {
   158|    userId:   user.id,
   159|    name:     user.name,
   160|    email:    user.email,
   161|    role:     user.role,
   162|    tenantId: user.tenantId,
   163|    expires:  Date.now() + SESSION_HOURS * 3600 * 1000
   164|  };
   165|  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
   166|  currentUser = session;
   167|  addAudit('LOGIN', `Benutzer angemeldet`);
   168|  routeAfterLogin();
   169|}
   170|
   171|function checkSession() {
   172|  try {
   173|    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
   174|    if (!s || Date.now() > s.expires) {
   175|      localStorage.removeItem(SESSION_KEY);
   176|      return null;
   177|    }
   178|    return s;
   179|  } catch(e) { return null; }
   180|}
   181|
   182|function doLogout() {
   183|  addAudit('LOGOUT', 'Benutzer abgemeldet');
   184|  localStorage.removeItem(SESSION_KEY);
   185|  currentUser = null;
   186|  showScreen('screen-login');
   187|}
   188|
   189|function routeAfterLogin() {
   190|  if (currentUser.role === 'admin') {
   191|    renderAdminDashboard();
   192|    showScreen('screen-admin');
   193|  } else {
   194|    renderSubDashboard();
   195|    showScreen('screen-sub');
   196|  }
   197|}
   198|
   199|// ── PASSWORT-TOGGLE ──────────────────────────────────────────
   200|document.getElementById('pw-toggle-btn').addEventListener('click', () => {
   201|  const inp = document.getElementById('login-password');
   202|  const btn = document.getElementById('pw-toggle-btn');
   203|  if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
   204|  else                         { inp.type = 'password'; btn.textContent = '👁'; }
   205|});
   206|document.getElementById('login-password').addEventListener('keydown', e => {
   207|  if (e.key === 'Enter') doLogin();
   208|});
   209|
   210|// ══════════════════════════════════════════════════════════════
   211|//  ADMIN DASHBOARD
   212|// ══════════════════════════════════════════════════════════════
   213|function renderAdminDashboard() {
   214|  document.getElementById('admin-username').textContent = currentUser.name;
   215|  renderAdminStats();
   216|  renderAdminTenantTable();
   217|  renderAdminVorlagen();
   218|  renderAdminZuweisungen();
   219|  renderAuditTrail();
   220|  populateZuweisungsForm();
   221|}
   222|
   223|function adminTab(tabName, btn) {
   224|  activeAdminTab = tabName;
   225|  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
   226|  btn.classList.add('active');
   227|  document.querySelectorAll('#screen-admin .tab-content').forEach(t => t.style.display = 'none');
   228|  document.getElementById(`tab-${tabName}`).style.display = '';
   229|}
   230|
   231|function renderAdminStats() {
   232|  const zuws  = appState.zuweisungen;
   233|  let green=0, yellow=0, red=0;
   234|  zuws.forEach(z => {
   235|    const s = berechneStatus(z);
   236|    if (s==='gruen') green++;
   237|    else if (s==='gelb') yellow++;
   238|    else red++;
   239|  });
   240|  document.getElementById('admin-stats').innerHTML = `
   241|    <div class="stat-tile gruen"><div class="zahl">${green}</div><div class="label">Abgeschlossen</div></div>
   242|    <div class="stat-tile gelb"><div class="zahl">${yellow}</div><div class="label">In Bearbeitung</div></div>
   243|    <div class="stat-tile rot"><div class="zahl">${red}</div><div class="label">Offen / Überfällig</div></div>
   244|  `;
   245|}
   246|
   247|function renderAdminTenantTable() {
   248|  const rows = APP_TENANTS.map(tenant => {
   249|    const zuws = appState.zuweisungen.filter(z => z.tenantId === tenant.id);
   250|    const stati = zuws.map(z => berechneStatus(z));
   251|    const g = stati.filter(s=>s==='gruen').length;
   252|    const y = stati.filter(s=>s==='gelb').length;
   253|    const r = stati.filter(s=>s==='rot').length;
   254|    const total = zuws.length || 1;
   255|    const pct   = Math.round((g / total) * 100);
   256|
   257|    return `
   258|      <tr>
   259|        <td class="td-name">${tenant.name}</td>
   260|        <td>${zuws.length}</td>
   261|        <td>
   262|          <span class="badge badge-gruen"><span class="ampel-dot dot-gruen"></span>${g}</span>
   263|          <span class="badge badge-gelb"  style="margin-left:4px"><span class="ampel-dot dot-gelb"></span>${y}</span>
   264|          <span class="badge badge-rot"   style="margin-left:4px"><span class="ampel-dot dot-rot"></span>${r}</span>
   265|        </td>
   266|        <td>
   267|          <div style="display:flex;align-items:center;gap:8px">
   268|            <div class="progress-bar" style="width:100px">
   269|              <div class="progress-fill ${pct===100?'fill-gruen':pct>0?'fill-gelb':'fill-rot'}" style="width:${pct}%"></div>
   270|            </div>
   271|            <span style="font-size:.78rem;color:#374151">${pct}%</span>
   272|          </div>
   273|        </td>
   274|        <td><button class="btn btn-outline btn-sm" onclick="adminZeigeTenant('${tenant.id}')">Details</button></td>
   275|      </tr>
   276|    `;
   277|  }).join('');
   278|
   279|  document.getElementById('admin-tenant-table').innerHTML = `
   280|    <div class="table-wrap">
   281|      <table>
   282|        <thead><tr><th>Unternehmen</th><th>Schulungen</th><th>Ampelstatus</th><th>Fortschritt</th><th></th></tr></thead>
   283|        <tbody>${rows}</tbody>
   284|      </table>
   285|    </div>
   286|  `;
   287|}
   288|
   289|function adminZeigeTenant(tenantId) {
   290|  const tenant = APP_TENANTS.find(t => t.id === tenantId);
   291|  const zuws   = appState.zuweisungen.filter(z => z.tenantId === tenantId);
   292|
   293|  const html = `
   294|    <div class="card">
   295|      <div class="card-title">🏢 ${tenant.name}</div>
   296|      ${zuws.map(z => {
   297|        const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === z.vorlagenId);
   298|        const status  = berechneStatus(z);
   299|        const form    = appState.formulare[z.id] || {};
   300|        return `
   301|          <div class="schulung-item" onclick="adminDetailAnzeigen('${z.id}')">
   302|            <div>
   303|              <div class="titel">${vorlage ? vorlage.titel : z.vorlagenId}</div>
   304|              <div class="meta">Frist: ${z.frist || '–'} ${z.pflicht ? '• <strong>Pflicht</strong>' : ''}</div>
   305|              ${form.abgeschlossen ? `<div class="meta">Abgeschlossen: ${dateStr(form.abgeschlossenAm)}</div>` : ''}
   306|            </div>
   307|            <div class="right">${statusBadgeHtml(status)}</div>
   308|          </div>
   309|        `;
   310|      }).join('')}
   311|      ${zuws.length === 0 ? '<div class="empty-state"><div class="icon">📭</div><p>Keine Zuweisungen</p></div>' : ''}
   312|    </div>
   313|  `;
   314|  document.getElementById('detail-body').innerHTML = html;
   315|  document.getElementById('detail-user-info').textContent = currentUser.name;
   316|  showScreen('screen-admin-detail');
   317|}
   318|
   319|let activeDetailZuwId = null;
   320|function adminDetailAnzeigen(zuwId) {
   321|  activeDetailZuwId = zuwId;
   322|  const zuw     = appState.zuweisungen.find(z => z.id === zuwId);
   323|  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
   324|  const tenant  = APP_TENANTS.find(t => t.id === zuw.tenantId);
   325|  const form    = appState.formulare[zuwId] || {};
   326|  const status  = berechneStatus(zuw);
   327|
   328|  let feldHtml = '';
   329|  if (form.felder && vorlage) {
   330|    vorlage.abschnitte.forEach(abschnitt => {
   331|      feldHtml += `<div class="form-section-title">${abschnitt.titel}</div>`;
   332|      abschnitt.felder.forEach(feld => {
   333|        const val = form.felder[feld.id];
   334|        if (feld.typ === 'signature') {
   335|          if (val) feldHtml += `<div class="form-group"><label>${feld.label}</label><img src="${val}" style="max-width:250px;border:1px solid #dde2e9;border-radius:6px"></div>`;
   336|        } else if (feld.typ === 'upload') {
   337|          feldHtml += `<div class="form-group"><label>${feld.label}</label><span style="color:#16a34a">✓ ${val || 'Datei hochgeladen'}</span></div>`;
   338|        } else if (feld.typ === 'checkbox') {
   339|          feldHtml += `<div class="form-group"><label>${feld.label}</label><span>${val ? '✅ Ja' : '☐ Nein'}</span></div>`;
   340|        } else {
   341|          feldHtml += `<div class="form-group"><label>${feld.label}</label><div style="padding:8px;background:#f4f6f9;border-radius:6px">${val || '–'}</div></div>`;
   342|        }
   343|      });
   344|    });
   345|  }
   346|
   347|  document.getElementById('detail-body').innerHTML = `
   348|    <div class="card">
   349|      <div class="card-title">${vorlage ? vorlage.titel : zuwId}</div>
   350|      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
   351|        ${statusBadgeHtml(status)}
   352|        <span class="tenant-badge">${tenant ? tenant.name : zuw.tenantId}</span>
   353|        ${zuw.pflicht ? '<span class="badge" style="background:#fce7f3;color:#9d174d">Pflichtschulung</span>' : ''}
   354|      </div>
   355|      <div style="font-size:.82rem;color:#6b7280;margin-bottom:14px">
   356|        Frist: ${zuw.frist || '–'} | 
   357|        ${form.abgeschlossen ? `Abgeschlossen: ${dateStr(form.abgeschlossenAm)}` : 'Noch offen'}
   358|      </div>
   359|      ${feldHtml || '<div class="empty-state"><div class="icon">📝</div><p>Noch kein Formular ausgefüllt</p></div>'}
   360|    </div>
   361|  `;
   362|  document.getElementById('detail-user-info').textContent = currentUser.name;
   363|  showScreen('screen-admin-detail');
   364|}
   365|
   366|function exportDetailPdf() {
   367|  if (!activeDetailZuwId) return;
   368|  generatePdf(activeDetailZuwId, true);
   369|}
   370|
   371|function renderAdminVorlagen() {
   372|  document.getElementById('admin-vorlagen-list').innerHTML = SCHULUNG_VORLAGEN.map(v => `
   373|    <div class="card">
   374|      <div class="card-title">📄 ${v.titel}</div>
   375|      <div style="font-size:.84rem;color:#374151;margin-bottom:8px">${v.beschreibung}</div>
   376|      <div style="font-size:.78rem;color:#6b7280">Wiederholungsintervall: ${v.intervallMonate} Monate</div>
   377|      <div style="margin-top:10px">
   378|        ${v.abschnitte.map(a => `
   379|          <div style="margin-bottom:6px">
   380|            <span style="font-weight:700;font-size:.82rem">${a.titel}</span>
   381|            <span style="color:#6b7280;font-size:.78rem"> — ${a.felder.length} Felder</span>
   382|          </div>
   383|        `).join('')}
   384|      </div>
   385|    </div>
   386|  `).join('');
   387|}
   388|
   389|function renderAdminZuweisungen() {
   390|  const rows = appState.zuweisungen.map(z => {
   391|    const v = SCHULUNG_VORLAGEN.find(vl => vl.id === z.vorlagenId);
   392|    const t = APP_TENANTS.find(tn => tn.id === z.tenantId);
   393|    const s = berechneStatus(z);
   394|    return `
   395|      <div class="schulung-item">
   396|        <div>
   397|          <div class="titel">${v ? v.titel : z.vorlagenId}</div>
   398|          <div class="meta">${t ? t.name : z.tenantId} • Frist: ${z.frist || '–'} ${z.pflicht?'• <strong>Pflicht</strong>':''}</div>
   399|        </div>
   400|        <div class="right" style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
   401|          ${statusBadgeHtml(s)}
   402|          <button class="btn btn-danger btn-sm" onclick="deleteZuweisung('${z.id}')">🗑</button>
   403|        </div>
   404|      </div>
   405|    `;
   406|  }).join('') || '<div class="empty-state"><div class="icon">📭</div><p>Keine Zuweisungen vorhanden</p></div>';
   407|  document.getElementById('admin-zuw-list').innerHTML = rows;
   408|}
   409|
   410|function renderAuditTrail() {
   411|  const html = auditLog.slice(0,50).map(e => `
   412|    <div class="audit-item">
   413|      <span class="audit-icon">${e.action==='LOGIN'?'🔑':e.action==='LOGOUT'?'🔓':e.action==='ABSCHLUSS'?'✅':e.action==='ZWISCHENSPEICHERN'?'💾':'📝'}</span>
   414|      <div>
   415|        <div style="font-size:.82rem"><strong>${e.action}</strong> — ${e.detail}</div>
   416|        <div class="audit-time">${dateStr(e.ts)} • ${e.user}</div>
   417|      </div>
   418|    </div>
   419|  `).join('') || '<div class="empty-state"><div class="icon">📋</div><p>Noch keine Einträge</p></div>';
   420|  document.getElementById('audit-list').innerHTML = html;
   421|}
   422|
   423|function populateZuweisungsForm() {
   424|  const vSel = document.getElementById('az-vorlage');
   425|  vSel.innerHTML = SCHULUNG_VORLAGEN.map(v => `<option value="${v.id}">${v.titel}</option>`).join('');
   426|  const tSel = document.getElementById('az-tenant');
   427|  tSel.innerHTML = `<option value="">— alle Unternehmen —</option>` +
   428|    APP_TENANTS.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
   429|  document.getElementById('az-frist').value = '';
   430|}
   431|
   432|function createZuweisung() {
   433|  const vorlagenId = document.getElementById('az-vorlage').value;
   434|  const tenantSel  = document.getElementById('az-tenant').value;
   435|  const frist      = document.getElementById('az-frist').value;
   436|  const pflicht    = document.getElementById('az-pflicht').checked;
   437|  const msgEl      = document.getElementById('az-msg');
   438|
   439|  if (!frist) { msgEl.textContent = 'Bitte eine Frist angeben.'; msgEl.style.background='#fee2e2';msgEl.style.color='#dc2626'; msgEl.classList.add('show'); return; }
   440|
   441|  const tenants = tenantSel ? [tenantSel] : APP_TENANTS.map(t => t.id);
   442|  tenants.forEach(tid => {
   443|    const id = `z_${tid}_${vorlagenId}_${Date.now()}`;
   444|    appState.zuweisungen.push({ id, vorlagenId, tenantId: tid, frist, pflicht });
   445|    addAudit('ZUWEISUNG', `Vorlage "${vorlagenId}" → ${tid} (Frist: ${frist})`);
   446|  });
   447|  saveState();
   448|
   449|  msgEl.textContent = `${tenants.length} Zuweisung(en) erstellt.`;
   450|  msgEl.style.background=''; msgEl.style.color='';
   451|  msgEl.classList.add('show');
   452|  setTimeout(()=>msgEl.classList.remove('show'), 3000);
   453|  renderAdminZuweisungen();
   454|  renderAdminStats();
   455|  renderAdminTenantTable();
   456|}
   457|
   458|function deleteZuweisung(id) {
   459|  if (!confirm('Zuweisung wirklich löschen?')) return;
   460|  appState.zuweisungen = appState.zuweisungen.filter(z => z.id !== id);
   461|  delete appState.formulare[id];
   462|  saveState();
   463|  addAudit('LOESCHEN', `Zuweisung ${id} gelöscht`);
   464|  renderAdminZuweisungen();
   465|  renderAdminStats();
   466|  renderAdminTenantTable();
   467|}
   468|
   469|// ══════════════════════════════════════════════════════════════
   470|//  SUBUNTERNEHMEN DASHBOARD
   471|// ══════════════════════════════════════════════════════════════
   472|function renderSubDashboard() {
   473|  const tenant = APP_TENANTS.find(t => t.id === currentUser.tenantId);
   474|  document.getElementById('sub-username').textContent   = currentUser.name;
   475|  document.getElementById('sub-tenantname').textContent = tenant ? tenant.name : '';
   476|
   477|  const meineZuws = appState.zuweisungen.filter(z => z.tenantId === currentUser.tenantId);
   478|  const stati = meineZuws.map(z => berechneStatus(z));
   479|  const g = stati.filter(s=>s==='gruen').length;
   480|  const y = stati.filter(s=>s==='gelb').length;
   481|  const r = stati.filter(s=>s==='rot').length;
   482|
   483|  document.getElementById('sub-stats').innerHTML = `
   484|    <div class="stat-tile gruen"><div class="zahl">${g}</div><div class="label">Abgeschlossen</div></div>
   485|    <div class="stat-tile gelb"><div class="zahl">${y}</div><div class="label">In Bearbeitung</div></div>
   486|    <div class="stat-tile rot"><div class="zahl">${r}</div><div class="label">Offen / Dringend</div></div>
   487|  `;
   488|
   489|  if (meineZuws.length === 0) {
   490|    document.getElementById('sub-schulungen-list').innerHTML =
   491|      '<div class="empty-state"><div class="icon">🎉</div><p>Keine Schulungen zugewiesen</p></div>';
   492|    return;
   493|  }
   494|
   495|  document.getElementById('sub-schulungen-list').innerHTML = meineZuws.map(z => {
   496|    const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === z.vorlagenId);
   497|    const status  = berechneStatus(z);
   498|    const form    = appState.formulare[z.id] || {};
   499|    const readOnly = form.abgeschlossen;
   500|    return `
   501|      <div class="schulung-item" onclick="oeffneFormular('${z.id}')">
   502|        <div>
   503|          <div class="titel">${vorlage ? vorlage.titel : z.vorlagenId}</div>
   504|          <div class="meta">
   505|            Frist: ${z.frist||'–'}
   506|            ${z.pflicht ? ' • <strong>Pflichtschulung</strong>' : ''}
   507|            ${readOnly ? ` • Abgeschlossen: ${dateStr(form.abgeschlossenAm)}` : ''}
   508|          </div>
   509|        </div>
   510|        <div class="right">
   511|          ${statusBadgeHtml(status)}
   512|          ${readOnly ? '<div style="font-size:.72rem;color:#16a34a;margin-top:4px">📄 PDF verfügbar</div>' : ''}
   513|        </div>
   514|      </div>
   515|    `;
   516|  }).join('');
   517|}
   518|
   519|// ══════════════════════════════════════════════════════════════
   520|//  FORMULAR
   521|// ══════════════════════════════════════════════════════════════
   522|let sigPads = {};  // { feldId: { canvas, ctx, drawing } }
   523|let uploadFiles = {};  // { feldId: File }
   524|
   525|function oeffneFormular(zuwId) {
   526|  activeZuwId = zuwId;
   527|  sigPads     = {};
   528|  uploadFiles = {};
   529|
   530|  const zuw     = appState.zuweisungen.find(z => z.id === zuwId);
   531|  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
   532|  const form    = appState.formulare[zuwId] || {};
   533|  const status  = berechneStatus(zuw);
   534|  const readOnly = !!form.abgeschlossen;
   535|
   536|  document.getElementById('formular-titel').textContent = vorlage ? vorlage.titel : zuwId;
   537|  document.getElementById('formular-user-info').textContent = currentUser.name;
   538|  document.getElementById('formular-status-bar').innerHTML = `
   539|    ${statusBadgeHtml(status)}
   540|    <span style="font-size:.8rem;color:#6b7280;margin-left:8px">Frist: ${zuw.frist||'–'}</span>
   541|    ${readOnly ? '<span style="font-size:.8rem;color:#16a34a;margin-left:8px">🔒 Schreibgeschützt</span>' : ''}
   542|  `;
   543|
   544|  // Aktions-Buttons ausblenden wenn read-only
   545|  const btnArea = document.querySelector('#screen-formular [style*="margin-top:4px"]');
   546|  if (btnArea) btnArea.style.display = readOnly ? 'none' : 'flex';
   547|
   548|  let html = `<p class="pflicht-hinweis"><span>*</span> Pflichtfelder</p>`;
   549|  if (!vorlage) { html += '<p>Vorlage nicht gefunden.</p>'; }
   550|  else {
   551|    vorlage.abschnitte.forEach(abschnitt => {
   552|      html += `<div class="form-section"><div class="form-section-title">${abschnitt.titel}</div>`;
   553|      abschnitt.felder.forEach(feld => {
   554|        const val = (form.felder || {})[feld.id] || '';
   555|        html += renderFeld(feld, val, readOnly);
   556|      });
   557|      html += '</div>';
   558|    });
   559|  }
   560|
   561|  document.getElementById('formular-body').innerHTML = html;
   562|  document.getElementById('formular-fehler').classList.remove('show');
   563|  document.getElementById('formular-success').classList.remove('show');
   564|
   565|  // Signature-Pads initialisieren
   566|  if (!readOnly && vorlage) {
   567|    vorlage.abschnitte.forEach(ab => {
   568|      ab.felder.filter(f => f.typ === 'signature').forEach(f => {
   569|        initSigPad(f.id, (form.felder||{})[f.id]);
   570|      });
   571|    });
   572|  } else if (readOnly && vorlage) {
   573|    // read-only: Unterschriften als Bild einbetten (schon im HTML via <img>)
   574|  }
   575|
   576|  // Upload-Events
   577|  if (!readOnly && vorlage) {
   578|    vorlage.abschnitte.forEach(ab => {
   579|      ab.felder.filter(f => f.typ === 'upload').forEach(f => {
   580|        const input = document.getElementById(`upload_${f.id}`);
   581|        if (input) {
   582|          input.addEventListener('change', e => {
   583|            const file = e.target.files[0];
   584|            if (file) {
   585|              uploadFiles[f.id] = file;
   586|              const zone = document.getElementById(`zone_${f.id}`);
   587|              if (zone) { zone.classList.add('has-file'); zone.querySelector('p').textContent = file.name; }
   588|            }
   589|          });
   590|        }
   591|      });
   592|    });
   593|  }
   594|
   595|  showScreen('screen-formular');
   596|  window.scrollTo(0,0);
   597|}
   598|
   599|function renderFeld(feld, val, readOnly) {
   600|  const pflicht = feld.pflicht ? `<span class="pflicht-mark">*</span>` : '';
   601|  if (feld.typ === 'text') {
   602|    return `<div class="form-group">
   603|      <label>${feld.label} ${pflicht}</label>
   604|      <input type="text" id="feld_${feld.id}" value="${escHtml(val)}" placeholder="${feld.placeholder||''}" ${readOnly?'readonly':''}
   605|             style="${readOnly?'background:#f4f6f9;color:#374151':''}">
   606|    </div>`;
   607|  }
   608|  if (feld.typ === 'textarea') {
   609|    return `<div class="form-group">
   610|      <label>${feld.label} ${pflicht}</label>
   611|      <textarea id="feld_${feld.id}" ${readOnly?'readonly':''}
   612|                style="${readOnly?'background:#f4f6f9;color:#374151':''}">${escHtml(val)}</textarea>
   613|    </div>`;
   614|  }
   615|  if (feld.typ === 'select') {
   616|    const opts = (feld.optionen||[]).map(o =>
   617|      `<option value="${escHtml(o)}" ${val===o?'selected':''}>${escHtml(o)}</option>`
   618|    ).join('');
   619|    return `<div class="form-group">
   620|      <label>${feld.label} ${pflicht}</label>
   621|      <select id="feld_${feld.id}" ${readOnly?'disabled':''}>
   622|        <option value="">— bitte wählen —</option>${opts}
   623|      </select>
   624|    </div>`;
   625|  }
   626|  if (feld.typ === 'checkbox') {
   627|    return `<div class="form-group">
   628|      <div class="checkbox-field ${val?'checked':''}">
   629|        <input type="checkbox" id="feld_${feld.id}" ${val?'checked':''} ${readOnly?'disabled':''}
   630|               onchange="this.closest('.checkbox-field').classList.toggle('checked',this.checked)">
   631|        <label for="feld_${feld.id}">${feld.label} ${pflicht}</label>
   632|      </div>
   633|    </div>`;
   634|  }
   635|  if (feld.typ === 'signature') {
   636|    if (readOnly && val) {
   637|      return `<div class="form-group">
   638|        <label>${feld.label}</label>
   639|        <img src="${val}" style="max-width:300px;border:1px solid #dde2e9;border-radius:8px;display:block">
   640|      </div>`;
   641|    }
   642|    return `<div class="form-group">
   643|      <label>${feld.label} ${pflicht}</label>
   644|      <div class="sig-container">
   645|        <canvas id="sig_${feld.id}" class="sig-canvas" height="120"></canvas>
   646|      </div>
   647|      <div class="sig-actions">
   648|        <button type="button" class="btn btn-secondary btn-sm" onclick="clearSig('${feld.id}')">✕ Löschen</button>
   649|        <span style="font-size:.75rem;color:#6b7280;line-height:1.2">Mit Finger oder Maus unterschreiben</span>
   650|      </div>
   651|    </div>`;
   652|  }
   653|  if (feld.typ === 'upload') {
   654|    if (readOnly && val) {
   655|      return `<div class="form-group">
   656|        <label>${feld.label}</label>
   657|        <span style="color:#16a34a;font-size:.88rem">✓ ${escHtml(val)}</span>
   658|      </div>`;
   659|    }
   660|    return `<div class="form-group">
   661|      <label>${feld.label} ${pflicht}</label>
   662|      <div class="upload-zone" id="zone_${feld.id}" onclick="document.getElementById('upload_${feld.id}').click()">
   663|        <div class="upload-icon">📎</div>
   664|        <p>Tippen zum Hochladen (PDF, Bild)</p>
   665|        <input type="file" id="upload_${feld.id}" accept=".pdf,.png,.jpg,.jpeg">
   666|      </div>
   667|    </div>`;
   668|  }
   669|  return '';
   670|}
   671|
   672|function escHtml(s) {
   673|  if (!s) return '';
   674|  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
   675|}
   676|
   677|// ── SIGNATURE PAD ────────────────────────────────────────────
   678|function initSigPad(feldId, existingDataUrl) {
   679|  const canvas = document.getElementById(`sig_${feldId}`);
   680|  if (!canvas) return;
   681|  const dpr = window.devicePixelRatio || 1;
   682|  const w   = canvas.offsetWidth  || 300;
   683|  canvas.width  = w * dpr;
   684|  canvas.height = 120 * dpr;
   685|  const ctx = canvas.getContext('2d');
   686|  ctx.scale(dpr, dpr);
   687|  ctx.strokeStyle = '#0047CC';
   688|  ctx.lineWidth   = 2.2;
   689|  ctx.lineCap     = 'round';
   690|  ctx.lineJoin    = 'round';
   691|
   692|  if (existingDataUrl) {
   693|    const img = new Image();
   694|    img.onload = () => ctx.drawImage(img, 0, 0, w, 120);
   695|    img.src = existingDataUrl;
   696|  }
   697|
   698|  let drawing = false, lastX = 0, lastY = 0;
   699|
   700|  function getPos(e) {
   701|    const rect = canvas.getBoundingClientRect();
   702|    const src  = e.touches ? e.touches[0] : e;
   703|    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
   704|  }
   705|  function start(e) { drawing=true; const p=getPos(e); lastX=p.x; lastY=p.y; }
   706|  function move(e)  {
   707|    if (!drawing) return;
   708|    e.preventDefault();
   709|    const p=getPos(e);
   710|    ctx.beginPath(); ctx.moveTo(lastX,lastY); ctx.lineTo(p.x,p.y); ctx.stroke();
   711|    lastX=p.x; lastY=p.y;
   712|  }
   713|  function end() { drawing=false; }
   714|
   715|  canvas.addEventListener('mousedown',  start);
   716|  canvas.addEventListener('mousemove',  move);
   717|  canvas.addEventListener('mouseup',    end);
   718|  canvas.addEventListener('mouseleave', end);
   719|  canvas.addEventListener('touchstart', start, { passive: false });
   720|  canvas.addEventListener('touchmove',  move,  { passive: false });
   721|  canvas.addEventListener('touchend',   end,   { passive: false });
   722|
   723|  sigPads[feldId] = { canvas, ctx };
   724|}
   725|
   726|function clearSig(feldId) {
   727|  const pad = sigPads[feldId];
   728|  if (!pad) return;
   729|  const dpr = window.devicePixelRatio || 1;
   730|  const w   = pad.canvas.offsetWidth || 300;
   731|  pad.ctx.clearRect(0, 0, w, 120);
   732|}
   733|
   734|function isSigEmpty(feldId) {
   735|  const pad = sigPads[feldId];
   736|  if (!pad) return true;
   737|  const blankCanvas = document.createElement('canvas');
   738|  blankCanvas.width  = pad.canvas.width;
   739|  blankCanvas.height = pad.canvas.height;
   740|  return pad.canvas.toDataURL() === blankCanvas.toDataURL();
   741|}
   742|
   743|function getSigDataUrl(feldId) {
   744|  const pad = sigPads[feldId];
   745|  if (!pad || isSigEmpty(feldId)) return null;
   746|  return pad.canvas.toDataURL('image/png');
   747|}
   748|
   749|// ── FORMULAR SPEICHERN ───────────────────────────────────────
   750|function formularSpeichern(abschliessen) {
   751|  const zuw     = appState.zuweisungen.find(z => z.id === activeZuwId);
   752|  if (!zuw) return;
   753|  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
   754|  const fehlEl  = document.getElementById('formular-fehler');
   755|  fehlEl.classList.remove('show');
   756|
   757|  const felder = {};
   758|  let fehler   = [];
   759|
   760|  vorlage.abschnitte.forEach(ab => {
   761|    ab.felder.forEach(feld => {
   762|      if (feld.typ === 'text' || feld.typ === 'textarea') {
   763|        const el = document.getElementById(`feld_${feld.id}`);
   764|        if (el) felder[feld.id] = el.value.trim();
   765|        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label);
   766|      } else if (feld.typ === 'select') {
   767|        const el = document.getElementById(`feld_${feld.id}`);
   768|        if (el) felder[feld.id] = el.value;
   769|        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label);
   770|      } else if (feld.typ === 'checkbox') {
   771|        const el = document.getElementById(`feld_${feld.id}`);
   772|        if (el) felder[feld.id] = el.checked;
   773|        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label);
   774|      } else if (feld.typ === 'signature') {
   775|        const dataUrl = getSigDataUrl(feld.id);
   776|        const existing = (appState.formulare[activeZuwId]||{}).felder?.[feld.id];
   777|        felder[feld.id] = dataUrl || existing || null;
   778|        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label + ' (Unterschrift)');
   779|      } else if (feld.typ === 'upload') {
   780|        const file     = uploadFiles[feld.id];
   781|        const existing = (appState.formulare[activeZuwId]||{}).felder?.[feld.id];
   782|        felder[feld.id] = file ? file.name : (existing || null);
   783|        if (feld.pflicht && abschliessen && !felder[feld.id]) fehler.push(feld.label);
   784|      }
   785|    });
   786|  });
   787|
   788|  if (fehler.length > 0) {
   789|    fehlEl.textContent = 'Bitte ausfüllen: ' + fehler.join(', ');
   790|    fehlEl.classList.add('show');
   791|    return;
   792|  }
   793|
   794|  if (abschliessen) {
   795|    abschlussCallback = () => doAbschluss(felder);
   796|    document.getElementById('modal-abschluss').classList.add('active');
   797|  } else {
   798|    if (!appState.formulare[activeZuwId]) appState.formulare[activeZuwId] = {};
   799|    appState.formulare[activeZuwId].felder    = felder;
   800|    appState.formulare[activeZuwId].gestartet = true;
   801|    appState.formulare[activeZuwId].gespeichertAm = now();
   802|    saveState();
   803|    addAudit('ZWISCHENSPEICHERN', `Schulung "${vorlage.titel}" (${zuw.tenantId})`);
   804|    const succ = document.getElementById('formular-success');
   805|    succ.textContent = '✅ Zwischengespeichert!';
   806|    succ.classList.add('show');
   807|    setTimeout(() => succ.classList.remove('show'), 2500);
   808|  }
   809|}
   810|
   811|function doAbschluss(felder) {
   812|  const zuw     = appState.zuweisungen.find(z => z.id === activeZuwId);
   813|  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
   814|
   815|  if (!appState.formulare[activeZuwId]) appState.formulare[activeZuwId] = {};
   816|  appState.formulare[activeZuwId].felder          = felder;
   817|  appState.formulare[activeZuwId].gestartet       = true;
   818|  appState.formulare[activeZuwId].abgeschlossen   = true;
   819|  appState.formulare[activeZuwId].abgeschlossenAm = now();
   820|  appState.formulare[activeZuwId].abgeschlossenVon= currentUser.name;
   821|  saveState();
   822|  addAudit('ABSCHLUSS', `Schulung "${vorlage.titel}" abgeschlossen`);
   823|  closeModal();
   824|
   825|  // PDF generieren
   826|  generatePdf(activeZuwId, false);
   827|
   828|  // Zurück zum Dashboard
   829|  setTimeout(() => {
   830|    if (currentUser.role === 'admin') { renderAdminDashboard(); showScreen('screen-admin'); }
   831|    else { renderSubDashboard(); showScreen('screen-sub'); }
   832|  }, 1500);
   833|}
   834|
   835|function backFromFormular() {
   836|  if (currentUser.role === 'admin') showScreen('screen-admin');
   837|  else showScreen('screen-sub');
   838|}
   839|
   840|// ── MODAL ────────────────────────────────────────────────────
   841|function closeModal() {
   842|  document.getElementById('modal-abschluss').classList.remove('active');
   843|}
   844|function abschlussBestaetigt() {
   845|  if (abschlussCallback) abschlussCallback();
   846|  abschlussCallback = null;
   847|}
   848|
   849|// ══════════════════════════════════════════════════════════════
   850|//  PDF-EXPORT  (jsPDF)
   851|// ══════════════════════════════════════════════════════════════
   852|function generatePdf(zuwId, downloadOnly) {
   853|  const zuw     = appState.zuweisungen.find(z => z.id === zuwId);
   854|  if (!zuw) return;
   855|  const vorlage = SCHULUNG_VORLAGEN.find(v => v.id === zuw.vorlagenId);
   856|  const tenant  = APP_TENANTS.find(t => t.id === zuw.tenantId);
   857|  const form    = appState.formulare[zuwId] || {};
   858|  const status  = berechneStatus(zuw);
   859|
   860|  // jsPDF laden (CDN)
   861|  if (typeof window.jspdf === 'undefined') {
   862|    alert('PDF-Bibliothek nicht geladen. Bitte Internetverbindung prüfen.');
   863|    return;
   864|  }
   865|  const { jsPDF } = window.jspdf;
   866|  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
   867|  const PL  = 18;  // links
   868|  const PT  = 18;  // oben
   869|  const PW  = 174; // Breite
   870|  let   y   = PT;
   871|
   872|  function addPage() { doc.addPage(); y = PT; }
   873|  function checkY(needed) { if (y + needed > 275) addPage(); }
   874|
   875|  // ── Kopfzeile ──
   876|  doc.setFillColor(26, 58, 92);
   877|  doc.rect(0, 0, 210, 22, 'F');
   878|  doc.setTextColor(255, 255, 255);
   879|  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
   880|  doc.text('Schulungsnachweis', PL, 13);
   881|  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
   882|  doc.text(new Date().toLocaleString('de-DE'), 210 - PL, 13, { align: 'right' });
   883|  y = 30;
   884|
   885|  // ── Titel ──
   886|  doc.setTextColor(26, 58, 92);
   887|  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
   888|  doc.text(vorlage ? vorlage.titel : zuwId, PL, y); y += 8;
   889|
   890|  // ── Metadaten ──
   891|  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
   892|  doc.setTextColor(80, 80, 80);
   893|  doc.text(`Unternehmen: ${tenant ? tenant.name : zuw.tenantId}`, PL, y); y += 5;
   894|  doc.text(`Frist: ${zuw.frist || '–'}  •  Pflichtschulung: ${zuw.pflicht ? 'Ja' : 'Nein'}`, PL, y); y += 5;
   895|  if (form.abgeschlossen) {
   896|    doc.text(`Abgeschlossen: ${dateStr(form.abgeschlossenAm)} von ${form.abgeschlossenVon||'–'}`, PL, y); y += 5;
   897|  }
   898|
   899|  // ── Ampel-Indikator ──
   900|  const ampelColor = status === 'gruen' ? [22,163,74] : status === 'gelb' ? [202,138,4] : [220,38,38];
   901|  doc.setFillColor(...ampelColor);
   902|  doc.roundedRect(PL, y, 38, 7, 2, 2, 'F');
   903|  doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
   904|  doc.text(statusLabel(status).toUpperCase(), PL + 19, y + 4.5, { align: 'center' });
   905|  y += 13;
   906|
   907|  // ── Trennlinie ──
   908|  doc.setDrawColor(200,200,200);
   909|  doc.line(PL, y, 210 - PL, y); y += 8;
   910|
   911|  // ── Felder ──
   912|  if (form.felder && vorlage) {
   913|    vorlage.abschnitte.forEach(abschnitt => {
   914|      checkY(12);
   915|      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
   916|      doc.setTextColor(26, 58, 92);
   917|      doc.text(abschnitt.titel.toUpperCase(), PL, y); y += 6;
   918|
   919|      abschnitt.felder.forEach(feld => {
   920|        const val = form.felder[feld.id];
   921|        checkY(10);
   922|        doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(60, 60, 60);
   923|        doc.text(feld.label + (feld.pflicht ? ' *' : ''), PL, y); y += 4.5;
   924|        doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
   925|
   926|        if (feld.typ === 'signature') {
   927|          if (val) {
   928|            checkY(30);
   929|            try {
   930|              doc.addImage(val, 'PNG', PL, y, 60, 22);
   931|              y += 26;
   932|            } catch(e) { doc.text('[Unterschrift nicht darstellbar]', PL, y); y += 6; }
   933|          } else { doc.setTextColor(180,180,180); doc.text('–', PL, y); y += 5; }
   934|        } else if (feld.typ === 'checkbox') {
   935|          const label = val ? '☑ Ja' : '☐ Nein';
   936|          doc.text(label, PL, y); y += 5;
   937|        } else if (feld.typ === 'upload') {
   938|          doc.text(val ? `📎 ${val}` : '–', PL, y); y += 5;
   939|        } else {
   940|          const lines = doc.splitTextToSize(String(val||'–'), PW);
   941|          doc.text(lines, PL, y); y += lines.length * 4.5 + 1;
   942|        }
   943|        checkY(2); y += 1;
   944|      });
   945|      y += 4;
   946|    });
   947|  }
   948|
   949|  // ── Fußzeile ──
   950|  const pageCount = doc.internal.getNumberOfPages();
   951|  for (let i = 1; i <= pageCount; i++) {
   952|    doc.setPage(i);
   953|    doc.setFontSize(7); doc.setTextColor(150,150,150);
   954|    doc.text(`Seite ${i} / ${pageCount}  •  Revisionssicher erstellt: ${new Date().toLocaleString('de-DE')}`, 105, 290, { align: 'center' });
   955|    doc.line(PL, 285, 210-PL, 285);
   956|  }
   957|
   958|  // Download
   959|  const dt  = new Date().toISOString().slice(0,10);
   960|  const fn  = `${dt}_${(vorlage?.titel||zuwId).replace(/\s+/g,'_')}_${zuw.tenantId}.pdf`;
   961|  doc.save(fn);
   962|}
   963|
   964|// ══════════════════════════════════════════════════════════════
   965|//  INIT
   966|// ══════════════════════════════════════════════════════════════
   967|document.addEventListener('DOMContentLoaded', () => {
   968|  loadState();
   969|  const session = checkSession();
   970|  if (session) {
   971|    currentUser = session;
   972|    routeAfterLogin();
   973|  } else {
   974|    showScreen('screen-login');
   975|  }
   976|});
   977|