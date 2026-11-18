(() => {
'use strict';
const KEY = 'bni-connector-v1';
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

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.cards)) return { cards: s.cards, links: s.links || [] }; } catch (e) {}
  return { cards: [], links: [] };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} schedulePush(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

/* ---------- chmura (Supabase REST) ---------- */
const CFG = window.BNI_CONFIG || {};
const cloud = !!(CFG.url && CFG.key);
const H = { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, 'Content-Type': 'application/json' };
let remoteCards = new Set(), remoteLinks = new Set(), dirty = false, pushTimer = null, pushing = Promise.resolve();
function setSync(t, cls) { const el = $('#sync'); if (el) { el.textContent = t; el.className = cls || ''; } }
async function rest(path, opt = {}) {
  const r = await fetch(CFG.url + '/rest/v1/' + path, Object.assign({ headers: H }, opt));
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.status === 204 ? null : r.json().catch(() => null);
}
async function pull() {
  if (!cloud) return false;
  try {
    const [cs, ls] = await Promise.all([rest('bni_cards?select=id,data'), rest('bni_links?select=id,from_id,to_id,note')]);
    const remote = { cards: cs.map(r => r.data), links: ls.map(l => ({ id: l.id, from: l.from_id, to: l.to_id, note: l.note })) };
    remoteCards = new Set(cs.map(r => r.id)); remoteLinks = new Set(ls.map(l => l.id));
    if (!localStorage.getItem('bni-synced')) { // pierwsze uruchomienie: dołącz lokalne wizytówki
      state.cards.forEach(c => { if (!remoteCards.has(c.id)) remote.cards.push(c); });
      state.links.forEach(l => { if (!remoteLinks.has(l.id)) remote.links.push(l); });
      try { localStorage.setItem('bni-synced', '1'); } catch (_) {}
      state = remote; dirty = true; await push();
    } else state = remote;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
    if (!getCard(currentId)) currentId = (getCard('demo-adam') || state.cards[0])?.id || null;
    setSync('☁ synchronizacja OK', 'ok'); return true;
  } catch (e) { setSync('☁ offline (dane lokalne)', 'err'); return false; }
}
function schedulePush() { if (!cloud) return; dirty = true; clearTimeout(pushTimer); pushTimer = setTimeout(push, 700); }
function push() {
  if (!cloud || !dirty) return pushing;
  dirty = false; clearTimeout(pushTimer);
  const snap = JSON.parse(JSON.stringify(state));
  pushing = pushing.then(async () => {
    try {
      const up = { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }) };
      const ids = new Set(snap.cards.map(c => c.id)), lids = new Set(snap.links.map(l => l.id));
      const delL = [...remoteLinks].filter(i => !lids.has(i)), delC = [...remoteCards].filter(i => !ids.has(i));
      if (delL.length) await rest('bni_links?id=in.(' + delL.map(encodeURIComponent).join(',') + ')', { method: 'DELETE' });
      if (delC.length) await rest('bni_cards?id=in.(' + delC.map(encodeURIComponent).join(',') + ')', { method: 'DELETE' });
      if (snap.cards.length) await rest('bni_cards?on_conflict=id', Object.assign({ body: JSON.stringify(snap.cards.map(c => ({ id: c.id, data: c, updated_at: new Date().toISOString() }))) }, up));
      const ok = snap.links.filter(l => ids.has(l.from) && ids.has(l.to));
      if (ok.length) await rest('bni_links?on_conflict=id', Object.assign({ body: JSON.stringify(ok.map(l => ({ id: l.id, from_id: l.from, to_id: l.to, note: l.note || '' }))) }, up));
      remoteCards = ids; remoteLinks = new Set(ok.map(l => l.id));
      setSync('☁ zapisano', 'ok');
    } catch (e) { dirty = true; setSync('☁ błąd zapisu', 'err'); }
  });
  return pushing;
}

function newCard(over = {}) {
  return Object.assign({
    id: uid(), name: '', group: '', city: '', company: '', phone: '', phone2: '', email: '', accent: '#e8473f',
    qa: QUESTIONS.map(q => ({ q, a: '' })),
    offered: [{}], sought: [{}]
  }, over);
}
const getCard = id => state.cards.find(c => c.id === id);
const cur = () => getCard(currentId);

