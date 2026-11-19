// POST /api/wallet {id, kind:'google'|'apple'}  (Authorization: Bearer <token użytkownika>) → {url}
const crypto = require('crypto');
const { ownCard, cardUrl, sign, send, fail, PUBLIC } = require('./_lib/card.js');
const b64u = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

function googleLink(row) {
  const issuer = process.env.GOOGLE_ISSUER_ID, email = process.env.GOOGLE_SA_EMAIL, key = (process.env.GOOGLE_SA_KEY || '').replace(/\\n/g, '\n');
  if (!issuer || !email || !key) throw Object.assign(new Error('Karta Google Wallet nie jest jeszcze skonfigurowana.'), { code: 503 });
  const c = row.data || {}, classId = issuer + '.referra_card', objId = issuer + '.' + row.id.replace(/[^a-z0-9_-]/gi, '_');
  const lines = [c.company, c.phone].filter(Boolean);
  const payload = {
    iss: email, aud: 'google', typ: 'savetowallet', origins: [], iat: Math.floor(Date.now() / 1000),
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [{
        id: objId, classId, state: 'ACTIVE', hexBackgroundColor: '#1f1d1a',
        cardTitle: { defaultValue: { language: 'pl', value: 'Referra' } },
        header: { defaultValue: { language: 'pl', value: c.name || 'Wizytówka' } },
        subheader: { defaultValue: { language: 'pl', value: lines.join(' · ') } },
        barcode: { type: 'QR_CODE', value: cardUrl(row.id), alternateText: 'Wizytówka online' },
        textModulesData: [c.email && { id: 'email', header: 'E-mail', body: c.email }, c.city && { id: 'city', header: 'Miasto', body: c.city }].filter(Boolean),
        linksModuleData: { uris: [{ uri: cardUrl(row.id), description: 'Wizytówka online' }] }
      }]
    }
  };
  const head = b64u({ alg: 'RS256', typ: 'JWT' }), body = b64u(payload);
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(key).toString('base64url');
  return 'https://pay.google.com/gp/v/save/' + head + '.' + body + '.' + sig;
}
function appleLink(row) {
  const exp = Math.floor(Date.now() / 1000) + 300;
  return PUBLIC.replace(/\/$/, '') + '/api/pass?c=' + encodeURIComponent(row.id) + '&e=' + exp + '&s=' + sign(row.id, exp);
}
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Metoda niedozwolona.' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const row = await ownCard(req, b.id);
    if (b.kind === 'google') return send(res, 200, { url: googleLink(row) });
    if (b.kind === 'apple') return send(res, 200, { url: appleLink(row) });
    send(res, 400, { error: 'Nieznany rodzaj karty.' });
  } catch (e) { fail(res, e); }
};
