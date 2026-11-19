(() => {
'use strict';
let KEY = 'bni-connector-v3:anon';
try { // jednorazowo porzuć stare dane lokalne (v1)
  if (!localStorage.getItem('bni-migrated-v2')) { localStorage.removeItem('bni-connector-v1'); localStorage.removeItem('bni-synced'); localStorage.setItem('bni-migrated-v2', '1'); }
} catch (e) {}
const MAX_ROWS = 20;
const QUESTIONS = [
  'Trzech najlepszych klientów / branże:',
  'Dlaczego klienci myślą, że jesteś dobry?',
  'Potencjalni najlepsi klienci:',
  'Co powiedzieć?',
  'Kto przekazuje Ci rekomendacje?',
  'Skąd się wzięła Twoja najlepsza rekomendacja?',
  'Czego słuchać?',
  'Najbardziej rentowna usługa:'
];
const OFFERED_COLS = [['name','Imię i nazwisko'],['company','Firma'],['industry','Branża'],['relation','Relacja biznesowa'],['scale','Skala Biznesu']];
const SOUGHT_COLS  = [['name','Imię i nazwisko'],['company','Firma'],['industry','Branża'],['why','Dlaczego poszukuję?']];

let state = load();
let currentId = state.cards[0]?.id || null;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const SAFE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const okId = v => SAFE_ID.test(String(v));
const okLink = l => l && okId(l.id) && okId(l.from) && okId(l.to);
const normCard = c => { const d = newCard(); const o = Object.assign({}, d, c); if (!okId(o.id)) o.id = uid(); if (!/^#[0-9a-f]{3,8}$/i.test(String(o.accent))) o.accent = '#e8473f'; o.qa = Array.isArray(c.qa) && c.qa.length ? c.qa : d.qa; o.offered = Array.isArray(c.offered) && c.offered.length ? c.offered : [{}]; o.sought = Array.isArray(c.sought) && c.sought.length ? c.sought : [{}]; return o; };
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.cards)) return { cards: s.cards.map(normCard), links: s.links || [], contacts: s.contacts || [], settings: s.settings || {} }; } catch (e) {}
  return { cards: [], links: [], contacts: [], settings: {} };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} schedulePush(); }