/* ---------- widoki ---------- */
function show(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'cards') renderList();
  if (view === 'editor') renderEditor();
  if (view === 'preview') renderPreview();
  if (view === 'links') renderLinks();
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });

/* ---------- lista ---------- */
function renderList() {
  const el = $('#card-list');
  if (!state.cards.length) { el.innerHTML = '<p class="hint">Brak wizytówek. Utwórz pierwszą lub wczytaj przykład.</p>'; return; }
  el.innerHTML = state.cards.map(c => {
    const n = state.links.filter(l => l.from === c.id || l.to === c.id).length;
    return `<div class="tile" data-id="${c.id}">
      <div class="hd" style="border-left-color:${esc(c.accent)}"><button class="small qrb" data-qr-id="${c.id}">Kod QR</button><b>${esc(c.name || 'Bez nazwy')}</b><small>${esc(c.group)}${c.city ? ' · ' + esc(c.city) : ''}</small></div>
      <div class="bd">${esc(c.company) || '—'}<br>Kontakty: ${filled(c.offered).length} oferowane · ${filled(c.sought).length} poszukiwane · ${n} połączeń</div>
    </div>`;
  }).join('');
}
$('#card-list').addEventListener('click', e => {
  const q = e.target.closest('[data-qr-id]'); if (q) return showQr(q.dataset.qrId);
  const t = e.target.closest('.tile'); if (!t) return;
  currentId = t.dataset.id; show('editor');
});
const filled = rows => rows.filter(r => Object.values(r).some(v => String(v || '').trim()));

$('#btn-new').onclick = () => { const c = newCard(); state.cards.push(c); currentId = c.id; save(); show('editor'); };
$('#btn-demo').onclick = async () => {
  try {
    const d = await (await fetch('demo.json')).json();
    d.cards.forEach(c => { const k = state.cards.findIndex(x => x.id === c.id); if (k >= 0) state.cards[k] = c; else state.cards.push(c); });
    (d.links || []).forEach(l => { if (!state.links.some(x => x.id === l.id)) state.links.push(l); });
    currentId = d.cards[0].id; save(); renderList(); toast('Wczytano przykładowe wizytówki');
  } catch (e) { toast('Nie udało się wczytać przykładu (wymaga http)'); }
};

/* ---------- edytor ---------- */
function renderEditor() {
  const c = cur();
  $('#editor-empty').hidden = !!c; $('#editor').hidden = !c;
  if (!c) return;
  $$('[data-f]').forEach(i => i.value = c[i.dataset.f] || (i.dataset.f === 'accent' ? '#e8473f' : ''));
  $('#qa').innerHTML = c.qa.map((x, i) => `<div class="qa-item"><input data-qi="${i}" data-k="q" value="${esc(x.q)}"><textarea data-qi="${i}" data-k="a">${esc(x.a)}</textarea></div>`).join('');
  renderTable('offered', OFFERED_COLS); renderTable('sought', SOUGHT_COLS);
}
function renderTable(key, cols) {
  const c = cur(), rows = c[key];
  $('#tbl-' + key).className = 'edit';
  $('#tbl-' + key).innerHTML = `<tr><th>#</th>${cols.map(x => `<th>${x[1]}</th>`).join('')}<th></th></tr>` +
    rows.map((r, i) => `<tr><td>${i + 1}</td>${cols.map(([k]) => `<td><input data-t="${key}" data-i="${i}" data-k="${k}" value="${esc(r[k] || '')}"></td>`).join('')}<td><button class="small" data-del="${key}" data-i="${i}">✕</button></td></tr>`).join('');
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
  const c = cur(); if (c[k].length >= MAX_ROWS) return; c[k].push({}); save(); renderTable(k, k === 'offered' ? OFFERED_COLS : SOUGHT_COLS);
});
$('#btn-to-preview').onclick = () => show('preview');
$('#btn-dup').onclick = () => { const c = JSON.parse(JSON.stringify(cur())); c.id = uid(); c.name += ' (kopia)'; state.cards.push(c); currentId = c.id; save(); renderEditor(); toast('Zduplikowano'); };
$('#btn-del').onclick = () => {
  if (!confirm('Usunąć tę wizytówkę wraz z jej połączeniami?')) return;
  state.cards = state.cards.filter(c => c.id !== currentId);
  state.links = state.links.filter(l => l.from !== currentId && l.to !== currentId);
  currentId = state.cards[0]?.id || null; save(); show('cards');
};

