// ══════════════════════════════════════════════════════════════
//  SUPABASE CLIENT
// ══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://vziankbxuiqwekdbjewg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6aWFua2J4dWlxd2VrZGJqZXdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTcwODUxOCwiZXhwIjoyMDk3Mjg0NTE4fQ.HDQx0CkmFHfjMxWuiLleIa9E7nEkljOLZYt14UJESSE';

const SB = {
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  },

  async get(table, params = '') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: this.headers });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async post(table, data) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: this.headers, body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async patch(table, filter, data) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method: 'PATCH', headers: this.headers, body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async upsert(table, data) {
    const h = { ...this.headers, 'Prefer': 'return=representation,resolution=merge-duplicates' };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: h, body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },

  async uploadPdf(pdfBlob, filename, tenantId) {
    const path = `${tenantId}/${filename}`;
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/schulung-pdfs/${path}`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/pdf' },
      body: pdfBlob
    });
    if (!r.ok) throw new Error(await r.text());
    return path;
  },

  getPdfUrl(path) {
    return `${SUPABASE_URL}/storage/v1/object/public/schulung-pdfs/${path}`;
  }
};
