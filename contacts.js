/* Magazyn kontaktów, przeciąganie (pointer events), paleta poleceń, motyw. Wymaga window.BNI (app.js) i opcjonalnie window.BNIScan. */
(() => {
'use strict';
const B = window.BNI;
if (!B) return;
const { $, $$, esc, toast, uid } = B;
const REL = ['Znajomy / Klient', 'Znajomy / Partner biznesowy'];
const SCALE = ['Duża firma', 'Średnia firma', 'Mała firma'];
const MAX = B.MAX_ROWS;
const list = () => (B.state.contacts = B.state.contacts || []);
const fullName = c => [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.company || 'Bez nazwy';
const initials = c => ((c.firstName || '')[0] || '') + ((c.lastName || '')[0] || '') || (c.company || '?')[0];
const hue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const avatar = c => `<span class="av" style="--h:${hue(fullName(c))}" aria-hidden="true">${esc(initials(c).toUpperCase())}</span>`;
const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
const blank = r => !r || !Object.values(r).some(v => String(v || '').trim());
const fold = t => String(t || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const matches = (c, q) => !q || fold([fullName(c), c.company, c.title, c.industry, c.city, c.notes, arr(c.emails).join(' '), arr(c.phones).join(' '), arr(c.tags).join(' ')].join(' ')).includes(fold(q));

/* ---------- snackbar z cofnij ---------- */
let snackT;
function snack(msg, undo) {
  let el = $('#snack');
  if (!el) { el = document.createElement('div'); el.id = 'snack'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Cofnij</button>' : ''}`;
  el.classList.add('show'); const tt = $('#toast'); if (tt) tt.classList.remove('show');
  if (undo) el.querySelector('button').onclick = () => { undo(); el.classList.remove('show'); };
  clearTimeout(snackT); snackT = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 2500);
}

/* ---------- lista kontaktów ---------- */
function filtered() {
  const q = ($('#ct-search').value || '').trim().toLowerCase(), rel = $('#ct-rel').value, tag = $('#ct-tag').value, sort = $('#ct-sort').value;
  let r = list().filter(c => matches(c, q) && (!rel || c.relation === rel) && (!tag || arr(c.tags).includes(tag)));
  const key = { name: c => (c.lastName || c.firstName || c.company || '').toLowerCase(), company: c => (c.company || '').toLowerCase() }[sort];
  r.sort(sort === 'new' ? (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) : (a, b) => key(a).localeCompare(key(b), 'pl'));
  return r;
}
function renderTags() {
  const sel = $('#ct-tag'), v = sel.value, tags = [...new Set(list().flatMap(c => arr(c.tags)))].sort((a, b) => a.localeCompare(b, 'pl'));
  sel.innerHTML = '<option value="">Wszystkie tagi</option>' + tags.map(t => `<option${t === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
}
function contactRow(c) {
  return `<article class="ct-row" data-id="${esc(c.id)}" tabindex="0" role="button">
    ${avatar(c)}
    <div class="ct-main"><b>${esc(fullName(c))}</b><span>${esc([c.title, c.company].filter(Boolean).join(' · ')) || '—'}</span>
      <small>${esc([arr(c.emails)[0], arr(c.phones)[0], c.city].filter(Boolean).join(' · '))}</small></div>
    <div class="ct-meta">${c.relation ? `<span class="badge">${esc(c.relation)}</span>` : ''}${arr(c.tags).slice(0, 3).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div class="ct-act"><button class="small" data-add="offered" title="Dodaj do TOP 20 oferowanych aktywnej wizytówki">+ Oferuję</button><button class="small" data-add="sought" title="Dodaj do TOP 20 poszukiwanych aktywnej wizytówki">+ Szukam</button><button class="small ghost" data-edit>Edytuj</button></div>
  </article>`;
}
function render() {
  renderTags();
  const all = list(), r = filtered(), box = $('#ct-list');
  $('#ct-count').textContent = all.length ? `${all.length} kontaktów${r.length !== all.length ? ` · pokazano ${r.length}` : ''}` : 'Brak kontaktów';
  if (!all.length) { box.innerHTML = `<div class="empty"><div class="empty-ico">👥</div><h3>Magazyn jest pusty</h3><p>Dodaj kontakt ręcznie, zeskanuj wizytówkę albo zaimportuj plik vCard / CSV.</p><div class="actions"><button class="primary" data-act="new">+ Nowy kontakt</button><button data-act="scan">Zeskanuj wizytówkę</button><button data-act="demo">Wczytaj przykładowe</button></div></div>`; return; }
  box.innerHTML = r.length ? r.map(contactRow).join('') : '<div class="empty"><h3>Brak wyników</h3><p>Zmień filtry lub wyszukiwanie.</p></div>';
}
$('#ct-list').addEventListener('click', e => {
  const act = e.target.closest('[data-act]');
  if (act) return ({ new: () => openForm(), scan: () => B.show('scan'), demo: loadDemo })[act.dataset.act]();
  const row = e.target.closest('.ct-row'); if (!row) return;
  const c = list().find(x => x.id === row.dataset.id); if (!c) return;
  const add = e.target.closest('[data-add]');
  if (add) return addToCard(c, add.dataset.add);
  openForm(c);
});
$('#ct-list').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('ct-row')) { e.preventDefault(); const c = list().find(x => x.id === e.target.dataset.id); if (c) openForm(c); } });
['ct-search', 'ct-rel', 'ct-tag', 'ct-sort'].forEach(id => $('#' + id).addEventListener('input', render));

/* ---------- formularz kontaktu ---------- */
const F = [['firstName', 'Imię'], ['lastName', 'Nazwisko'], ['company', 'Firma'], ['title', 'Stanowisko'], ['industry', 'Branża'], ['city', 'Miasto'], ['emails', 'E-maile (po przecinku)'], ['phones', 'Telefony (po przecinku)'], ['website', 'WWW'], ['tags', 'Tagi (po przecinku)']];
function openForm(c) {
  const isNew = !c; c = c || { id: uid(), emails: [], phones: [], tags: [], source: 'manual', createdAt: new Date().toISOString() };
  const form = $('#ct-form');
  form.innerHTML = `<h2>${isNew ? 'Nowy kontakt' : esc(fullName(c))}</h2><div class="form">` +
    F.map(([k, l]) => `<label>${l}<input name="${k}" value="${esc(['emails', 'phones', 'tags'].includes(k) ? arr(c[k]).join(', ') : c[k] || '')}"></label>`).join('') +
    `<label>Relacja<select name="relation"><option value="">—</option>${REL.map(r => `<option${c.relation === r ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
     <label>Skala firmy<select name="scale"><option value="">—</option>${SCALE.map(r => `<option${c.scale === r ? ' selected' : ''}>${r}</option>`).join('')}</select></label>
     <label class="wide">Notatki<textarea name="notes" rows="3">${esc(c.notes || '')}</textarea></label></div>
     <div class="bar"><button class="primary" value="save">Zapisz</button><button value="cancel" formnovalidate>Anuluj</button>${isNew ? '' : '<button class="danger" value="delete" formnovalidate>Usuń</button>'}</div>`;
  form.onsubmit = ev => {
    const v = ev.submitter && ev.submitter.value;
    if (v === 'delete') { if (!confirm('Usunąć ten kontakt?')) return; const idx = list().findIndex(x => x.id === c.id); const copy = list()[idx]; list().splice(idx, 1); B.save(); render(); renderTray(); snack('Usunięto kontakt', () => { list().push(copy); B.save(); render(); renderTray(); }); return; }
    if (v !== 'save') return;
    const d = Object.fromEntries(new FormData(form));
    if (!(d.firstName.trim() || d.lastName.trim() || d.company.trim())) { ev.preventDefault(); toast('Podaj imię, nazwisko lub firmę'); form.elements.firstName.focus(); return; }
    const badMail = String(d.emails || '').split(/[,;]/).map(x => x.trim()).filter(Boolean).find(x => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    if (badMail) { ev.preventDefault(); toast('Niepoprawny e-mail: ' + badMail); form.elements.emails.focus(); return; }
    const split = s => String(s || '').split(/[,;]/).map(x => x.trim()).filter(Boolean);
    Object.assign(c, { firstName: d.firstName.trim(), lastName: d.lastName.trim(), company: d.company.trim(), title: d.title.trim(), industry: d.industry.trim(), city: d.city.trim(), website: d.website.trim(), emails: split(d.emails), phones: split(d.phones), tags: split(d.tags), relation: d.relation, scale: d.scale, notes: d.notes.trim() });
    if (isNew) list().push(c);
    B.save(); render(); renderTray(); toast('Zapisano kontakt');
  };
  $('#ct-dialog').showModal();
}
$('#ct-new').onclick = () => openForm();
$('#ct-scan').onclick = () => B.show('scan');

/* ---------- import / eksport ---------- */
const CSV_COLS = ['firstName', 'lastName', 'company', 'title', 'industry', 'emails', 'phones', 'website', 'city', 'tags', 'relation', 'scale', 'notes'];
function toCsv(rows) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return '﻿' + [CSV_COLS.join(',')].concat(rows.map(c => CSV_COLS.map(k => q(Array.isArray(c[k]) ? c[k].join('; ') : c[k])).join(','))).join('\r\n');
}
function parseCsv(t) {
  const out = []; let row = [], cur = '', inQ = false; t = t.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQ) { if (ch === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === ';') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) out.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(x => x.trim())) out.push(row);
  const head = (out.shift() || []).map(h => h.trim());
  return out.map(r => { const o = {}; head.forEach((h, i) => { if (CSV_COLS.includes(h)) o[h] = (r[i] || '').trim(); }); return o; });
}
function normalize(d, source) {
  const split = s => (Array.isArray(s) ? s : String(s || '').split(/[;,]/)).map(x => String(x).trim()).filter(Boolean);
  return { id: uid(), firstName: d.firstName || '', lastName: d.lastName || '', company: d.company || '', title: d.title || '', industry: d.industry || '', emails: split(d.emails), phones: split(d.phones), website: d.website || '', city: d.city || '', tags: split(d.tags), relation: d.relation || '', scale: d.scale || '', notes: d.notes || '', source, createdAt: new Date().toISOString() };
}
function addContacts(items, label) {
  const ex = list(); let added = 0, skipped = 0;
  items.forEach(c => {
    const dup = ex.some(x => (arr(c.emails)[0] && arr(x.emails).includes(arr(c.emails)[0])) || (fullName(c) !== 'Bez nazwy' && fullName(x).toLowerCase() === fullName(c).toLowerCase() && (x.company || '') === (c.company || '')));
    if (dup) { skipped++; return; } ex.push(c); added++;
  });
  B.save(); render(); renderTray(); snack(added ? `${label || 'Dodano'}: ${added}${skipped ? ` (pominięto duplikaty: ${skipped})` : ''}` : 'Te kontakty są już w magazynie');
  return added;
}
$('#ct-import').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const text = await f.text();
    let items;
    if (/BEGIN:VCARD/i.test(text) && window.BNIScan) items = window.BNIScan.parseVCard(text).map(d => normalize(d, 'import'));
    else items = parseCsv(text).map(d => normalize(d, 'import'));
    if (!items.length) return toast('Nie znaleziono kontaktów w pliku');
    addContacts(items, 'Zaimportowano');
  } catch (err) { toast('Nie udało się odczytać pliku'); }
};
$('#ct-export').onclick = () => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCsv(list())], { type: 'text/csv;charset=utf-8' })); a.download = 'kontakty.csv'; a.click();
};

