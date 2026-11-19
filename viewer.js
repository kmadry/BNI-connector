/* Publiczny widok wizytówki online (cel kodu QR): tylko wizytówka + polecajki. Tylko odczyt – nic nie zapisuje. */
(() => {
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const blank = r => !r || !Object.values(r).some(v => String(v || '').trim());
const tel = p => String(p || '').replace(/[^\d+]/g, '');
const mailOk = e => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(e || ''));
const cell = v => esc(v || '').replace(/ \/ /g, ' · ');

function vcard(c) {
  const parts = String(c.name || '').trim().split(/\s+/), last = parts.length > 1 ? parts.pop() : '', first = parts.join(' ');
  const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${last};${first};;;`, `FN:${c.name || ''}`];
  if (c.company || c.group) L.push(`ORG:${c.company || c.group}`);
  [c.phone, c.phone2].filter(Boolean).forEach(p => L.push(`TEL;TYPE=CELL:${tel(p)}`));
  if (mailOk(c.email)) L.push(`EMAIL:${c.email}`);
  if (c.city) L.push(`ADR;TYPE=WORK:;;;${c.city};;;`);
  L.push(`NOTE:${[c.group, 'Wizytówka Referra'].filter(Boolean).join(' – ')}`, 'END:VCARD');
  return L.join('\r\n').replace(/[<>]/g, '');
}

function render(c, ctx, logo) {
  const off = (c.offered || []).filter(r => !blank(r)), sou = (c.sought || []).filter(r => !blank(r));
  const qa = (c.qa || []).filter(x => x && String(x.a || '').trim());
  const phones = [c.phone, c.phone2].filter(p => tel(p).length >= 5);
  document.title = (c.name ? c.name + ' – ' : '') + 'Referra';
  $('#viewer').innerHTML = `
  <header class="v-hero" style="--acc:${esc(c.accent)}">
    <div class="v-brand"><div class="v-logo">${ctx.logoHTML(logo, c.accent)}</div><span class="v-kicker">Wizytówka</span></div>
    <h1>${esc(c.name || 'Wizytówka')}</h1>
    <p class="v-sub">${[c.group, c.city, c.company].filter(Boolean).map(esc).join(' · ')}</p>
    <div class="v-actions">
      ${phones.map(p => `<a class="v-btn v-primary" href="tel:${esc(tel(p))}">${esc(p)}</a>`).join('')}
      ${mailOk(c.email) ? `<a class="v-btn" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}
      <button class="v-btn" id="v-save" type="button">Zapisz kontakt</button>
    </div>
  </header>
  ${off.length ? `<section class="v-sec"><h2>Polecam kontakty <span class="v-count">${off.length}</span></h2><ol class="v-list">${off.map((r, i) => `<li><span class="v-n">${i + 1}</span><div class="v-main"><b>${esc(r.name || '')}</b><small>${[r.company, r.industry].filter(Boolean).map(esc).join(' · ')}</small></div><div class="v-tags">${r.relation ? `<span class="v-badge">${cell(r.relation)}</span>` : ''}${r.scale ? `<span class="v-chip">${esc(r.scale)}</span>` : ''}</div></li>`).join('')}</ol></section>` : ''}
  ${sou.length ? `<details class="v-sec v-fold"><summary><h2>Szukam kontaktów <span class="v-count">${sou.length}</span></h2></summary><ol class="v-list">${sou.map((r, i) => `<li><span class="v-n">${i + 1}</span><div class="v-main"><b>${esc(r.name || '')}</b><small>${[r.company, r.industry].filter(Boolean).map(esc).join(' · ')}</small>${r.why ? `<em>${esc(r.why)}</em>` : ''}</div></li>`).join('')}</ol></details>` : ''}
  ${qa.length ? `<section class="v-sec"><h2>8 pytań 1:1</h2>${qa.map((x, i) => `<details><summary><span class="v-n">${i + 1}</span>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join('')}</section>` : ''}
  <footer class="v-foot"><span>Referra</span><span>Wizytówka online</span></footer>`;
  $('#v-save').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([vcard(c)], { type: 'text/vcard;charset=utf-8' }));
    a.download = (String(c.name || 'kontakt').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'kontakt') + '.vcf'; a.click();
  };
}

function fail(msg, sub) { $('#viewer').innerHTML = `<div class="v-empty"><div class="v-kicker">Referra</div><h1>${esc(msg)}</h1><p>${esc(sub || '')}</p></div>`; }

async function run(ctx) {
  document.body.classList.add('viewer-mode');
  window.addEventListener('hashchange', () => location.reload());
  const root = $('#viewer'); root.hidden = false;
  root.innerHTML = '<div class="v-skel" aria-busy="true"><div class="v-sk a"></div><div class="v-sk b"></div><div class="v-sk c"></div></div>';
  try {
    const m = location.hash.match(/^#(c|card)=(.+)$/); let card;
    let logo = null;
    if (m[1] === 'c') {
      const id = decodeURIComponent(m[2]);
      if (!ctx.okId(id)) return fail('Nie znaleziono wizytówki', 'Link jest nieprawidłowy.');
      const res = await ctx.rpc('get_public_card', { p_id: id });
      if (!res || !res.card) return fail('Nie znaleziono wizytówki', 'Jest prywatna albo została usunięta.');
      card = ctx.normCard(res.card); logo = ctx.sanitizeLogo(res.logo);
    } else card = ctx.normCard(JSON.parse(await ctx.unpack(m[2])));
    render(card, ctx, logo || ctx.sanitizeLogo(null));
  } catch (e) { fail('Nie udało się wczytać wizytówki', 'Sprawdź połączenie z internetem i spróbuj ponownie.'); }
}

window.BNIViewer = { run, render, vcard };
})();
