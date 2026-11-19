// Pomocnik testów: logowanie kont testowych przez REST i wstrzykiwanie sesji do przeglądarki.
// Dane kont: plik JSON wskazany w BNI_E2E_CREDS: {"a":{"email","password"},"b":{"email","password"}} (nie trzymaj go w repo).
const fs = require('fs'), path = require('path');
const cfgSrc = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
const URL_ = /url:\s*'([^']+)'/.exec(cfgSrc)[1], KEY_ = /key:\s*'([^']+)'/.exec(cfgSrc)[1];

function creds() {
  const f = process.env.BNI_E2E_CREDS;
  if (!f || !fs.existsSync(f)) { console.error('Brak kont testowych. Ustaw BNI_E2E_CREDS na plik JSON z kontami "a" i "b" (patrz tests/auth-helper.js).'); process.exit(3); }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}
async function signIn(u) {
  const r = await fetch(URL_ + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY_, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.password }) });
  const j = await r.json(); if (!r.ok) throw new Error('logowanie testowe nie powiodło się: ' + (j.msg || r.status));
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, user: { id: j.user.id, email: j.user.email } };
}
// sesja + flagi użytkownika w localStorage zanim strona się załaduje
async function inject(ctx, sess, flags = {}) {
  await ctx.addInitScript(([s, f]) => {
    try {
      localStorage.setItem('bni-auth', JSON.stringify(s));
      if (f.onboarded !== false) localStorage.setItem('bni-onboarded:' + s.user.id, '1');
      if (f.mine) localStorage.setItem('bni-my-card:' + s.user.id, f.mine);
    } catch (e) {}
  }, [sess, flags]);
}
async function rest(sess, method, p, body, extra) {
  const h = { apikey: KEY_, 'Content-Type': 'application/json' }; if (sess) h.Authorization = 'Bearer ' + sess.access_token; Object.assign(h, extra || {});
  const r = await fetch(URL_ + '/rest/v1/' + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {} return { status: r.status, body: j };
}
module.exports = { creds, signIn, inject, rest, URL: URL_, KEY: KEY_ };