/* ---------- podgląd / druk ---------- */
function fillSelect(sel, withCur = true) {
  sel.innerHTML = state.cards.map(c => `<option value="${c.id}">${esc(c.name || 'Bez nazwy')}</option>`).join('');
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
function cardHTML(c, withQr) {
  const o = c.offered || [], s = c.sought || [];
  const qa = `<div class="panel"><ol class="qa">${c.qa.map((x, i) => `<li><span class="n">${i + 1}.</span><div><b>${esc(x.q)}</b><i>${esc(x.a)}</i></div></li>`).join('')}</ol></div>`;
  const tel = [c.phone, c.phone2].filter(Boolean).map(esc).join('<br>');
  const cover = `<div class="panel cover"><div class="top"><div><div class="nm">${esc(c.name).replace(' ', '<br>')}</div><div class="sub">${esc(c.group)}${c.city ? '<br>' + esc(c.city) : ''}${c.company ? '<br>' + esc(c.company) : ''}</div></div>
    <div class="rt"><div class="logo">BNI<sup>®</sup></div>${withQr ? '<div class="qr" data-qr>…</div>' : ''}</div></div>
    <div class="bot"><div class="ct">${tel ? ICON_TEL + '<span>' + tel + '</span>' : ''}</div><div class="ct">${c.email ? ICON_MAIL + '<span>' + esc(c.email) + '</span>' : ''}</div></div></div>`;
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
  return new TextDecoder().decode(await new Response(ds).arrayBuffer());
}
const bytesB64 = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64Bytes = t => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
function baseUrl() { return location.href.split('#')[0]; }
async function onlineUrl(c) {
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
  $('#link-list').innerHTML = state.links.length ? state.links.map(l => `<div class="item"><div>${name(l.from)} → ${name(l.to)}<small>${esc(l.note)}</small></div><button class="small danger" data-rm="${l.id}">✕</button></div>`).join('') : '<p class="hint">Brak połączeń.</p>';
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
    state.cards.map(c => { const [x, y] = pos[c.id]; return `<g><circle cx="${x}" cy="${y}" r="22" fill="${esc(c.accent)}"/><text x="${x}" y="${y + 4}" style="fill:#fff;font-weight:700">${esc((c.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase())}</text><text x="${x}" y="${y + 40}">${esc(c.name || 'Bez nazwy')}</text></g>`; }).join('');
}

/* ---------- kod QR ze strony ---------- */
let qrCur = null;
async function showQr(id) {
  const c = getCard(id); if (!c) return toast('Wybierz wizytówkę');
  try {
    const url = await onlineUrl(c); qrCur = { c, url };
    $('#qr-name').textContent = c.name || 'Wizytówka'; $('#qr-big').innerHTML = qrSvg(url); $('#qr-url').textContent = url;
    $('#qr-modal').showModal();
  } catch (e) { toast('Za dużo danych na kod QR'); }
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
    for (const c of cards) if (!getCard(c.id)) state.cards.push(Object.assign(newCard(), c));
    for (const l of d.links || []) if (!state.links.some(x => x.id === l.id)) state.links.push(l);
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
    const c = Object.assign(newCard(), JSON.parse(json));
    if (confirm(`Dodać wizytówkę „${c.name}” do swojej listy?`)) { if (getCard(c.id)) c.id = uid(); state.cards.push(c); currentId = c.id; save(); renderList(); }
  } catch (e) { toast('Niepoprawny link'); }
  history.replaceState(null, '', location.pathname + location.search);
}

renderList();
pull().then(() => { renderList(); return importFromHash(); });
if (typeof module !== 'undefined') module.exports = { suggestions };
})();
