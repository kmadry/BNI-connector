/* Logowanie Supabase Auth (REST): rejestracja, logowanie hasłem i linkiem, reset hasła, konto.
   Sesja jest w localStorage; błąd sieci NIGDY nie wylogowuje (aplikacja działa offline). */
(() => {
'use strict';
const CFG = window.BNI_CONFIG || {}, SK = 'bni-auth';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let sess = null, cb = {}, refreshing = null, mode = 'login', msg = null;
const now = () => Math.floor(Date.now() / 1000);
const redirect = () => encodeURIComponent(location.origin + location.pathname);

function loadSess() { try { const s = JSON.parse(localStorage.getItem(SK)); if (s && s.access_token && s.refresh_token && s.user && s.user.id) sess = s; } catch (e) {} }
function saveSess() { try { if (sess) localStorage.setItem(SK, JSON.stringify(sess)); else localStorage.removeItem(SK); } catch (e) {} }
function setSess(r) { sess = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at || now() + (r.expires_in || 3600), user: { id: r.user.id, email: r.user.email } }; saveSess(); }

const PL = [
  [/invalid login credentials/i, 'Nieprawidłowy e-mail lub hasło.'],
  [/email not confirmed/i, 'Potwierdź adres e-mail: kliknij link w wiadomości, którą wysłaliśmy.'],
  [/password should be at least|weak_password|password is known to be weak/i, 'Hasło jest za słabe. Użyj co najmniej 10 znaków.'],
  [/rate limit|too many|over_email_send_rate_limit|429/i, 'Za dużo prób. Spróbuj ponownie za kilka minut.'],
  [/same password/i, 'Nowe hasło musi się różnić od poprzedniego.'],
  [/unable to validate email|invalid email|invalid format/i, 'Podaj poprawny adres e-mail.']
];
const human = e => { const t = String((e && e.message) || e); for (const [re, m] of PL) if (re.test(t) || re.test(String(e && e.status))) return m; return 'Coś poszło nie tak. Spróbuj ponownie.'; };

async function api(path, body, o = {}) {
  const r = await fetch(CFG.url + '/auth/v1/' + path, { method: o.method || 'POST', headers: Object.assign({ apikey: CFG.key, 'Content-Type': 'application/json' }, o.token ? { Authorization: 'Bearer ' + o.token } : {}), body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error((j && (j.msg || j.error_description || j.message)) || 'Błąd ' + r.status); e.status = r.status; throw e; }
  return j;
}

/* ---- sesja ---- */
async function refresh() {
  if (!sess) return false;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try { const j = await api('token?grant_type=refresh_token', { refresh_token: sess.refresh_token }); setSess(j); return true; }
    catch (e) {
      if (e && (e.status === 400 || e.status === 401 || e.status === 403)) { clear(); if (cb.onSignedOut) cb.onSignedOut('expired'); }
      return false; // błąd sieci: zostajemy zalogowani i pracujemy offline
    } finally { refreshing = null; }
  })();
  return refreshing;
}
async function ensure() { if (sess && sess.expires_at - 60 < now()) await refresh(); }
function clear() { sess = null; saveSess(); }
const token = () => (sess ? sess.access_token : null);
const user = () => (sess ? sess.user : null);

/* ---- akcje ---- */
async function login(email, password) { const j = await api('token?grant_type=password', { email, password }); setSess(j); return j; }
async function signup(email, password) { const j = await api('signup?redirect_to=' + redirect(), { email, password }); if (j && j.access_token) { setSess(j); return { session: true }; } return { session: false }; }
async function magic(email) { await api('otp?redirect_to=' + redirect(), { email, create_user: false }); }
async function recover(email) { await api('recover?redirect_to=' + redirect(), { email }); }
async function updatePassword(password) { await ensure(); return api('user', { password }, { method: 'PUT', token: token() }); }
async function logout(all) { const t = token(); clear(); try { if (t) await api('logout' + (all ? '?scope=global' : ''), null, { token: t }); } catch (e) {} if (cb.onSignedOut) cb.onSignedOut('logout'); }

