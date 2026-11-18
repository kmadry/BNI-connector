/* Okno ustawień logo: tekst (domyślnie „BNI”, jak we wzorze wizytówki) albo wgrany obraz. Zapis w bazie (bni_settings). */
(() => {
'use strict';
const B = window.BNI;
if (!B) return;
const { $, toast } = B;
const MAX_BYTES = 150 * 1024, TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
let draft = null;

const dlg = document.createElement('dialog');
dlg.id = 'logo-dialog';
dlg.setAttribute('aria-label', 'Logo na wizytówkach');
dlg.innerHTML = `<form method="dialog" class="lg-body" id="lg-form">
  <h2>Logo</h2>
  <p class="sub">Okładka wizytówki, podgląd, druk i strona z kodem QR.</p>
  <div class="lg-preview" id="lg-prev" aria-live="polite"></div>
  <div class="lg-opts">
    <div class="wide lg-seg" role="group" aria-label="Typ logo">
      <button type="button" data-mode="text" aria-pressed="true">Tekst</button>
      <button type="button" data-mode="image" aria-pressed="false">Obraz</button>
    </div>
    <label class="wide" id="lg-text-w">Tekst logo<input id="lg-text" maxlength="14" autocomplete="off"></label>
    <label id="lg-color-w">Kolor<input type="color" id="lg-color"></label>
    <label class="chk" id="lg-auto-w"><input type="checkbox" id="lg-auto"> Kolor akcentu karty</label>
    <label class="chk" id="lg-it-w"><input type="checkbox" id="lg-it"> Pochylone</label>
    <label class="chk" id="lg-reg-w"><input type="checkbox" id="lg-reg"> Znak ®</label>
    <label class="wide" id="lg-img-w" hidden>Plik logo (PNG, JPG, WebP lub SVG, do 150 kB)<input type="file" id="lg-file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>
    <label class="chk wide"><input type="checkbox" id="lg-ref"> Pokaż mały znak Referra na dole okładki</label>
  </div>
  <div class="bar" style="margin-top:18px">
    <button class="primary" value="save">Zapisz</button>
    <button type="button" id="lg-reset">Przywróć BNI</button>
    <button value="cancel" formnovalidate>Anuluj</button>
  </div>
</form>`;
document.body.appendChild(dlg);

function draw() {
  const textMode = draft.mode !== 'image';
  $('#lg-prev').innerHTML = B.logoHTML(draft, '#e8473f', 0) || '';
  dlg.querySelectorAll('.lg-seg button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.mode === 'text') === textMode)));
  ['lg-text-w', 'lg-color-w', 'lg-auto-w', 'lg-it-w', 'lg-reg-w'].forEach(id => { $('#' + id).hidden = !textMode; });
  $('#lg-img-w').hidden = textMode;
  $('#lg-color').disabled = !draft.color;
}
function load() {
  draft = Object.assign({}, B.getLogo());
  $('#lg-text').value = draft.text; $('#lg-color').value = draft.color || '#c4251d'; $('#lg-auto').checked = !draft.color;
  $('#lg-it').checked = draft.italic; $('#lg-reg').checked = draft.reg; $('#lg-ref').checked = draft.referra; $('#lg-file').value = '';
  draw();
}
function open() { load(); dlg.showModal(); $('#lg-text').focus(); }

dlg.addEventListener('click', e => {
  const m = e.target.closest('.lg-seg button');
  if (m) { draft.mode = m.dataset.mode; if (draft.mode === 'image' && !draft.image) toast('Wybierz plik z logo'); draw(); }
  if (e.target === dlg) dlg.close();
});
$('#lg-text').addEventListener('input', e => { draft.text = e.target.value.replace(/[<>]/g, '') || 'BNI'; draw(); });
$('#lg-color').addEventListener('input', e => { draft.color = e.target.value; draw(); });
$('#lg-auto').addEventListener('change', e => { draft.color = e.target.checked ? '' : $('#lg-color').value; draw(); });
$('#lg-it').addEventListener('change', e => { draft.italic = e.target.checked; draw(); });
$('#lg-reg').addEventListener('change', e => { draft.reg = e.target.checked; draw(); });
$('#lg-ref').addEventListener('change', e => { draft.referra = e.target.checked; });
$('#lg-reset').addEventListener('click', () => { draft = Object.assign({}, B.sanitizeLogo(null)); $('#lg-text').value = draft.text; $('#lg-auto').checked = true; $('#lg-it').checked = true; $('#lg-reg').checked = true; $('#lg-ref').checked = true; draw(); });
$('#lg-file').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  if (!TYPES.includes(f.type)) { toast('Dozwolone: PNG, JPG, WebP, SVG'); e.target.value = ''; return; }
  if (f.size > MAX_BYTES) { toast('Plik jest za duży (max 150 kB)'); e.target.value = ''; return; }
  if (f.type === 'image/svg+xml') {
    const t = await f.text();
    if (/<script|\son\w+\s*=|javascript:|<foreignObject/i.test(t)) { toast('SVG zawiera niedozwolone elementy'); e.target.value = ''; return; }
  }
  const r = new FileReader();
  r.onload = () => { draft.image = String(r.result); draft.mode = 'image'; draw(); };
  r.onerror = () => toast('Nie udało się odczytać pliku');
  r.readAsDataURL(f);
});
$('#lg-form').addEventListener('submit', ev => {
  if (!ev.submitter || ev.submitter.value !== 'save') return;
  if (draft.mode === 'image' && !draft.image) { ev.preventDefault(); toast('Wybierz plik z logo albo przejdź na tekst'); return; }
  B.setLogo(draft); B.renderPreview();
  toast('Zapisano logo');
});
const btn = $('#btn-logo'); if (btn) btn.onclick = open;
window.BNILogo = { open };
})();