function toast(msg) { const sn = document.getElementById('snack'); if (sn) sn.classList.remove('show'); const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

/* ---------- chmura (Supabase REST) ---------- */
const CFG = window.BNI_CONFIG || {};
const cloud = !!(CFG.url && CFG.key);
const authHeaders = () => ({ apikey: CFG.key, Authorization: 'Bearer ' + ((window.BNIAuth && window.BNIAuth.token()) || CFG.key), 'Content-Type': 'application/json' });
const myUid = () => { const u = window.BNIAuth && window.BNIAuth.user(); return u ? u.id : 'anon'; };
let guardHit = false, remoteContacts = new Set(), remoteCards = new Set(), remoteLinks = new Set(), dirty = false, pushTimer = null, pushing = Promise.resolve();
function setSync(t, cls) { const el = $('#sync'); if (el) { el.textContent = t; el.className = cls || ''; } }
async function rest(path, opt = {}) {
  if (window.BNIAuth) await window.BNIAuth.ensure();
  let r = await fetch(CFG.url + '/rest/v1/' + path, Object.assign({ headers: authHeaders() }, opt));
  if (r.status === 401 && window.BNIAuth && await window.BNIAuth.refresh()) r = await fetch(CFG.url + '/rest/v1/' + path, Object.assign({}, opt, { headers: Object.assign({}, opt.headers || {}, authHeaders()) }));
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.status === 204 ? null : r.json().catch(() => null);
}
async function rpc(name, args) {
  const r = await fetch(CFG.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
  if (!r.ok) throw new Error('rpc ' + r.status);
  return r.json();
}
async function pull() {
  if (!cloud) return false;
  try {
    if (dirty) await push();
    let [cs, ls, ks, ss] = await Promise.all([rest('bni_cards?select=id,data,shared'), rest('bni_links?select=id,from_id,to_id,note'), rest('bni_contacts?select=id,data'), rest('bni_settings?select=id,data').catch(() => [])]);
    cs = cs.filter(r => okId(r.id)); ks = ks.filter(r => okId(r.id)); ls = ls.filter(l => okId(l.id) && okId(l.from_id) && okId(l.to_id));
    const remoteSettings = {}; (ss || []).forEach(r => { if (r.id === 'logo:' + myUid()) remoteSettings.logo = sanitizeLogo(r.data); });
    const remote = { settings: remoteSettings, cards: cs.map(r => normCard(Object.assign({}, r.data || {}, { shared: !!r.shared }))), links: ls.map(l => ({ id: l.id, from: l.from_id, to: l.to_id, note: l.note })), contacts: ks.map(r => Object.assign({}, r.data, { id: r.id })) };
    remoteCards = new Set(cs.map(r => r.id)); remoteLinks = new Set(ls.map(l => l.id)); remoteContacts = new Set(ks.map(r => r.id));
    state = remote;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    if (!getCard(currentId)) currentId = ((typeof getMine === 'function' && getMine()) || state.cards[0])?.id || null;
    setSync('synchronizacja OK', 'ok'); return true;
  } catch (e) { setSync('offline (dane lokalne)', 'err'); return false; }
}
window.addEventListener('online', () => { if (dirty) push(); });
function schedulePush() { if (!cloud) return; dirty = true; clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); }
function push() {
  if (!cloud || !dirty) return pushing;
  dirty = false; clearTimeout(pushTimer);
  const snap = JSON.parse(JSON.stringify(state));
  pushing = pushing.then(async () => {
    try {
      if (window.BNIAuth) await window.BNIAuth.ensure();
      const up = { method: 'POST', headers: Object.assign({}, authHeaders(), { Prefer: 'resolution=merge-duplicates,return=minimal' }) };
      const ids = new Set(snap.cards.map(c => c.id)), lids = new Set(snap.links.map(l => l.id)), kids = new Set((snap.contacts || []).map(c => c.id));
      const delK = [...remoteContacts].filter(i => !kids.has(i));
      if (delK.length > 5) { guardHit = true; delK.length = 0; }
      if (delK.length) await rest('bni_contacts?id=in.(' + delK.map(encodeURIComponent).join(',') + ')', { method: 'DELETE' });
      if (kids.size) await rest('bni_contacts?on_conflict=id', Object.assign({ body: JSON.stringify(snap.contacts.map(c => ({ id: c.id, data: c, updated_at: new Date().toISOString() }))) }, up));
      remoteContacts = kids;
      if (snap.settings && snap.settings.logo) await rest('bni_settings?on_conflict=id', Object.assign({ body: JSON.stringify([{ id: 'logo:' + myUid(), data: snap.settings.logo, updated_at: new Date().toISOString() }]) }, up));
      const delL = [...remoteLinks].filter(i => !lids.has(i)), delC = [...remoteCards].filter(i => !ids.has(i));
      if (delL.length > 5) { guardHit = true; delL.length = 0; }
      if (delL.length) await rest('bni_links?id=in.(' + delL.map(encodeURIComponent).join(',') + ')', { method: 'DELETE' });
      if (delC.length > 1) { guardHit = true; delC.length = 0; }
      if (delC.length) await rest('bni_cards?id=in.(' + delC.map(encodeURIComponent).join(',') + ')', { method: 'DELETE' });
      if (snap.cards.length) await rest('bni_cards?on_conflict=id', Object.assign({ body: JSON.stringify(snap.cards.map(c => ({ id: c.id, data: c, shared: !!c.shared, updated_at: new Date().toISOString() }))) }, up));
      const ok = snap.links.filter(l => ids.has(l.from) && ids.has(l.to));
      if (ok.length) await rest('bni_links?on_conflict=id', Object.assign({ body: JSON.stringify(ok.map(l => ({ id: l.id, from_id: l.from, to_id: l.to, note: l.note || '' }))) }, up));
      remoteCards = ids; remoteLinks = new Set(ok.map(l => l.id));
      setSync(guardHit ? 'zatrzymano masowe usuwanie (dane w bazie bezpieczne)' : 'zapisano', guardHit ? 'err' : 'ok'); guardHit = false;
    } catch (e) { dirty = true; setSync('błąd zapisu', 'err'); }
  });
  return pushing;
}

function bootUser(uid) {
  KEY = 'bni-connector-v3:' + uid; MINE_KEY = 'bni-my-card:' + uid; ONB_KEY = 'bni-onboarded:' + uid;
  state = load(); currentId = ((getMineId() && getCard(getMineId())) || state.cards[0])?.id || null;
  remoteCards = new Set(); remoteLinks = new Set(); remoteContacts = new Set(); dirty = false;
}
function teardown() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(MINE_KEY); localStorage.removeItem(ONB_KEY); } catch (e) {}
  state = { cards: [], links: [], contacts: [], settings: {} }; currentId = null; remoteCards = new Set(); remoteLinks = new Set(); remoteContacts = new Set(); dirty = false; clearTimeout(pushTimer);
  KEY = 'bni-connector-v3:anon'; if (window.BNIPwa) window.BNIPwa.clearQr();
}
async function wipeMyData() {
  try { for (const t of ['bni_links', 'bni_cards', 'bni_contacts', 'bni_settings']) await rest(t + '?id=not.is.null', { method: 'DELETE' }); } catch (e) { toast('Nie udało się usunąć danych. Spróbuj ponownie.'); return; }
  state = { cards: [], links: [], contacts: [], settings: {} }; currentId = null; remoteCards = new Set(); remoteLinks = new Set(); remoteContacts = new Set(); dirty = false;
  try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.removeItem(MINE_KEY); } catch (e) {}
  if (window.BNIPwa) window.BNIPwa.clearQr(); renderList(); show('cards'); toast('Usunięto wszystkie Twoje dane');
}

function newCard(over = {}) {
  return Object.assign({
    id: uid(), name: '', group: '', city: '', company: '', phone: '', phone2: '', email: '', accent: '#e8473f',
    qa: QUESTIONS.map(q => ({ q, a: '' })),
    offered: [{}], sought: [{}]
  }, over);
}
window.BNI_SAFE = { okId, normCard };
/* ---------- logo (konfigurowalne; domyślnie BNI jak we wzorze wizytówki) ---------- */
const DEFAULT_LOGO = { mode: 'text', text: 'BNI', color: '', italic: true, reg: true, image: '', referra: true };
const IMG_RE = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+\/=]+$/;
function sanitizeLogo(l) {
  l = Object.assign({}, DEFAULT_LOGO, l && typeof l === 'object' ? l : {});
  return { mode: l.mode === 'image' && IMG_RE.test(String(l.image)) && String(l.image).length < 260000 ? 'image' : 'text',
    text: String(l.text || 'BNI').replace(/[<>]/g, '').slice(0, 14) || 'BNI',
    color: /^#[0-9a-f]{3,8}$/i.test(String(l.color)) ? l.color : '',
    italic: l.italic !== false, reg: l.reg !== false, referra: l.referra !== false,
    image: IMG_RE.test(String(l.image)) && String(l.image).length < 260000 ? l.image : '' };
}
const getLogo = () => sanitizeLogo(state.settings && state.settings.logo);
function setLogo(l) { state.settings = state.settings || {}; state.settings.logo = sanitizeLogo(l); save(); }
function logoHTML(l, accent, basePt) {
  l = sanitizeLogo(l);
  if (l.mode === 'image') return `<img class="logo-img" src="${l.image}" alt="Logo">`;
  const col = l.color || accent || '#c4251d', len = l.text.length;
  const size = basePt ? `font-size:${Math.max(12, Math.round(basePt - Math.max(0, len - 3) * 2.6))}pt;` : '';
  return `<span class="logo-txt${l.italic ? ' it' : ''}" style="${size}color:${esc(col)}">${esc(l.text)}${l.reg ? '<sup>\u00ae</sup>' : ''}</span>`;
}
const getCard = id => state.cards.find(c => c.id === id);
const cur = () => getCard(currentId);

