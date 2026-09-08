const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const source = fs.readFileSync('app.js', 'utf8');

test('Verantwortlicher kann vollständige Firmendaten bearbeiten', () => {
  assert.match(source, /function firmenstammdatenOeffnen\(/);
  assert.match(source, /function firmenstammdatenOeffnen\([\s\S]*SB\.patch\('tenants'/);
  for (const field of ['strasse','hausnummer','plz','ort','land','ansprechpartner','kontakt_email','telefon','website']) assert.match(source, new RegExp(field));
  assert.match(source, /tenant_id=eq\.\$\{encodeURIComponent\(currentUser\.tenantId\)\}/);
});

test('Lizenznehmer-Bearbeitung verwendet Verantwortlichen als Hauptbenutzer', () => {
  assert.match(source, /const firmaU = APP_USERS\.find\(u => u\.tenant_id === tenantId && u\.role === 'verantwortlicher'\)/);
  assert.match(source, /\|\| APP_USERS\.find\(u => u\.tenant_id === tenantId && u\.role === 'firma'\)/);
  assert.doesNotMatch(source, /if \(!firmaU\) \{ msg\.textContent = 'Kein Firmen-Login/);
});

test('Verantwortlicher sieht die Firmendaten-Kachel', () => {
  assert.match(source, /sub-firmenstammdaten-btn/);
  assert.match(source, /isVerantwortlicher \? 'flex' : 'none'/);
});
