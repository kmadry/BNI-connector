// Test funkcji Portfela z tymczasowymi kluczami i atrapą bazy (bez prawdziwych kont Apple/Google).
const { execSync } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'w-'));
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${d}/k.pem -out ${d}/c.pem -subj /CN=test -days 2 2>/dev/null`);
const k = fs.readFileSync(d + '/k.pem'), c = fs.readFileSync(d + '/c.pem');
Object.assign(process.env, { WALLET_LINK_SECRET: 'x'.repeat(40), APPLE_PASS_TYPE_ID: 'pass.test', APPLE_TEAM_ID: 'TEAM123456', APPLE_SIGNER_CERT: c.toString('base64'), APPLE_SIGNER_KEY: k.toString('base64'), APPLE_WWDR: c.toString('base64'),
  GOOGLE_ISSUER_ID: '3388000000000000001', GOOGLE_SA_EMAIL: 'sa@p.iam.gserviceaccount.com', GOOGLE_SA_KEY: k.toString() });
const DB = { shared: { id: 'abc12345', shared: true, data: { name: 'Adam Przykładowy', company: 'Firma', phone: '+48 600', email: 'a@example.com' } }, priv: { id: 'priv0001', shared: false, data: { name: 'X' } } };
global.fetch = async (u, o) => {
  const j = v => ({ status: 200, json: async () => v });
  if (/rpc\/get_public_card/.test(u)) { const id = JSON.parse(o.body).p_id; return j(DB[id === 'abc12345' ? 'shared' : 'priv'] && id === 'abc12345' ? { card: DB.shared.data } : null); }
  const id = /id=eq\.([^&]+)/.exec(u)[1]; if (!/Bearer good/.test(o.headers.Authorization)) return { status: 401, json: async () => ({}) };
  return j(id === 'abc12345' ? [DB.shared] : id === 'priv0001' ? [DB.priv] : []);
};
const wallet = require('../api/wallet.js'), pass = require('../api/pass.js');
const call = (h, req) => new Promise(r => { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { r({ code: this.statusCode, body: b, h: this.headers }); } }; h(req, res); });
let bad = 0; const ok = (n, c) => { console.log((c ? 'ok   - ' : 'FAIL - ') + n); if (!c) bad++; };
(async () => {
  const post = (id, kind, tok) => call(wallet, { method: 'POST', headers: { authorization: tok ? 'Bearer ' + tok : '' }, body: { id, kind } });
  ok('bez logowania: 401', (await post('abc12345', 'google')).code === 401);
  ok('cudza/nieistniejąca karta: 404', (await post('nope0001', 'google', 'good')).code === 404);
  ok('prywatna karta: 409', (await post('priv0001', 'google', 'good')).code === 409);
  const g = await post('abc12345', 'google', 'good'); const gu = JSON.parse(g.body).url;
  const pl = JSON.parse(Buffer.from(gu.split('/').pop().split('.')[1], 'base64url'));
  ok('Google: link zapisu z kodem QR do wizytówki online', g.code === 200 && /^https:\/\/pay\.google\.com\/gp\/v\/save\//.test(gu) && /#c=abc12345$/.test(pl.payload.genericObjects[0].barcode.value));
  const a = await post('abc12345', 'apple', 'good'); const au = JSON.parse(a.body).url;
  const p = await call(pass, { url: au.replace('https://referra.biz', '') });
  ok('Apple: poprawny podpisany link zwraca plik .pkpass (zip)', p.code === 200 && p.h['Content-Type'] === 'application/vnd.apple.pkpass' && p.body.slice(0, 2).toString() === 'PK');
  ok('Apple: zmieniony podpis odrzucony', (await call(pass, { url: au.replace(/s=./, 's=Z') })).code === 403);
  ok('Apple: wygasły link odrzucony', (await call(pass, { url: au.replace(/e=\d+/, 'e=1') })).code === 410);
  console.log(bad ? bad + ' niepowodzeń' : 'wszystko OK'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(1); });