/* ---------- przykładowe (fikcyjne) kontakty ---------- */
const FN = ['Adam', 'Beata', 'Cezary', 'Dorota', 'Emil', 'Filip', 'Gabriela', 'Hubert', 'Iwona', 'Józef', 'Karolina', 'Lech', 'Marta', 'Norbert', 'Olga', 'Paweł', 'Renata', 'Stefan', 'Teresa', 'Urszula'];
const LN = ['Kowalczyk', 'Nowicki', 'Wrona', 'Lis', 'Sowa', 'Jastrzębski', 'Kruk', 'Zając', 'Bąk', 'Sikora', 'Mazur', 'Pawlak', 'Górecki', 'Duda', 'Kaczmarek', 'Wilk', 'Rybak', 'Gołąb', 'Szulc', 'Orzeł'];
const FIRMS = [['Alfa Budowa', 'Budowlana – deweloper'], ['Beta Foods', 'Spożywcza producent'], ['Gamma Logistyka', 'Logistyka i transport'], ['Delta Med', 'Medyczna – gabinety'], ['Epsilon IT', 'IT – oprogramowanie'], ['Zeta Auto', 'Motoryzacyjna – serwis'], ['Eta Energia', 'OZE – fotowoltaika'], ['Theta Tekstylia', 'Tekstylia'], ['Iota Design', 'Projektowanie wnętrz'], ['Kappa Consulting', 'Doradztwo biznesowe']];
const TITLES = ['Prezes', 'Dyrektor', 'Właściciel', 'Manager', 'Specjalista'];
const CITIES = ['Katowice', 'Kraków', 'Gliwice', 'Wrocław', 'Łódź', 'Poznań'];
function loadDemo() {
  const items = Array.from({ length: 36 }, (_, i) => {
    const f = FIRMS[i % FIRMS.length], fn = FN[i % FN.length], ln = LN[(i * 7 + 3 + Math.floor(i / 20) * 5) % LN.length];
    return normalize({ firstName: fn, lastName: ln, company: f[0] + ' Sp. z o.o.', title: TITLES[i % TITLES.length], industry: f[1], emails: `${fn.toLowerCase().replace(/[^a-z]/g, 'x')}.${i}@example.com`, phones: `+48 600 000 ${String(100 + i).padStart(3, '0')}`, city: CITIES[i % CITIES.length], tags: [f[1].split(' ')[0], i % 3 === 0 ? 'VIP' : 'BNI'], relation: REL[i % 2], scale: SCALE[i % 3], notes: 'Fikcyjny kontakt demonstracyjny.' }, 'manual');
  });
  addContacts(items, 'Wczytano przykładowe');
}
$('#ct-demo').onclick = loadDemo;