/* ---- link z e-maila (potwierdzenie, magic link, reset hasła) ---- */
async function consumeHash() {
  const h = location.hash.replace(/^#/, ''); if (!h || !/(access_token|error_description)=/.test(h)) return null;
  const p = new URLSearchParams(h); history.replaceState(null, '', location.pathname + location.search);
  if (p.get('error_description')) { msg = { t: 'err', m: /expired|invalid/i.test(p.get('error_description')) ? 'Link wygasł lub był już użyty. Poproś o nowy.' : 'Nie udało się użyć linku. Poproś o nowy.' }; return { error: true }; }
  const at = p.get('access_token'), rt = p.get('refresh_token'); if (!at || !rt) return null;
  try {
    const u = await api('user', null, { method: 'GET', token: at });
    setSess({ access_token: at, refresh_token: rt, expires_in: +p.get('expires_in') || 3600, user: u });
    return { type: p.get('type') || 'signup' };
  } catch (e) { msg = { t: 'err', m: 'Nie udało się zalogować z linku. Spróbuj ponownie.' }; return { error: true }; }
}

/* ---- ekran logowania ---- */
function render() {
  const v = $('#view-login'); if (!v) return;
  const m = msg ? `<p class="au-msg ${msg.t}" role="${msg.t === 'err' ? 'alert' : 'status'}">${esc(msg.m)}</p>` : '';
  const head = { login: ['Zaloguj się', 'Twoje wizytówki i kontakty są prywatne. Publiczna jest tylko wizytówka, którą sam udostępnisz kodem QR.'], signup: ['Załóż konto', 'Wystarczy e-mail i hasło. Wyślemy wiadomość z linkiem potwierdzającym.'], recover: ['Nie pamiętam hasła', 'Podaj e-mail. Jeśli konto istnieje, wyślemy link do ustawienia nowego hasła.'], magic: ['Logowanie linkiem', 'Podaj e-mail. Wyślemy link, który zaloguje Cię bez hasła.'], newpass: ['Ustaw nowe hasło', 'Wpisz nowe hasło (min. 10 znaków).'], sent: ['Sprawdź skrzynkę', ''] }[mode];
  let body = '';
  if (mode === 'sent') body = `<p class="step-help">${esc(msg ? msg.m : '')}</p><div class="wl-actions"><button type="button" data-au="login">Wróć do logowania</button></div>`;
  else {
    const f = (mode === 'login' || mode === 'signup' || mode === 'newpass');
    body = `<form id="au-form" novalidate>
      ${mode !== 'newpass' ? `<label>E-mail <input id="au-email" type="email" autocomplete="email" required></label>` : ''}
      ${f ? `<label>${mode === 'newpass' ? 'Nowe hasło' : 'Hasło'} <input id="au-pass" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="10" required></label>` : ''}
      ${mode === 'newpass' ? `<label>Powtórz hasło <input id="au-pass2" type="password" autocomplete="new-password" required></label>` : ''}
      ${m}
      <div class="wl-actions"><button class="primary" id="au-go">${{ login: 'Zaloguj', signup: 'Załóż konto', recover: 'Wyślij link', magic: 'Wyślij link', newpass: 'Zapisz hasło' }[mode]}</button></div></form>
      <div class="au-links">${mode === 'login' ? '<button type="button" class="back" data-au="signup">Nie masz konta? Załóż konto</button><button type="button" class="back" data-au="recover">Nie pamiętam hasła</button><button type="button" class="back" data-au="magic">Zaloguj linkiem z e-maila</button>' : mode !== 'newpass' ? '<button type="button" class="back" data-au="login">← Wróć do logowania</button>' : ''}</div>`;
  }
  v.innerHTML = `<div class="welcome"><div class="wl-panel"><svg class="wl-mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="2" y="2" width="36" height="36"/><text x="20" y="29" text-anchor="middle">R</text></svg><h1>${head[0]}</h1>${head[1] ? `<p class="step-help">${esc(head[1])}</p>` : ''}${body}</div></div>`;
  const first = v.querySelector('input'); if (first && mode !== 'sent') first.focus();
}
function go(m, message) { mode = m; msg = message || null; render(); }
document.addEventListener('click', e => { const b = e.target.closest('[data-au]'); if (b && $('#view-login')) go(b.dataset.au); });
document.addEventListener('submit', async e => {
  if (e.target.id !== 'au-form') return; e.preventDefault();
  const email = ($('#au-email') ? $('#au-email').value : '').trim(), pw = $('#au-pass') ? $('#au-pass').value : '', btn = $('#au-go');
  const fail = t => { msg = { t: 'err', m: t }; render(); const em = $('#au-email'); if (em) em.value = email; };
  if (mode !== 'newpass' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Podaj poprawny adres e-mail.');
  if ((mode === 'signup' || mode === 'newpass') && pw.length < 10) return fail('Hasło musi mieć co najmniej 10 znaków.');
  if (mode === 'newpass' && pw !== $('#au-pass2').value) return fail('Hasła nie są takie same.');
  if (mode === 'login' && !pw) return fail('Wpisz hasło.');
  btn.disabled = true; btn.textContent = 'Chwileczkę…';
  try {
    if (mode === 'login') { await login(email, pw); if (cb.onSession) cb.onSession(sess); }
    else if (mode === 'signup') { const r = await signup(email, pw); if (r.session) { if (cb.onSession) cb.onSession(sess); } else go('sent', { t: 'ok', m: 'Wysłaliśmy wiadomość na ' + email + '. Kliknij w link, aby potwierdzić konto, a potem zaloguj się.' }); }
    else if (mode === 'recover') { await recover(email); go('sent', { t: 'ok', m: 'Jeśli konto ' + email + ' istnieje, wysłaliśmy link do ustawienia nowego hasła.' }); }
    else if (mode === 'magic') { await magic(email); go('sent', { t: 'ok', m: 'Jeśli konto ' + email + ' istnieje, wysłaliśmy link do logowania.' }); }
    else if (mode === 'newpass') { await updatePassword(pw); msg = { t: 'ok', m: 'Hasło zmienione.' }; if (cb.onSession) cb.onSession(sess); }
  } catch (err) { fail(human(err)); }
});

/* ---- okno „Konto” ---- */
const dlg = document.createElement('dialog');
dlg.id = 'account-dialog'; dlg.setAttribute('aria-labelledby', 'ac-title');
dlg.innerHTML = `<div class="cf-body"><h2 id="ac-title">Konto i prywatność</h2><p class="sub" id="ac-mail"></p>
  <section class="cf-group"><h3>Twoje dane</h3>
    <p class="hint">Wizytówki, kontakty i połączenia widzisz tylko Ty. Publicznie widać wyłącznie wizytówkę, którą sam udostępnisz kodem QR.</p>
    <div class="cf-actions" style="justify-content:flex-start"><button type="button" id="ac-export">Pobierz moje dane</button><button type="button" class="danger" id="ac-wipe">Usuń wszystkie moje dane</button></div></section>
  <section class="cf-group"><h3>Hasło</h3><form id="ac-pw" novalidate><label>Nowe hasło (min. 10 znaków) <input id="ac-pass" type="password" autocomplete="new-password" minlength="10"></label><p class="au-msg" id="ac-pwmsg" role="status"></p><button type="submit">Zmień hasło</button></form></section>
  <div class="cf-actions"><button type="button" id="ac-logout">Wyloguj</button><button type="button" id="ac-logout-all">Wyloguj ze wszystkich urządzeń</button><button type="button" class="primary" id="ac-close">Zamknij</button></div></div>`;
document.body.appendChild(dlg);
function openAccount() { $('#ac-mail').textContent = sess ? sess.user.email : ''; $('#ac-pwmsg').textContent = ''; $('#ac-pass').value = ''; dlg.showModal(); }
dlg.addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'ac-close' || e.target === dlg) dlg.close();
  else if (id === 'ac-logout') { dlg.close(); await logout(false); }
  else if (id === 'ac-logout-all') { if (confirm('Wylogować ze wszystkich urządzeń?')) { dlg.close(); await logout(true); } }
  else if (id === 'ac-export') { const b = document.getElementById('btn-export'); if (b) b.click(); }
  else if (id === 'ac-wipe') { if (confirm('Usunąć WSZYSTKIE Twoje wizytówki, kontakty i połączenia? Tego nie da się cofnąć.') && window.BNI && window.BNI.wipeMyData) { await window.BNI.wipeMyData(); dlg.close(); } }
});
dlg.addEventListener('submit', async e => {
  if (e.target.id !== 'ac-pw') return; e.preventDefault(); const p = $('#ac-pass').value, out = $('#ac-pwmsg');
  if (p.length < 10) { out.textContent = 'Hasło musi mieć co najmniej 10 znaków.'; return; }
  try { await updatePassword(p); out.textContent = 'Hasło zmienione.'; $('#ac-pass').value = ''; } catch (err) { out.textContent = human(err); }
});

/* ---- start ---- */
async function start(callbacks) {
  cb = callbacks || {}; loadSess();
  const r = await consumeHash();
  if (r && r.type === 'recovery' && sess) { mode = 'newpass'; render(); if (cb.showLogin) cb.showLogin(); return; }
  if (sess) { await ensure(); if (sess && cb.onSession) { cb.onSession(sess); return; } }
  mode = 'login'; render(); if (cb.showLogin) cb.showLogin();
}
window.BNIAuth = { start, token, user, ensure, refresh, logout, openAccount, login, human, go, session: () => sess, _setCb: c => { cb = c; }, showLoginScreen: () => { mode = 'login'; render(); } };
})();
