/* Panel „Komfort”: ustawienia sensoryczne i poznawcze, stosowane na żywo i zapamiętywane w tej przeglądarce. */
(() => {
'use strict';
const KEY = 'bni-comfort';
const DEFAULTS = { detail: 'simple', density: 'spacious', text: '100', contrast: 'soft', theme: 'auto', motion: 'off', font: 'plex', caps: 'on' };
const GROUPS = [
  { title: 'Czytanie', items: [
    { key: 'text', label: 'Rozmiar tekstu', opts: [['100', '100%'], ['115', '115%'], ['130', '130%'], ['150', '150%']] },
    { key: 'font', label: 'Czcionka', opts: [['plex', 'Standardowa'], ['readable', 'Czytelna']] },
    { key: 'caps', label: 'Wielkie litery', opts: [['on', 'Jak dotąd'], ['off', 'Wyłączone']] }
  ] },
  { title: 'Wygląd', items: [
    { key: 'theme', label: 'Motyw', opts: [['auto', 'Auto'], ['light', 'Jasny'], ['dark', 'Ciemny'], ['evening', 'Wieczorny']] },
    { key: 'contrast', label: 'Kontrast', opts: [['soft', 'Łagodny'], ['high', 'Wysoki']] },
    { key: 'density', label: 'Odstępy', opts: [['spacious', 'Przestronnie'], ['standard', 'Standard']] }
  ] },
  { title: 'Zachowanie', items: [
    { key: 'detail', label: 'Poziom szczegółów', opts: [['simple', 'Prosty'], ['full', 'Pełny']], note: 'Pełny dodaje zakładki Skan, Edytor i Druk.' },
    { key: 'motion', label: 'Animacje', opts: [['off', 'Brak'], ['on', 'Delikatne']] }
  ] }
];

let st = Object.assign({}, DEFAULTS);
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) st = Object.assign(st, s); else { const o = localStorage.getItem('bni-theme'); if (o === 'dark' || o === 'light') st.theme = o; } } catch (e) {}

function apply() {
  const h = document.documentElement;
  ['detail', 'density', 'text', 'contrast', 'motion', 'font', 'caps'].forEach(k => { h.dataset[k] = st[k]; });
  if (st.theme === 'auto') delete h.dataset.theme; else h.dataset.theme = st.theme;
  const tc = document.querySelector('meta[name=theme-color]');
  if (tc) tc.content = getComputedStyle(h).getPropertyValue('--paper').trim() || '#f2eee3';
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

const dlg = document.createElement('dialog');
dlg.id = 'comfort-dialog';
dlg.setAttribute('aria-labelledby', 'cf-title');
dlg.innerHTML = `<div class="cf-body">
  <h2 id="cf-title">Komfort</h2>
  <p class="sub">Dopasuj wygląd do siebie. Zmiany działają od razu i zostają w tej przeglądarce.</p>
  ${GROUPS.map(g => `<section class="cf-group"><h3>${g.title}</h3>${g.items.map(it => `<div class="cf-row"><span class="cf-label" id="cf-l-${it.key}">${it.label}</span>
    <div class="cf-seg" role="group" aria-labelledby="cf-l-${it.key}">${it.opts.map(([v, l]) => `<button type="button" data-k="${it.key}" data-v="${v}" aria-pressed="false">${l}</button>`).join('')}</div>${it.note ? `<small class="cf-note">${it.note}</small>` : ''}</div>`).join('')}</section>`).join('')}
  <section class="cf-preview" aria-label="Podgląd"><h3>Tak to wygląda</h3><p>Przykładowy tekst, który czytasz na co dzień. <b>Wyróżnienie</b> i <span class="cf-link">odnośnik</span>.</p><button type="button" class="primary">Przykładowy przycisk</button></section>
  <div class="cf-actions"><button type="button" id="cf-reset">Przywróć domyślne</button><button type="button" class="primary" id="cf-close">Gotowe</button></div>
</div>`;
document.body.appendChild(dlg);

function sync() { dlg.querySelectorAll('.cf-seg button').forEach(b => b.setAttribute('aria-pressed', String(st[b.dataset.k] === b.dataset.v))); }
dlg.addEventListener('click', e => {
  const b = e.target.closest('.cf-seg button');
  if (b) { st[b.dataset.k] = b.dataset.v; apply(); save(); sync(); return; }
  if (e.target.id === 'cf-reset') { st = Object.assign({}, DEFAULTS); apply(); save(); sync(); return; }
  if (e.target.id === 'cf-close' || e.target === dlg) dlg.close();
});
function open() { sync(); dlg.showModal(); const f = dlg.querySelector('.cf-seg button[aria-pressed=true]'); if (f) f.focus(); }

const btn = document.getElementById('btn-theme'); if (btn) btn.onclick = open;
apply();
window.BNIComfort = { open, get: () => Object.assign({}, st), set: (k, v) => { st[k] = v; apply(); save(); sync(); } };
})();