/* ---------- dodawanie do wizytówki ---------- */
const toOffered = c => ({ name: fullName(c), company: c.company || '', industry: c.industry || '', relation: c.relation || 'Znajomy / Klient', scale: c.scale || '' });
const toSought = c => ({ name: fullName(c), company: c.company || '', industry: c.industry || '', why: c.notes || '' });
const mk = (c, key) => key === 'offered' ? toOffered(c) : toSought(c);
const cols = key => key === 'offered' ? B.OFFERED_COLS : B.SOUGHT_COLS;
function insertRow(key, row, at) {
  const card = B.cur(); if (!card) { toast('Najpierw wybierz wizytówkę'); return false; }
  const rows = card[key];
  const before = JSON.stringify(rows); let verb = 'Dodano';
  if (at == null) { const e = rows.findIndex(blank); if (e >= 0) rows[e] = row; else if (rows.length < MAX) rows.push(row); else { toast(`Lista ma już ${MAX} wierszy`); return false; } }
  else if (blank(rows[at])) rows[at] = row;
  else if (rows.length < MAX) rows.splice(at, 0, row);
  else { const e = rows.map(blank).lastIndexOf(true); if (e >= 0) { rows.splice(at, 0, row); rows.splice(e >= at ? e + 1 : e, 1); } else { rows[at] = row; verb = 'Zastąpiono wiersz ' + (at + 1); } }
  B.save(); if (!$('#view-editor').classList.contains('active')) { /* tylko dane */ } else B.renderTable(key, cols(key));
  snack(`${verb}: ${row.name}`, () => { card[key] = JSON.parse(before); B.save(); if ($('#view-editor').classList.contains('active')) B.renderTable(key, cols(key)); });
  return true;
}
function addToCard(c, key) { if (insertRow(key, mk(c, key))) { const card = B.cur(); if (card) toast(`${fullName(c)} → ${card.name || 'wizytówka'} (${key === 'offered' ? 'oferowani' : 'poszukiwani'})`); } }
function moveRow(key, from, to) {
  const card = B.cur(), rows = card[key]; if (from === to || from < 0 || to < 0 || to >= rows.length) return;
  const before = JSON.stringify(rows); const [r] = rows.splice(from, 1); rows.splice(to, 0, r);
  B.save(); B.renderTable(key, cols(key));
  snack('Zmieniono kolejność', () => { card[key] = JSON.parse(before); B.save(); B.renderTable(key, cols(key)); });
}