/* ---------- widoki ---------- */
function show(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.body.classList.toggle('welcome', view === 'welcome');
  document.body.classList.toggle('auth', view === 'login');
  if (view === 'welcome') renderWelcome();
  const NAV = { editor: 'cards', preview: 'cards', scan: 'contacts' };
  const own = [...document.querySelectorAll('#tabs button')].some(b => b.dataset.view === view && b.offsetParent !== null);
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === (own ? view : (NAV[view] || view))));
  if (view === 'cards') renderList();
  if (view === 'editor') renderEditor();
  if (view === 'preview') renderPreview();
  if (view === 'links') renderLinks();
  if (view === 'contacts' && window.BNIContacts) window.BNIContacts.render();
  if (view === 'scan' && window.BNIContacts) window.BNIContacts.mountScan();
  try { window.scrollTo(0, 0); } catch (e) {}
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });

/* ---------- lista ---------- */
function renderList() {
  renderMine(); renderNext();
  const ac = $('#all-cards'); ac.querySelector('summary').textContent = 'Wszystkie wizytówki (' + state.cards.length + ')';
  if (state.cards.length && ac.dataset.init !== '1') { ac.open = !getMine(); ac.dataset.init = '1'; }
  const el = $('#card-list');
  if (!state.cards.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nie masz jeszcze wizytówek</h3><p>Utwórz pierwszą albo wczytaj przykładowe dane.</p></div>'; return; }
  el.innerHTML = state.cards.map(c => {
    const n = state.links.filter(l => l.from === c.id || l.to === c.id).length;
    return `<div class="tile" data-id="${esc(c.id)}" tabindex="0" role="button">
      <div class="hd" style="border-left-color:${esc(c.accent)}"><button class="small qrb" data-qr-id="${esc(c.id)}">Kod QR</button><b>${esc(c.name || 'Bez nazwy')}</b><small>${esc(c.group)}${c.city ? ' · ' + esc(c.city) : ''}</small></div>
      <div class="bd">${c.company ? esc(c.company) + '<br>' : ''}Kontakty: ${filled(c.offered).length} oferowane · ${filled(c.sought).length} poszukiwane · ${n} połączeń</div>
    </div>`;
  }).join('');
}
$('#card-list').addEventListener('keydown', e => { const t = e.target.closest('.tile'); if (t && e.key === 'Enter') openEditor(t.dataset.id); });
$('#card-list').addEventListener('click', e => {
  const q = e.target.closest('[data-qr-id]'); if (q) return showQr(q.dataset.qrId);
  const t = e.target.closest('.tile'); if (!t) return;
  openEditor(t.dataset.id);
});
const filled = rows => rows.filter(r => Object.values(r).some(v => String(v || '').trim()));

$('#btn-new').onclick = () => { const c = newCard(); state.cards.push(c); save(); openEditor(c.id, 1); };
$('#btn-demo').onclick = async () => {
  try {
    const d = await (await fetch('demo.json')).json(), map = {};
    d.cards.forEach(c => {
      const ex = state.cards.find(x => x.name === c.name); if (ex) { map[c.id] = ex.id; return; }
      const id = 'd' + uid() + uid(); map[c.id] = id; state.cards.push(Object.assign({}, c, { id, shared: false }));
    });
    (d.links || []).forEach(l => { const f = map[l.from], t = map[l.to]; if (f && t && !state.links.some(x => x.from === f && x.to === t)) state.links.push({ id: 'l' + uid() + uid(), from: f, to: t, note: l.note }); });
    currentId = map[d.cards[0].id]; save(); renderList(); toast('Wczytano przykładowe wizytówki');
  } catch (e) { toast('Nie udało się wczytać przykładu (wymaga http)'); }
};

/* ---------- edytor ---------- */
/* ---------- wizytówka główna, onboarding, udostępnianie ---------- */
let MINE_KEY = 'bni-my-card:anon', ONB_KEY = 'bni-onboarded:anon';
const getMineId = () => { try { return localStorage.getItem(MINE_KEY); } catch (e) { return null; } };
const setMineId = id => { try { localStorage.setItem(MINE_KEY, id); } catch (e) {} };
const getMine = () => { const id = getMineId(); return id ? getCard(id) : null; };
const finishOnb = () => { try { localStorage.setItem(ONB_KEY, '1'); } catch (e) {} };
function fitMine() {
  const p = document.querySelector('#mine .mine-card .panel'); if (!p) return;
  p.style.zoom = ''; const w = p.parentElement.clientWidth, pw = p.offsetWidth;
  if (w && pw) p.style.zoom = String(Math.min(1.35, w / pw));
}
window.addEventListener('resize', fitMine);
function renderMine() {
  const box = $('#mine'), c = getMine();
  if (!c) {
    box.innerHTML = '<div class="mine mine-empty"><div><span class="next-k">Twoja wizytówka</span><p>Nie masz jeszcze swojej wizytówki.</p></div><button class="primary" id="mine-create">Utwórz wizytówkę</button></div>';
    return;
  }
  const share = c.shared
    ? `<div class="mine-qr" id="mine-qr" aria-label="Kod QR Twojej wizytówki"></div><p class="mine-cap">Zeskanuj, aby zobaczyć moją wizytówkę i zapisać kontakt.</p>
       <div class="mine-act"><button class="primary" data-qr-id="${esc(c.id)}">Pokaż kod QR na pełnym ekranie</button><button id="mine-share">Udostępnij link</button><button class="back" data-edit-mine>Edytuj wizytówkę</button></div>`
    : `<div class="mine-private"><p class="mine-cap"><b>Ta wizytówka jest prywatna.</b> Nikt poza Tobą jej nie widzi. Udostępnij ją, aby pokazywać kod QR.</p>
       <div class="mine-act"><button class="primary" id="mine-enable" data-qr-id="${esc(c.id)}">Udostępnij kodem QR</button><button class="back" data-edit-mine>Edytuj wizytówkę</button></div></div>`;
  box.innerHTML = `<section class="mine" aria-label="Twoja wizytówka"><div class="mine-card" style="--acc:${esc(c.accent || '#e8473f')}">${coverHTML(c, false)}</div><div class="mine-share">${share}</div></section>`;
  fitMine();
  if (c.shared) onlineUrl(c).then(u => { const q = $('#mine-qr'); if (q) { try { const svg = qrSvg(u); q.innerHTML = svg; if (window.BNIPwa) window.BNIPwa.cacheQr({ url: u, name: c.name, svg }); } catch (e) { q.textContent = 'Za dużo danych na kod QR'; } } }).catch(() => {});
}
let wlStep = 1;
function wlGo(n) {
  wlStep = n; $('#wl-1').hidden = n !== 1; $('#wl-2').hidden = n !== 2;
  if (n === 2) { const m = getMine(); $('#wl-name').value = m ? m.name || '' : $('#wl-name').value; $('#wl-next').disabled = !$('#wl-name').value.trim(); setTimeout(() => $('#wl-name').focus(), 50); }
}
function renderWelcome() { wlGo(1); }
$('#wl-start').onclick = () => wlGo(2);
$('#wl-back').onclick = () => wlGo(1);
$('#wl-skip').onclick = () => { finishOnb(); show('cards'); };
$('#wl-name').addEventListener('input', () => { $('#wl-next').disabled = !$('#wl-name').value.trim(); });
$('#wl-2').addEventListener('submit', ev => {
  ev.preventDefault(); const name = $('#wl-name').value.trim(); if (!name) return;
  let c = getMine(); if (!c) { c = newCard(); state.cards.push(c); }
  c.name = name; c.phone = $('#wl-phone').value.trim(); c.email = $('#wl-email').value.trim();
  c.shared = $('#wl-share').checked; if (c.shared && c.showLists === undefined) c.showLists = true;
  setMineId(c.id); finishOnb(); currentId = c.id; save(); show('cards'); toast('Gotowe. To Twoja wizytówka.');
});
document.addEventListener('change', e => {
  const c = cur(); if (!c) return;
  if (e.target.id === 'sh-on') {
    if (e.target.checked && !confirm('Udostępnić wizytówkę przez kod QR?\n\nPublicznie zobaczą: imię, telefon, e-mail i (jeśli zostawisz włączone) polecane osoby.')) { e.target.checked = false; return; }
    c.shared = e.target.checked; if (c.shared && c.showLists === undefined) c.showLists = true; save(); $('#sh-lists').disabled = !c.shared;
  }
  if (e.target.id === 'sh-lists') { c.showLists = e.target.checked; save(); }
});
document.addEventListener('click', async e => {
  const q = e.target.closest('#mine [data-qr-id]'); if (q) return showQr(q.dataset.qrId);
  if (e.target.closest('[data-edit-mine]')) { const m = getMine(); if (m) openEditor(m.id); return; }
  if (e.target.closest('#mine-create')) { show('welcome'); wlGo(2); return; }
  if (e.target.closest('#btn-main')) { const c = cur(); if (c) { setMineId(c.id); toast('Ustawiono jako główną wizytówkę'); } return; }
  if (e.target.closest('#mine-share')) {
    const c = getMine(); if (!c) return; const url = await onlineUrl(c);
    if (navigator.share) { try { await navigator.share({ title: c.name || 'Wizytówka', text: 'Moja wizytówka', url }); } catch (_) {} }
    else { try { await navigator.clipboard.writeText(url); toast('Link skopiowany'); } catch (_) { prompt('Skopiuj link:', url); } }
  }
});

/* ---------- prowadzony edytor (kroki) ---------- */
const STEP_TITLES = ['Kim jesteś', 'Jak pracujesz', 'Kogo polecasz', 'Kogo szukasz', 'Gotowe'];
const ROWS_STEP = 5;
let step = 1, shownFor = null;
const shown = { offered: ROWS_STEP, sought: ROWS_STEP };
function nextStepFor(c) {
  if (!String(c.name || '').trim()) return { step: 1, label: 'Uzupełnij dane na wizytówce' };
  if (c.qa.filter(x => String(x.a || '').trim()).length < 3) return { step: 2, label: 'Odpowiedz na kilka pytań' };
  if (filled(c.offered).length < 3) return { step: 3, label: 'Dodaj osoby, które polecasz' };
  if (filled(c.sought).length < 3) return { step: 4, label: 'Napisz, kogo szukasz' };
  return { step: 5, label: 'Wydrukuj lub udostępnij wizytówkę' };
}
function openEditor(id, n) { currentId = id; const c = getCard(id); step = n || (c ? nextStepFor(c).step : 1); show('editor'); }
function setStep(n) { step = Math.max(1, Math.min(5, n)); applyStep(); }
function applyStep() {
  $$('#editor .step').forEach(el => { el.hidden = +el.dataset.step !== step; });
  const pct = Math.round((step - 1) / 4 * 100);
  $('#stepper').innerHTML = `<p class="step-count">Krok ${step} z 5 <span>· ${STEP_TITLES[step - 1]}</span></p><div class="step-bar" role="progressbar" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${step}"><span style="width:${pct}%"></span></div>`;
  $('#step-back').hidden = step === 1; $('#step-next').hidden = step === 5;
  if (step === 5) renderDone();
  document.dispatchEvent(new Event('bni-step'));
}
function renderDone() {
  const c = cur(); if (!c) return;
  const answered = c.qa.filter(x => String(x.a || '').trim()).length;
  const rows = [[1, 'Dane na wizytówce', c.name ? esc(c.name) : 'Brak imienia'], [2, 'Pytania', answered + ' z 8 odpowiedzi'], [3, 'Polecam', filled(c.offered).length + ' osób'], [4, 'Szukam', filled(c.sought).length + ' osób']];
  const so = $('#sh-on'), sl = $('#sh-lists'); if (so) { so.checked = !!c.shared; sl.checked = c.showLists !== false; sl.disabled = !c.shared; }
  $('#done-list').innerHTML = rows.map(([n, t, v]) => `<div class="done-row"><div><b>${t}</b><span>${v}</span></div><button class="small" data-step-go="${n}">Zmień</button></div>`).join('');
}
function renderNext() {
  const box = $('#next-step'), c = getMine() || getCard(currentId) || state.cards[0];
  $('#btn-new').classList.toggle('primary', !state.cards.length);
  if (!c) { box.innerHTML = ''; return; }
  const n = nextStepFor(c);
  box.innerHTML = `<div class="next"><div><span class="next-k">Następny krok</span><p>${esc(n.label)}</p><small>${esc(c.name || 'Bez nazwy')}</small></div><button class="primary" id="next-go" data-card="${esc(c.id)}">${n.step === 5 ? 'Otwórz' : 'Kontynuuj'}</button></div>`;
}
function renderEditor() {
  const c = cur();
  $('#editor-empty').hidden = !!c; $('#editor').hidden = !c;
  if (!c) return;
  if (shownFor !== c.id) { shown.offered = ROWS_STEP; shown.sought = ROWS_STEP; shownFor = c.id; }
  $$('[data-f]').forEach(i => i.value = c[i.dataset.f] || (i.dataset.f === 'accent' ? '#e8473f' : ''));
  $('#qa').innerHTML = c.qa.map((x, i) => `<div class="qa-item"><label class="qa-q" for="qa-a-${i}">${esc(x.q)}</label><textarea id="qa-a-${i}" data-qi="${i}" data-k="a">${esc(x.a)}</textarea></div>`).join('') +
    `<details class="more-fields"><summary>Zmień treść pytań</summary>${c.qa.map((x, i) => `<label>Pytanie ${i + 1}<input data-qi="${i}" data-k="q" value="${esc(x.q)}"></label>`).join('')}</details>`;
  renderTable('offered', OFFERED_COLS); renderTable('sought', SOUGHT_COLS);
  applyStep();
}
function renderTable(key, cols) {
  const c = cur(), rows = c[key], limit = Math.min(rows.length, Math.max(shown[key], 1));
  $('#tbl-' + key).className = 'edit';
  $('#tbl-' + key).innerHTML = `<tr><th>#</th>${cols.map(x => `<th>${x[1]}</th>`).join('')}<th></th></tr>` +
    rows.slice(0, limit).map((r, i) => `<tr data-drop="${key}" data-i="${i}"><td class="grip" data-grip tabindex="0" role="button" title="Przeciągnij (Alt+↑/↓ z klawiatury)" aria-label="Przenieś wiersz ${i + 1} (Alt+strzałka)">⋮⋮ ${i + 1}</td>${cols.map(([k]) => `<td><input data-t="${key}" data-i="${i}" data-k="${k}" value="${esc(r[k] || '')}"></td>`).join('')}<td><button class="small" data-del="${key}" data-i="${i}" aria-label="Usuń wiersz ${i + 1}">✕</button></td></tr>`).join('');
  $('#rows-' + key).innerHTML = (rows.length > limit ? `<button class="small" data-rows-more="${key}">Pokaż kolejne (jeszcze ${rows.length - limit})</button>` : '') + (limit > ROWS_STEP && rows.length <= limit ? `<button class="small" data-rows-less="${key}">Pokaż mniej</button>` : '');
  $('#add-' + key).disabled = rows.length >= MAX_ROWS;
}
$('#editor').addEventListener('input', e => {
  const t = e.target, c = cur(); if (!c) return;
  if (t.dataset.f) c[t.dataset.f] = t.value;
  else if (t.dataset.qi) c.qa[+t.dataset.qi][t.dataset.k] = t.value;
  else if (t.dataset.t) c[t.dataset.t][+t.dataset.i][t.dataset.k] = t.value;
  save();
});
$('#editor').addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  const c = cur(), key = b.dataset.del; c[key].splice(+b.dataset.i, 1); if (!c[key].length) c[key].push({});
  save(); renderTable(key, key === 'offered' ? OFFERED_COLS : SOUGHT_COLS);
});
['offered', 'sought'].forEach(k => $('#add-' + k).onclick = () => {
  const c = cur(); if (c[k].length >= MAX_ROWS) return; c[k].push({}); shown[k] = Math.max(shown[k], c[k].length); save(); renderTable(k, k === 'offered' ? OFFERED_COLS : SOUGHT_COLS);
});
$('#btn-to-preview').onclick = () => show('preview');
$('#step-next').onclick = () => { setStep(step + 1); window.scrollTo(0, 0); };
$('#step-back').onclick = () => { setStep(step - 1); window.scrollTo(0, 0); };
document.addEventListener('click', e => {
  const bk = e.target.closest('[data-back]'); if (bk) return show(bk.dataset.back);
  const go = e.target.closest('[data-step-go]'); if (go) { setStep(+go.dataset.stepGo); return window.scrollTo(0, 0); }
  const nx = e.target.closest('#next-go'); if (nx) return openEditor(nx.dataset.card);
  const mr = e.target.closest('[data-rows-more]'); if (mr) { const k = mr.dataset.rowsMore; shown[k] += ROWS_STEP; return renderTable(k, k === 'offered' ? OFFERED_COLS : SOUGHT_COLS); }
  const ml = e.target.closest('[data-rows-less]'); if (ml) { const k = ml.dataset.rowsLess; shown[k] = ROWS_STEP; return renderTable(k, k === 'offered' ? OFFERED_COLS : SOUGHT_COLS); }
});
$('#btn-dup').onclick = () => { const c = JSON.parse(JSON.stringify(cur())); c.id = uid(); c.name += ' (kopia)'; state.cards.push(c); currentId = c.id; save(); renderEditor(); toast('Zduplikowano'); };
$('#btn-del').onclick = () => {
  if (!confirm('Usunąć tę wizytówkę wraz z jej połączeniami?')) return;
  state.cards = state.cards.filter(c => c.id !== currentId);
  state.links = state.links.filter(l => l.from !== currentId && l.to !== currentId);
  currentId = state.cards[0]?.id || null; save(); show('cards');
};

