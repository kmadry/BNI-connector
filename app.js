(() => {
'use strict';
const KEY = 'bni-connector-v1';
const MAX_ROWS = 20;
const QUESTIONS = [
  'Trzech najlepszych klientów / branże',
  'Dlaczego klienci myślą, że jesteś dobry?',
  'Potencjalni najlepsi klienci',
  'Co powiedzieć?',
  'Kto przekazuje Ci rekomendacje?',
  'Skąd się wzięła Twoja najlepsza rekomendacja?',
  'Czego słuchać?',
  'Najbardziej rentowna usługa'
];
const OFFERED_COLS = [['name','Imię i nazwisko'],['company','Firma'],['industry','Branża'],['relation','Relacja'],['scale','Skala']];
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
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }

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
      <div class="hd" style="border-left-color:${esc(c.accent)}"><b>${esc(c.name || 'Bez nazwy')}</b><small>${esc(c.group)}${c.city ? ' · ' + esc(c.city) : ''}</small></div>
      <div class="bd">${esc(c.company) || '—'}<br>Kontakty: ${filled(c.offered).length} oferowane · ${filled(c.sought).length} poszukiwane · ${n} połączeń</div>
    </div>`;
  }).join('');
}
$('#card-list').addEventListener('click', e => {
  const t = e.target.closest('.tile'); if (!t) return;
  currentId = t.dataset.id; show('editor');
});
const filled = rows => rows.filter(r => Object.values(r).some(v => String(v || '').trim()));

$('#btn-new').onclick = () => { const c = newCard(); state.cards.push(c); currentId = c.id; save(); show('editor'); };
$('#btn-demo').onclick = () => {
  const a = newCard({
    name: 'Jan Kowalski', group: 'grupa BNI Przykład', city: 'Katowice', company: 'Doradztwo inwestycyjne',
    phone: '+48 600 000 001', email: 'jan@example.com',
    qa: QUESTIONS.map((q, i) => ({ q, a: ['medyczna – farmacja, handel międzynarodowy, kolekcjoner nieruchomości','Specjalizuję się w jednym rynku i pokazuję tylko oferty, które sam bym kupił.','IT, doradcy inwestycyjni, agencje nieruchomości','Czy jesteś w pełni zadowolony z obecnych inwestycji?','Agencje nieruchomości, prawnicy, biura rachunkowe','Wspólne hobby i rekomendacja z BNI','Koniec flipów, niskie ROI, geopolityka','Sprzedaż nieruchomości i inwestycje w auta'][i] })),
    offered: [
      { name: 'Anna Nowak', company: 'Budimex Sp. z o.o.', industry: 'Budowlana – deweloper', relation: 'Znajomy / Klient', scale: 'Duża firma' },
      { name: 'Piotr Wiśniewski', company: 'Smak', industry: 'Spożywcza producent', relation: 'Znajomy / Klient', scale: 'Średnia firma' }
    ],
    sought: [
      { name: 'Franczyzobiorca', company: 'Żabka', industry: 'Spożywcza: sklepy', why: 'Multifranczyzobiorcy i kolekcjonerzy nieruchomości' },
      { name: 'Biuro rachunkowe', company: '', industry: 'Biura rachunkowe', why: 'Źródło kontaktów do branży budowlanej' }
    ]
  });
  const b = newCard({
    name: 'Ewa Zielińska', group: 'grupa BNI Przykład', city: 'Kraków', company: 'Biuro rachunkowe', phone: '+48 600 000 002', email: 'ewa@example.com', accent: '#2a7de1',
    offered: [{ name: 'Marek Lis', company: 'Deweloper Plus', industry: 'Budowlana – deweloper', relation: 'Klient', scale: 'Duża firma' }],
    sought: [{ name: 'Inwestor', company: '', industry: 'Nieruchomości inwestycyjne', why: 'Poszerzenie portfela klientów' }]
  });
  state.cards.push(a, b); currentId = a.id; save(); renderList(); toast('Wczytano 2 przykładowe wizytówki');
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
function chunk(rows, size) { const out = []; for (let i = 0; i < Math.max(rows.length, 1); i += size) out.push(rows.slice(i, i + size)); return out; }
function panelTable(title, red, cols, rows, offset) {
  return `<div class="panel"><h3>${title} <em>${red}</em></h3><table><tr><th>Lp.</th>${cols.map(c => `<th>${c[1]}</th>`).join('')}</tr>` +
    rows.map((r, i) => `<tr><td>${offset + i + 1}</td>${cols.map(([k]) => `<td>${esc(r[k] || '')}</td>`).join('')}</tr>`).join('') + '</table></div>';
}
function cardHTML(c) {
  const off = filled(c.offered), sou = filled(c.sought);
  let h = `<div class="sheet-card" style="--acc:${esc(c.accent)}">`;
  h += `<div class="panel cover"><div><div class="logo">BNI</div></div><div><div class="nm">${esc(c.name)}</div><div class="sub">${esc(c.group)}${c.city ? '<br>' + esc(c.city) : ''}${c.company ? '<br>' + esc(c.company) : ''}</div>
    <div class="ct">${[c.phone, c.phone2, c.email].filter(Boolean).map(esc).join('<br>')}</div></div></div>`;
  h += `<div class="panel"><ol>${c.qa.map((x, i) => `<li><b>${i + 1}. ${esc(x.q)}</b><span>${esc(x.a)}</span></li>`).join('')}</ol></div>`;
  chunk(off, 10).forEach((r, i) => h += panelTable('Lista TOP 20', 'kontaktów biznesowych', OFFERED_COLS, r, i * 10));
  chunk(sou, 10).forEach((r, i) => h += panelTable('Lista TOP 20', 'poszukiwanych kontaktów', SOUGHT_COLS, r, i * 10));
  return h + '</div>';
}
function renderPreview() {
  fillSelect($('#preview-card'));
  const c = getCard($('#preview-card').value) || cur();
  $('#sheet').innerHTML = c ? cardHTML(c) : '<p class="hint" style="color:#fff">Brak wizytówek.</p>';
}
$('#preview-card').onchange = e => { currentId = e.target.value; renderPreview(); };
$('#btn-print').onclick = () => window.print();
$('#btn-share').onclick = async () => {
  const c = cur(); if (!c) return;
  const url = location.href.split('#')[0] + '#card=' + b64(JSON.stringify(c));
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
function importFromHash() {
  const m = location.hash.match(/^#card=(.+)$/); if (!m) return;
  try {
    const c = Object.assign(newCard(), JSON.parse(unb64(m[1])));
    if (confirm(`Dodać wizytówkę „${c.name}” do swojej listy?`)) { if (getCard(c.id)) c.id = uid(); state.cards.push(c); currentId = c.id; save(); }
  } catch (e) { toast('Niepoprawny link'); }
  history.replaceState(null, '', location.pathname + location.search);
}

importFromHash();
renderList();
if (typeof module !== 'undefined') module.exports = { suggestions };
})();