/* ---------- tacka w edytorze ---------- */
function renderTray() {
  const tray = $('#ct-tray'), has = !!B.cur();
  tray.hidden = !has; if (!has) return;
  const q = ($('#tray-q') && $('#tray-q').value || '').toLowerCase();
  const all = list().filter(c => matches(c, q)), rows = all.slice(0, 80);
  tray.innerHTML = `<div class="tray-head"><h3>Magazyn kontaktów</h3><small>${list().length} kontaktów</small></div>
    <input id="tray-q" type="search" placeholder="Szukaj w magazynie…" value="${esc(q)}" aria-label="Szukaj w magazynie">
    <p class="hint hint-drag">Chwyć <b>⋮⋮</b> i upuść na wiersz tabeli <b>TOP 20</b>. Możesz też użyć przycisków poniżej (działają z klawiatury).</p><p class="hint hint-tap">Dotknij <b>+ Oferuję</b> lub <b>+ Szukam</b>, aby dodać kontakt do list TOP 20.</p>
    ${all.length > rows.length ? `<p class="hint">Pokazano ${rows.length} z ${all.length} – zawęź wyszukiwanie.</p>` : ''}<div class="tray-list">${rows.length ? rows.map(c => `<div class="tc" data-id="${esc(c.id)}"><span class="dh" data-drag="${esc(c.id)}" role="button" tabindex="0" aria-label="Przeciągnij ${esc(fullName(c))}" title="Przeciągnij">⋮⋮</span>${avatar(c)}<span class="tc-main"><b>${esc(fullName(c))}</b><small>${esc(c.company || c.industry || '')}</small></span><span class="tc-act"><button class="small" data-add="offered" aria-label="Dodaj ${esc(fullName(c))} do oferowanych" title="Dodaj do TOP 20 oferowanych">+ Oferuję</button><button class="small" data-add="sought" aria-label="Dodaj ${esc(fullName(c))} do poszukiwanych" title="Dodaj do TOP 20 poszukiwanych">+ Szukam</button></span></div>`).join('') : `<div class="empty small"><p>${list().length ? 'Brak wyników.' : 'Magazyn jest pusty.'}</p>${list().length ? '' : '<button class="small primary" data-demo>Wczytaj przykładowe</button> <button class="small" data-goscan>Skanuj</button>'}</div>`}</div>`;
  const ol = $('#tbl-offered') && $('#tbl-offered').closest('.tablewrap'), sl = $('#tbl-sought') && $('#tbl-sought').closest('.tablewrap');
  if (ol) ol.dataset.zone = 'offered'; if (sl) sl.dataset.zone = 'sought';
}
$('#ct-tray').addEventListener('keydown', e => { const h = e.target.closest && e.target.closest('.dh'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); const b = h.closest('.tc').querySelector('[data-add]'); if (b) b.focus(); } });
$('#ct-tray').addEventListener('input', e => { if (e.target.id === 'tray-q') { const p = e.target.selectionStart; renderTray(); const n = $('#tray-q'); n.focus(); n.setSelectionRange(p, p); } });
$('#ct-tray').addEventListener('click', e => {
  if (e.target.closest('[data-demo]')) return loadDemo();
  if (e.target.closest('[data-goscan]')) return B.show('scan');
  const b = e.target.closest('[data-add]'); if (!b) return;
  const c = list().find(x => x.id === b.closest('.tc').dataset.id); if (c) addToCard(c, b.dataset.add);
});