/* ---------- podgląd / druk ---------- */
function fillSelect(sel, withCur = true) {
  sel.innerHTML = state.cards.map(c => `<option value="${esc(c.id)}">${esc(c.name || 'Bez nazwy')}</option>`).join('');
  if (withCur && currentId) sel.value = currentId;
}
const OW = [14, 18, 18.6, 17, 13], SW = [14, 17, 16, 33.6];
const cell = v => esc(v || '').replace(/ \/ /g, '<br>');
function tablePanel(cols, widths, rows, start, sought) {
  const trs = Array.from({ length: 10 }, (_, i) => { const r = rows[start + i] || {}; return `<tr><td class="lp">${start + i + 1}</td>${cols.map(([k]) => `<td>${cell(r[k])}</td>`).join('')}</tr>`; }).join('');
  return `<div class="panel"><h3>Lista <em>TOP 20</em> ${sought ? 'poszukiwanych kontaktów biznesowych' : 'kontaktów biznesowych'}</h3>
    <table class="tbl${sought ? ' s' : ''}"><colgroup><col style="width:4.2mm">${widths.map(w => `<col style="width:${w}mm">`).join('')}</colgroup>
    <tr><th class="lp">Lp.</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>${trs}</table></div>`;
}
const ICON_MAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="1"/><path d="M2 6l10 8 10-8"/></svg>';
const ICON_TEL = '<svg viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.250.2 2.450.6 3.600a1 1 0 01-.25 1z"/></svg>';
function coverHTML(c, withQr) {
  const tel = [c.phone, c.phone2].filter(Boolean).map(esc).join('<br>');
  return `<div class="panel cover"><div class="cv-top"><div><div class="nm">${esc(c.name).replace(' ', '<br>')}</div><div class="cv-sub">${esc(c.group)}${c.city ? '<br>' + esc(c.city) : ''}${c.company ? '<br>' + esc(c.company) : ''}</div></div>
    <div class="rt"><div class="logo">${logoHTML(getLogo(), c.accent, 26)}</div>${withQr ? '<div class="qr" data-qr>…</div>' : ''}</div></div>
    <div class="cv-bot"><div class="ct">${tel ? ICON_TEL + '<span>' + tel + '</span>' : ''}</div><div class="ct">${c.email ? ICON_MAIL + '<span>' + esc(c.email) + '</span>' : ''}</div></div>${getLogo().referra ? '<div class="cv-ref">Referra</div>' : ''}</div>`;
}
function cardHTML(c, withQr) {
  const o = c.offered || [], s = c.sought || [];
  const qa = `<div class="panel"><ol class="qa">${c.qa.map((x, i) => `<li><span class="n">${i + 1}.</span><div><b>${esc(x.q)}</b><i>${esc(x.a)}</i></div></li>`).join('')}</ol></div>`;
  const tel = [c.phone, c.phone2].filter(Boolean).map(esc).join('<br>');
  const cover = coverHTML(c, withQr);
  return `<div class="sheet-card" style="--acc:${esc(c.accent || '#e8473f')}">
    <div class="side"><div class="side-label">Strona A (awers)</div>${tablePanel(OFFERED_COLS, OW, o, 0)}${tablePanel(OFFERED_COLS, OW, o, 10)}${tablePanel(SOUGHT_COLS, SW, s, 0, true)}</div>
    <div class="side"><div class="side-label">Strona B (rewers)</div>${tablePanel(SOUGHT_COLS, SW, s, 10, true)}${qa}${cover}</div></div>`;
}
/* ---- link online + QR ---- */
async function pack(str) {
  const raw = new TextEncoder().encode(str);
  if (typeof CompressionStream === 'undefined') return 'r.' + bytesB64(raw);
  const cs = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z.' + bytesB64(new Uint8Array(await new Response(cs).arrayBuffer()));
}
async function unpack(tok) {
  const raw = b64Bytes(tok.slice(2));
  if (tok.startsWith('r.')) return new TextDecoder().decode(raw);
  const ds = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buf = await new Response(ds).arrayBuffer();
  if (buf.byteLength > 200000) throw new Error('za duży ladunek');
  return new TextDecoder().decode(buf);
}
const bytesB64 = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64Bytes = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
function baseUrl() { return (CFG.publicUrl || location.href).split('#')[0]; }
async function onlineUrl(c) {
  if (!c.shared) throw new Error('private');
  if (cloud) { if (!remoteCards.has(c.id)) dirty = true; await push(); if (remoteCards.has(c.id)) return baseUrl() + '#c=' + encodeURIComponent(c.id); }
  const slim = { id: c.id, name: c.name, group: c.group, city: c.city, company: c.company, phone: c.phone, phone2: c.phone2, email: c.email, accent: c.accent,
    qa: c.qa, offered: filled(c.offered), sought: filled(c.sought) };
  return baseUrl() + '#card=' + await pack(JSON.stringify(slim));
}
function qrSvg(text) {
  const q = qrcode(0, 'L'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}
async function fillQr(c) {
  const box = $('#sheet [data-qr]'), info = $('#qr-info');
  if (!box) { info.textContent = ''; return; }
  if (!c.shared) { box.innerHTML = '<div>QR po udostępnieniu</div>'; info.textContent = 'Ta wizytówka jest prywatna, więc kod QR pojawi się po jej udostępnieniu (krok „Gotowe”).'; return; }
  try {
    const url = await onlineUrl(c);
    box.innerHTML = qrSvg(url) + '<div>Wizytówka online</div>';
    info.textContent = `Kod QR otwiera: ${url}`;
  } catch (e) {
    box.innerHTML = '<div>QR: za dużo danych</div>';
    info.textContent = 'Za dużo treści na kod QR — skróć wpisy lub użyj wersji z bazą danych (krótki link).';
  }
}
function fitSheet() {
  const p = $('#sheet .paper'); if (!p) return;
  p.style.zoom = ''; const w = p.offsetWidth, avail = $('#sheet').clientWidth - 28;
  if (avail < w) p.style.zoom = Math.max(avail / w, 0.3);
}
function renderPreview() {
  fillSelect($('#preview-card'));
  const c = getCard($('#preview-card').value) || cur();
  if (!renderPreview.init) { renderPreview.init = true; if (window.innerWidth < 700) $('#preview-layout').value = 'strip'; }
  const sheet = $('#sheet'), layout = $('#preview-layout').value, qr = $('#opt-qr').checked;
  sheet.className = 'sheet ' + layout;
  if (!c) { sheet.innerHTML = '<p class="hint" style="color:#fff">Brak wizytówek.</p>'; return; }
  const inner = cardHTML(c, qr);
  sheet.innerHTML = layout === 'a4' ? `<div class="paper-label">Strona A4 — linie przerywane to linie cięcia/składania</div><div class="paper">${inner}</div>` : `<div class="paper">${inner}</div>`;
  fillQr(c); fitSheet();
}
['preview-layout', 'opt-qr'].forEach(id => $('#' + id).addEventListener('change', renderPreview));
window.addEventListener('resize', fitSheet);
$('#preview-card').onchange = e => { currentId = e.target.value; renderPreview(); };
$('#btn-print').onclick = () => window.print();
$('#btn-share').onclick = async () => {
  const c = cur(); if (!c) return;
  const url = await onlineUrl(c);
  try { await navigator.clipboard.writeText(url); toast('Link skopiowany'); } catch (e) { prompt('Skopiuj link:', url); }
};
const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)));

