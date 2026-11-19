/* PWA: rejestracja service workera i pełnoekranowy kod QR (#qr), który działa także bez internetu. */
(() => {
'use strict';
const KEY = 'bni-qr-cache';
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function cacheQr(o) { try { if (o && o.svg && o.url) localStorage.setItem(KEY, JSON.stringify({ url: o.url, name: o.name || '', svg: o.svg, at: Date.now() })); } catch (e) {} }
function readQr() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
function clearQr() { try { localStorage.removeItem(KEY); } catch (e) {} }

let el = null;
function close() { if (el) { el.remove(); el = null; } document.body.classList.remove('qr-screen-on'); if (location.hash === '#qr') history.replaceState(null, '', location.pathname + location.search); }
function open() {
  if (el) return; const c = readQr();
  el = document.createElement('div'); el.id = 'qr-screen'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Mój kod QR');
  el.innerHTML = c
    ? `<div class="qs-box"><div class="qs-qr">${c.svg}</div><p class="qs-name">${esc(c.name)}</p><p class="qs-hint">Pokaż ten kod, aby ktoś zobaczył Twoją wizytówkę.${navigator.onLine ? '' : ' Działa bez internetu.'}</p><button type="button" class="primary" id="qs-close">Zamknij</button></div>`
    : `<div class="qs-box"><p class="qs-name">Nie ma jeszcze kodu QR</p><p class="qs-hint">Zaloguj się i udostępnij swoją wizytówkę w aplikacji. Potem kod będzie dostępny tutaj także offline.</p><button type="button" class="primary" id="qs-close">Zamknij</button></div>`;
  document.body.appendChild(el); document.body.classList.add('qr-screen-on');
  el.querySelector('#qs-close').onclick = close;
  document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
  const b = el.querySelector('#qs-close'); if (b) b.focus();
}
window.addEventListener('hashchange', () => { if (location.hash === '#qr') open(); });
if (location.hash === '#qr') document.addEventListener('DOMContentLoaded', open); // otwarte ze skrótu na ekranie głównym
window.BNIPwa = { cacheQr, clearQr, open, close, readQr };
})();