/* ---------- silnik przeciągania (pointer events: mysz + dotyk) ---------- */
let drag = null;
function ghostLabel(src) { return src.kind === 'contact' ? fullName(list().find(c => c.id === src.id) || {}) : `Wiersz ${src.i + 1}`; }
document.addEventListener('pointerdown', e => {
  const h = e.target.closest('[data-drag],[data-grip]'); if (!h || e.button > 0) return;
  const src = h.dataset.drag ? { kind: 'contact', id: h.dataset.drag } : { kind: 'row', key: h.closest('tr').dataset.drop, i: +h.closest('tr').dataset.i };
  drag = { src, h, x: e.clientX, y: e.clientY, on: false, pid: e.pointerId };
  try { h.setPointerCapture(e.pointerId); } catch (_) {}
});
document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    drag.on = true; document.body.classList.add('dragging');
    const g = document.createElement('div'); g.className = 'drag-ghost'; g.textContent = ghostLabel(drag.src); document.body.appendChild(g); drag.g = g;
  }
  e.preventDefault();
  drag.lx = e.clientX; drag.ly = e.clientY;
  drag.g.style.transform = `translate(${e.clientX + 12}px,${e.clientY + 12}px)`;
  updateTarget();
  if (!drag.raf) drag.raf = requestAnimationFrame(autoscroll);
}, { passive: false });
function updateTarget() {
  $$('.drop-over').forEach(n => n.classList.remove('drop-over'));
  const t = dropTarget(drag.lx, drag.ly); drag.t = t; if (t) t.el.classList.add('drop-over');
}
function autoscroll() {
  if (!drag || !drag.on) return; const m = 70, y = drag.ly;
  if (y < m) { window.scrollBy(0, -14); updateTarget(); } else if (y > innerHeight - m) { window.scrollBy(0, 14); updateTarget(); }
  drag.raf = requestAnimationFrame(autoscroll);
}
function dropTarget(x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    const row = el.closest && el.closest('tr[data-drop]');
    if (row) { if (drag.src.kind === 'row' && row.dataset.drop !== drag.src.key) return null; return { el: row, key: row.dataset.drop, i: +row.dataset.i }; }
    const zone = el.closest && el.closest('[data-zone]');
    if (zone && drag.src.kind === 'contact') return { el: zone, key: zone.dataset.zone, i: null };
  }
  return null;
}
function endDrag(commit) {
  if (!drag) return; const d = drag; drag = null;
  if (d.raf) cancelAnimationFrame(d.raf); document.body.classList.remove('dragging'); $$('.drop-over').forEach(n => n.classList.remove('drop-over')); if (d.g) d.g.remove();
  if (!d.on || !commit || !d.t) return;
  if (d.src.kind === 'contact') { const c = list().find(x => x.id === d.src.id); if (c) insertRow(d.t.key, mk(c, d.t.key), d.t.i); }
  else moveRow(d.src.key, d.src.i, d.t.i);
}
document.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.pid) endDrag(true); });
document.addEventListener('pointercancel', () => endDrag(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) endDrag(false); });
/* klawiatura: uchwyt wiersza – Alt+↑/↓ przenosi wiersz */
document.addEventListener('keydown', e => {
  const g = e.target.closest && e.target.closest('[data-grip]'); if (!g || !e.altKey || !/Arrow(Up|Down)/.test(e.key)) return;
  const tr = g.closest('tr'); e.preventDefault(); moveRow(tr.dataset.drop, +tr.dataset.i, +tr.dataset.i + (e.key === 'ArrowUp' ? -1 : 1));
});
document.addEventListener('selectstart', e => { if (drag && drag.on) e.preventDefault(); });