/* ---------- połączenia ---------- */
const STOP = new Set(['i','w','z','na','do','dla','od','po','oraz','lub','się','nie','jest','to','a','o','u','sp','zoo','firma','firmy','branża','duża','średnia','mała']);
const words = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)).map(w => w.slice(0, 6));
function offerWords(c) { return new Set([...filled(c.offered).flatMap(r => [r.industry, r.company]), c.company].flatMap(words)); }
function soughtWords(row) { return new Set([row.industry, row.company, row.why, row.name].flatMap(words)); }
function suggestions() {
  const out = [];
  for (const a of state.cards) for (const row of filled(a.sought)) {
    const sw = soughtWords(row);
    for (const b of state.cards) {
      if (a.id === b.id) continue;
      const common = [...offerWords(b)].filter(w => sw.has(w));
      if (common.length && !state.links.some(l => l.from === a.id && l.to === b.id))
        out.push({ from: a.id, to: b.id, note: `Szuka: ${row.industry || row.name || row.why}`, score: common.length });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 10);
}
function addLink(from, to, note) {
  if (!from || !to || from === to) return toast('Wybierz dwie różne wizytówki');
  if (state.links.some(l => l.from === from && l.to === to)) return toast('To połączenie już istnieje');
  state.links.push({ id: uid(), from, to, note: note || '' }); save(); renderLinks();
}
function renderLinks() {
  fillSelect($('#link-from')); fillSelect($('#link-to'), false);
  if (state.cards.length > 1) $('#link-to').value = state.cards.find(c => c.id !== $('#link-from').value).id;
  const name = id => esc(getCard(id)?.name || '?');
  const sg = suggestions();
  $('#suggestions').innerHTML = sg.length ? sg.map((s, i) => `<div class="item"><div>${name(s.from)} → ${name(s.to)}<small>${esc(s.note)}</small></div><button class="small primary" data-sg="${i}">Połącz</button></div>`).join('') : '<p class="hint">Brak podpowiedzi — uzupełnij listy „poszukiwane” i „oferowane”.</p>';
  $('#suggestions').onclick = e => { const b = e.target.closest('[data-sg]'); if (b) { const s = sg[+b.dataset.sg]; addLink(s.from, s.to, s.note); } };
  $('#link-list').innerHTML = state.links.length ? state.links.map(l => `<div class="item"><div>${name(l.from)} → ${name(l.to)}<small>${esc(l.note)}</small></div><button class="small danger" data-rm="${esc(l.id)}">✕</button></div>`).join('') : '<p class="hint">Brak połączeń.</p>';
  $('#link-list').onclick = e => { const b = e.target.closest('[data-rm]'); if (b) { state.links = state.links.filter(l => l.id !== b.dataset.rm); save(); renderLinks(); } };
  drawGraph();
}
$('#btn-link').onclick = () => { addLink($('#link-from').value, $('#link-to').value, $('#link-note').value.trim()); $('#link-note').value = ''; };
function drawGraph() {
  const svg = $('#graph'), n = state.cards.length, cx = 300, cy = 230, R = 170;
  if (!n) { svg.innerHTML = '<text x="300" y="230">Brak wizytówek</text>'; return; }
  const pos = {}; state.cards.forEach((c, i) => { const a = (2 * Math.PI * i) / n - Math.PI / 2; pos[c.id] = [n === 1 ? cx : cx + R * Math.cos(a), n === 1 ? cy : cy + R * Math.sin(a)]; });
  svg.innerHTML = `<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#888"/></marker></defs>` +
    state.links.map(l => { const [x1, y1] = pos[l.from] || [0, 0], [x2, y2] = pos[l.to] || [0, 0]; const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1; return `<line x1="${x1 + dx / d * 24}" y1="${y1 + dy / d * 24}" x2="${x2 - dx / d * 28}" y2="${y2 - dy / d * 28}" stroke="#888" stroke-width="2" marker-end="url(#ar)"/>`; }).join('') +
    state.cards.map(c => { const [x, y] = pos[c.id]; return `<g><rect x="${x - 20}" y="${y - 20}" width="40" height="40" fill="var(--text)"/><text x="${x}" y="${y + 4}" style="fill:var(--bg);font:500 12px var(--mono)">${esc((c.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase())}</text><text x="${x}" y="${y + 40}" style="paint-order:stroke;stroke:var(--surface);stroke-width:4px">${esc(c.name || 'Bez nazwy')}</text></g>`; }).join('');
}

/* ---------- kod QR ze strony ---------- */
let qrCur = null;
async function showQr(id) {
  const c = getCard(id); if (!c) return toast('Wybierz wizytówkę');
  if (!c.shared) {
    if (!confirm('Ta wizytówka jest prywatna.\n\nKod QR prowadzi do publicznej strony z jej danymi (imię, telefon, e-mail i, jeśli zostawisz włączone, listy polecanych osób). Każdy, kto zeskanuje kod lub pozna link, je zobaczy.\n\nUdostępnić tę wizytówkę?')) return;
    c.shared = true; if (c.showLists === undefined) c.showLists = true; save(); await push();
    if (document.querySelector('#view-cards.active')) renderMine();
  }
  try {
    const url = await onlineUrl(c); qrCur = { c, url };
    $('#qr-name').textContent = c.name || 'Wizytówka'; $('#qr-big').innerHTML = qrSvg(url); $('#qr-url').textContent = url;
    if (window.BNIPwa && c.id === getMineId()) window.BNIPwa.cacheQr({ url, name: c.name, svg: qrSvg(url) });
    $('#qr-modal').showModal();
  } catch (e) { toast('Za dużo danych na kod QR – połącz się z bazą (krótki link)'); }
}
$$('[data-qr-open]').forEach(b => b.onclick = () => showQr(currentId));
$('#qr-close').onclick = () => $('#qr-modal').close();
$('#qr-modal').addEventListener('click', e => { if (e.target.id === 'qr-modal') e.target.close(); });
$('#qr-copy').onclick = async () => { try { await navigator.clipboard.writeText(qrCur.url); toast('Link skopiowany'); } catch (e) { prompt('Skopiuj link:', qrCur.url); } };
$('#qr-dl').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([qrSvg(qrCur.url)], { type: 'image/svg+xml' }));
  a.download = 'qr-' + (qrCur.c.name || 'wizytowka').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.svg'; a.click();
};

