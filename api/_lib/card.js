// Wspólne: weryfikacja użytkownika i odczyt WŁASNEJ, UDOSTĘPNIONEJ wizytówki (RLS pilnuje właściciela).
const crypto = require('crypto');
const SB = process.env.SUPABASE_URL || 'https://pcokxvhnouzskiwictxy.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_X6TBn1y2PNiCHc8ZUEaJHQ_N75-w0Pa';
const PUBLIC = (process.env.PUBLIC_URL || 'https://referra.biz/').replace(/\/?$/, '/');
const okId = s => typeof s === 'string' && /^[a-z0-9_-]{1,40}$/i.test(s);

async function ownCard(req, id) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); if (!m) throw Object.assign(new Error('Zaloguj się.'), { code: 401 });
  if (!okId(id)) throw Object.assign(new Error('Zły identyfikator.'), { code: 400 });
  const r = await fetch(`${SB}/rest/v1/bni_cards?id=eq.${encodeURIComponent(id)}&select=id,data,shared`, { headers: { apikey: KEY, Authorization: 'Bearer ' + m[1] } });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Sesja wygasła. Zaloguj się ponownie.'), { code: 401 });
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error('Nie znaleziono wizytówki.'), { code: 404 });
  if (!rows[0].shared) throw Object.assign(new Error('Najpierw udostępnij wizytówkę kodem QR.'), { code: 409 });
  return rows[0];
}
// Publiczny stan karty (bez tokenu) — do ponownej weryfikacji przy pobraniu pliku .pkpass
async function publicCard(id) {
  const r = await fetch(`${SB}/rest/v1/rpc/get_public_card`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_id: id }) });
  const j = await r.json(); return j && j.card ? j.card : null;
}
const cardUrl = id => PUBLIC + '#c=' + encodeURIComponent(id);
const secret = () => { const s = process.env.WALLET_LINK_SECRET; if (!s || s.length < 24) throw Object.assign(new Error('Portfel nie jest jeszcze skonfigurowany.'), { code: 503 }); return s; };
const sign = (id, exp) => crypto.createHmac('sha256', secret()).update(id + '.' + exp).digest('base64url');
const send = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(obj)); };
const fail = (res, e) => send(res, e.code || 500, { error: e.code ? e.message : 'Błąd serwera.' });
module.exports = { ownCard, publicCard, cardUrl, sign, send, fail, okId, PUBLIC, secret };