/* ---------- skan ---------- */
let scanMounted = false;
function mountScan() {
  if (scanMounted) return;
  if (!window.BNIScan) { $('#scan-root').innerHTML = '<div class="empty"><h3>Moduł skanowania niedostępny</h3></div>'; return; }
  window.BNIScan.mount($('#scan-root'), { existing: list, onSave: items => { const added = addContacts(items.map(c => Object.assign(normalize(c, 'scan'), { id: c.id || uid() })), 'Zapisano ze skanu'); if (added) setTimeout(() => B.show('contacts'), 600); } });
  scanMounted = true;
}

/* ---------- paleta poleceń ---------- */
const pal = $('#palette'), palIn = $('#pal-input'), palList = $('#pal-list');
let palItems = [], palSel = 0;
function palBuild() {
  const q = palIn.value.trim().toLowerCase();
  const cmds = [['Wizytówki', () => B.show('cards')], ['Kontakty', () => B.show('contacts')], ['Skanuj wizytówkę', () => B.show('scan')], ['Edytor', () => B.show('editor')], ['Podgląd i druk', () => B.show('preview')], ['Sieć połączeń', () => B.show('links')], ['Nowy kontakt', () => { B.show('contacts'); openForm(); }], ['Zmień motyw', toggleTheme]].filter(([t]) => t.toLowerCase().includes(q)).map(([t, f]) => ({ t, k: 'Polecenie', f }));
  const cards = B.state.cards.filter(c => (c.name || '').toLowerCase().includes(q)).slice(0, 5).map(c => ({ t: c.name || 'Bez nazwy', k: 'Wizytówka', id: c.id, f: () => B.show('editor') }));
  const cts = q ? list().filter(c => matches(c, q)).slice(0, 8).map(c => ({ t: fullName(c), k: 'Kontakt', f: () => { B.show('contacts'); openForm(c); } })) : [];
  palItems = cmds.concat(cards, cts); palSel = 0; palDraw();
}
function palDraw() { palList.innerHTML = palItems.map((x, i) => `<li role="option" aria-selected="${i === palSel}" class="${i === palSel ? 'sel' : ''}" data-i="${i}"><span>${esc(x.t)}</span><small>${x.k}</small></li>`).join('') || '<li class="none">Brak wyników</li>'; }
function palRun(i) { const x = palItems[i]; if (!x) return; pal.close(); if (x.id) B.setCurrent(x.id); x.f(); }
function openPalette() { palIn.value = ''; palBuild(); pal.showModal(); palIn.focus(); }
$('#btn-palette').onclick = openPalette;
palIn.addEventListener('input', palBuild);
palIn.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { palSel = Math.min(palSel + 1, palItems.length - 1); palDraw(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { palSel = Math.max(palSel - 1, 0); palDraw(); e.preventDefault(); }
  else if (e.key === 'Enter') { palRun(palSel); }
});
palList.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) palRun(+li.dataset.i); });
pal.addEventListener('click', e => { if (e.target === pal) pal.close(); });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.open ? pal.close() : openPalette(); }
  else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && $('#view-contacts').classList.contains('active')) { e.preventDefault(); $('#ct-search').focus(); }
});

/* ---------- motyw ---------- */
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
function toggleTheme() {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark'; applyTheme(next); try { localStorage.setItem('bni-theme', next); } catch (e) {}
}
try { applyTheme(localStorage.getItem('bni-theme')); } catch (e) {}
$('#btn-theme').onclick = toggleTheme;

/* ---------- integracja z widokami ---------- */
new MutationObserver(() => { if ($('#view-editor').classList.contains('active')) renderTray(); }).observe($('#view-editor'), { attributes: true, attributeFilter: ['class'] });
window.BNIContacts = { render, mountScan, onData() { render(); renderTray(); }, addContacts, fullName };
render();
})();