/* ---------- eksport / import ---------- */
$('#btn-export').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = 'bni-connector.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('#file-import').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    const cards = Array.isArray(d.cards) ? d.cards : d.id ? [d] : null; if (!cards) throw 0;
    for (const c of cards) if (!getCard(c.id)) state.cards.push(normCard(c));
    for (const l of d.links || []) if (okLink(l) && !state.links.some(x => x.id === l.id)) state.links.push({ id: l.id, from: l.from, to: l.to, note: String(l.note || '').slice(0, 500) });
    save(); renderList(); toast('Zaimportowano');
  } catch (err) { toast('Niepoprawny plik'); }
  e.target.value = '';
};

/* ---------- link udostępniony (#card=...) ---------- */
async function importFromHash() {
  const cm = location.hash.match(/^#c=(.+)$/);
  if (cm) { const id = decodeURIComponent(cm[1]); if (getCard(id)) { currentId = id; show('preview'); } else toast('Nie znaleziono wizytówki'); return; }
  const m = location.hash.match(/^#card=(.+)$/); if (!m) return;
  try {
    const tok = m[1];
    const json = /^[zr]\./.test(tok) ? await unpack(tok) : unb64(tok);
    const c = normCard(JSON.parse(json));
    if (confirm(`Dodać wizytówkę „${c.name}” do swojej listy?`)) { if (getCard(c.id)) c.id = uid(); state.cards.push(c); currentId = c.id; save(); renderList(); }
  } catch (e) { toast('Niepoprawny link'); }
  history.replaceState(null, '', location.pathname + location.search);
}

window.BNI = { wipeMyData, idOf: name => (state.cards.find(c => c.name === name) || {}).id, getUser: () => window.BNIAuth && window.BNIAuth.user(), openEditor, getMine, getStep: () => step, setStep, revealRow: (k, i) => { shown[k] = Math.max(shown[k], i + 1); }, getLogo, setLogo, sanitizeLogo, logoHTML, renderPreview: () => renderPreview(), get state() { return state; }, setCurrent: id => { currentId = id; }, save, toast, uid, esc, $, $$, cur, getCard, show, renderTable, renderEditor, OFFERED_COLS, SOUGHT_COLS, MAX_ROWS, cloud: () => cloud };
async function enterApp() {
  renderList(); let onb = true; try { onb = !!localStorage.getItem(ONB_KEY); } catch (e) {}
  show(onb ? 'cards' : 'welcome');
  await pull(); renderList(); if (window.BNIContacts) window.BNIContacts.onData(); await importFromHash();
}
if (/^#(c|card)=/.test(location.hash) && window.BNIViewer) window.BNIViewer.run({ rest, rpc, unpack, normCard, okId, sanitizeLogo, logoHTML });
else if (window.BNIAuth) window.BNIAuth.start({
  onSession: sess => { bootUser(sess.user.id); enterApp(); },
  onSignedOut: () => { teardown(); show('login'); window.BNIAuth.showLoginScreen(); },
  showLogin: () => show('login')
});
if (typeof module !== 'undefined') module.exports = { suggestions };
})();
