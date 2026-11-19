// E2E (Playwright, Chromium). Uruchom: NODE_PATH=$(npm root -g) node tests/e2e.js [katalog-na-screenshoty]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, q.url.split('?')[0].split('#')[0].replace(/^\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', types[path.extname(f)] || 'text/plain');
    try { JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')).headers[0].headers.forEach(h => r.setHeader(h.key, h.value)); } catch (x) {}
    r.end(d); });
}).listen(0);
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

process.on('exit', () => {});
(async () => {
  const port = srv.address().port, base = `http://localhost:${port}/index.html`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  globalThis.errs = []; const errs = globalThis.errs; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (/Content Security Policy|violates/i.test(m.text())) errs.push('CSP: ' + m.text().slice(0, 160)); }); p.on('dialog', d => d.accept());
  await p.goto(base); await p.waitForFunction(() => document.querySelector('#sync').textContent.trim().length > 0, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(500);
  ok('sync z bazą', /OK|zapisano/.test(await p.textContent('#sync')), await p.textContent('#sync'));
  await p.screenshot({ path: OUT + '/01-wizytowki.png' });

  // magazyn
  await p.click('#tabs [data-view=contacts]');
  if (await p.locator('.ct-row').count() < 30) { await p.evaluate(() => document.querySelector('#ct-demo').click()); await p.waitForTimeout(800); }
  const n = parseInt(await p.textContent('#ct-count')); const shownRows = await p.locator('.ct-row').count();
  ok('magazyn: kontakty w bazie', n >= 30, n + ' kontaktów');
  ok('magazyn: lista pokazuje tylko 12 naraz + „Pokaż kolejne”', shownRows === 12 && (await p.locator('[data-ct-more]').count()) === 1, shownRows + ' wierszy');
  await p.fill('#ct-search', 'Alfa'); const f = await p.locator('.ct-row').count(); ok('magazyn: wyszukiwanie filtruje', f > 0 && f < n, f + ' wyników');
  await p.fill('#ct-search', ''); await p.screenshot({ path: OUT + '/02-kontakty.png' });

  // edytor + przeciąganie
  await p.click('#tabs [data-view=cards]'); await p.click('.tile:has-text("Adam Przykładowy")'); await p.evaluate(() => window.BNI.setStep(3)); await p.waitForSelector('#ct-tray .tc');
  ok('tacka widoczna w edytorze', await p.isVisible('#ct-tray'));
  const before = await p.inputValue('#tbl-offered tr[data-i="2"] input[data-k="name"]');
  const names = (await p.locator('#ct-tray .tc-main b').allTextContents()).map(x => x.trim());
  const pick = names.findIndex(x => x !== before); const cname = names[pick];
  await p.evaluate(() => { const t = document.querySelector('#tbl-offered'); window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 160); });
  await p.waitForTimeout(250);
  const h = await p.locator('#ct-tray .dh').nth(pick).boundingBox();
  const row = await p.locator('#tbl-offered tr[data-i="2"]').boundingBox();
  await p.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await p.mouse.down();
  await p.mouse.move(h.x - 40, h.y + 20, { steps: 4 }); await p.mouse.move(row.x + row.width / 2, row.y + row.height / 2, { steps: 12 });
  ok('przeciąganie: wiersz podświetlony', await p.locator('.drop-over').count() > 0);
  await p.screenshot({ path: OUT + '/03-przeciaganie.png' });
  await p.mouse.up(); await p.waitForTimeout(300);
  const after = await p.inputValue('#tbl-offered tr[data-i="2"] input[data-k="name"]');
  ok('przeciąganie: kontakt wstawiony do TOP 20', after === cname, `${before} → ${after}`);
  await p.click('#snack button'); await p.waitForTimeout(300);
  ok('cofnij przywraca wiersz', (await p.inputValue('#tbl-offered tr[data-i="2"] input[data-k="name"]')) === before);

  // zmiana kolejności
  await p.evaluate(() => { const t = document.querySelector('#tbl-offered'); const y = t.getBoundingClientRect().top + window.scrollY; window.scrollTo(0, y - 120); });
  await p.waitForTimeout(200);
  const a0 = await p.inputValue('#tbl-offered tr[data-i="0"] input[data-k="name"]');
  const g = await p.locator('#tbl-offered tr[data-i="0"] .grip').boundingBox(), t = await p.locator('#tbl-offered tr[data-i="3"]').boundingBox();
  await p.mouse.move(g.x + 8, g.y + g.height / 2); await p.mouse.down(); await p.mouse.move(g.x + 20, g.y + 30, { steps: 3 }); await p.mouse.move(t.x + 80, t.y + t.height / 2, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(300);
  ok('zmiana kolejności wierszy', (await p.inputValue('#tbl-offered tr[data-i="3"] input[data-k="name"]')) === a0);
  await p.click('#snack button'); await p.waitForTimeout(300);
  ok('cofnij kolejność', (await p.inputValue('#tbl-offered tr[data-i="0"] input[data-k="name"]')) === a0);

  // przycisk +O na świeżej karcie (dostępność bez myszy)
  await p.screenshot({ path: OUT + '/04-edytor.png', fullPage: false });
  await p.click('#tabs [data-view=cards]'); await p.click('#btn-new'); await p.evaluate(() => window.BNI.setStep(3)); await p.waitForSelector('#ct-tray .tc');
  const first = (await p.locator('#ct-tray .tc-main b').first().textContent()).trim();
  await p.locator('#ct-tray .tc [data-add]').first().click(); await p.waitForTimeout(300);
  ok('przycisk +O dodaje kontakt do TOP 20', (await p.inputValue('#tbl-offered tr[data-i="0"] input[data-k="name"]')) === first, first);
  await p.evaluate(() => window.BNI.setStep(4)); await p.waitForSelector('#ct-tray .tray-for'); await p.locator('#ct-tray .tc [data-add]').nth(1).click(); await p.waitForTimeout(300);
  ok('przycisk +S dodaje kontakt do poszukiwanych', (await p.inputValue('#tbl-sought tr[data-i="0"] input[data-k="name"]')).length > 0);
  await p.evaluate(() => { window.BNI.setStep(5); document.querySelector('#btn-del').click(); }); await p.waitForTimeout(500);
  await p.click('#tabs [data-view=cards]'); await p.click('.tile:has-text("Adam Przykładowy")'); await p.evaluate(() => window.BNI.setStep(3)); await p.waitForSelector('#ct-tray .tc');

  // paleta
  await p.keyboard.press('Control+k'); await p.fill('#pal-input', 'kontakty'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('paleta poleceń otwiera widok', await p.locator('#view-contacts.active').count() === 1);

  // skan
  await p.evaluate(() => window.BNI.show('scan')); await p.waitForTimeout(300);
  ok('skan: moduł zamontowany', (await p.locator('#scan-root *').count()) > 5);
  const parsed = await p.evaluate(() => window.BNIScan.parseCardText('Jan Przykładowy\nDyrektor Handlowy\nAlfa Budowa Sp. z o.o.\ntel. +48 600 000 123\njan@example.com\nwww.example.com\nul. Testowa 1, 40-001 Katowice'));
  ok('skan: parser wyciąga e-mail/tel/firmę', /jan@example.com/.test(JSON.stringify(parsed)) && /600 000 123|600000123/.test(JSON.stringify(parsed)) && /Alfa Budowa/.test(JSON.stringify(parsed)), JSON.stringify(parsed).slice(0, 140));
  await p.screenshot({ path: OUT + '/05-skan.png' });
  await p.evaluate(() => window.BNI.show('preview')); await p.waitForSelector('.qr svg');
  ok('okladka: telefon i e-mail czytelne (kolor rozny od tla)', await p.evaluate(() => { const e = document.querySelector('.cover .cv-bot .ct'); const cs = getComputedStyle(e); return cs.color !== cs.backgroundColor && cs.backgroundColor === 'rgba(0, 0, 0, 0)'; }));
 await p.screenshot({ path: OUT + '/06-druk.png' });
  ok('okladka: brak stylow naglowka strony (tlo przezroczyste, nie sticky)', await p.evaluate(() => { const e = document.querySelector('.cover .cv-top'); const cs = getComputedStyle(e); return cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.position !== 'sticky'; }));
  await p.emulateMedia({ media: 'print' });
  ok('druk: imie, QR i kontakt na okladce widoczne', await p.evaluate(() => ['.cover .nm', '.cover .qr', '.cover .cv-bot .ct'].every(q => { const e = document.querySelector(q); return e && e.offsetParent !== null && e.getBoundingClientRect().height > 0; })));
  ok('druk: uklad A4 w dwoch kolumnach niezaleznie od podgladu', await p.evaluate(() => { const c = document.querySelector('.sheet-card'); return getComputedStyle(c).flexDirection === 'row'; }));
  await p.emulateMedia({ media: 'screen' });

  // mobile
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  m.on('pageerror', e => errs.push('mobile: ' + e.message));
  await m.goto(base); await m.waitForTimeout(2000);
  const navBox = await m.locator('.rail').boundingBox();
  ok('mobile: dolna nawigacja', navBox.y > 700 && navBox.width >= 385, JSON.stringify(navBox));
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('mobile: brak poziomego przewijania', overflow <= 1, 'nadmiar ' + overflow + 'px');
  await m.screenshot({ path: OUT + '/m1-wizytowki.png' });
  for (const v of ['cards', 'contacts', 'links']) { await m.click('#tabs [data-view=' + v + ']', { timeout: 5000 }); await m.waitForTimeout(150); if (!(await m.locator('#view-' + v + '.active').count())) ok('mobile: nawigacja ' + v, false); }
  ok('mobile: 3 pozycje nawigacji, wszystkie klikalne', (await m.locator('#tabs button').count()) === 3);
  await m.click('#tabs [data-view=contacts]'); await m.waitForTimeout(400); await m.screenshot({ path: OUT + '/m2-kontakty.png' });
  ok('mobile: kontakty bez przewijania poziomego', (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  await m.click('#tabs [data-view=cards]'); await m.click('.tile:has-text("Adam Przykładowy")'); await m.waitForTimeout(500); await m.evaluate(() => window.BNI.setStep(3)); await m.waitForTimeout(300); await m.screenshot({ path: OUT + '/m3-edytor.png' });
  ok('mobile: edytor bez przewijania poziomego', (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

  // widok publiczny wizytówki (cel kodu QR): tylko wizytówka + polecajki, bez zapisu do bazy
  const vctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const v = await vctx.newPage(); const writes = []; const verrs = [];
  v.on('pageerror', e => verrs.push(e.message)); v.on('console', m => { if (/Content Security Policy|violates/i.test(m.text())) verrs.push('CSP: ' + m.text().slice(0, 120)); });
  v.on('request', r => { if (/supabase\.co/.test(r.url()) && r.method() !== 'GET') writes.push(r.method() + ' ' + r.url()); });
  const reqs = []; v.on('request', r => { if (/supabase\.co/.test(r.url())) reqs.push(r.url()); });
  await v.goto(base + '#c=demo-adam'); await v.waitForSelector('.v-hero h1', { timeout: 15000 });
  ok('widok QR: pokazuje wizytówkę', /Adam/i.test(await v.textContent('.v-hero h1')));
  ok('widok QR: bez powłoki aplikacji (menu/nawigacja ukryte)', !(await v.isVisible('.rail')) && !(await v.isVisible('#tabs')));
  ok('widok QR: polecajki (TOP 20) widoczne', (await v.locator('.v-list li').count()) >= 20, (await v.locator('.v-list li').count()) + ' pozycji');
  ok('widok QR: 8 pytań 1:1', (await v.locator('.v-sec details').count()) === 8);
  ok('widok QR: przyciski Zadzwoń / Napisz / Zapisz kontakt', (await v.locator('a[href^="tel:"]').count()) >= 1 && (await v.locator('a[href^="mailto:"]').count()) === 1 && (await v.locator('#v-save').count()) === 1);
  ok('widok QR: brak poziomego przewijania', (await v.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  ok('widok QR: tylko odczyt jednej karty i logo, bez zapisu', reqs.length === 2 && reqs.some(u => /bni_cards\?id=eq\.demo-adam/.test(u)) && reqs.some(u => /bni_settings\?id=eq\.logo/.test(u)) && writes.length === 0, reqs.length + ' zapytań, zapisów: ' + writes.length);
  ok('widok QR: logo (domyślnie BNI) i marka Referra', /BNI/.test(await v.textContent('.v-logo')) && /Referra/.test(await v.textContent('.v-foot')));
  await v.screenshot({ path: OUT + '/07-widok-qr.png', fullPage: true });
  const vc = await v.evaluate(() => window.BNIViewer.vcard({ name: 'Jan Test', phone: '+48 600 000 001', email: 'jan@example.com', company: 'Firma' }));
  ok('widok QR: poprawna wizytówka vCard', /BEGIN:VCARD/.test(vc) && /TEL;TYPE=CELL:\+48600000001/.test(vc) && /EMAIL:jan@example\.com/.test(vc));
  await v.goto(base + '#c=' + encodeURIComponent('"><img src=x onerror=window.__x=1>')); await v.waitForFunction(() => /Nie znaleziono/.test(document.querySelector('#viewer').textContent), null, { timeout: 8000 }).catch(() => {});
  ok('widok QR: nieprawidłowy id → komunikat, brak kodu', /Nie znaleziono/.test(await v.textContent('#viewer')) && (await v.evaluate(() => window.__x)) === undefined);
  await v.goto(base + '#c=nie-ma-takiej'); await v.waitForFunction(() => /Nie znaleziono/.test(document.querySelector('#viewer').textContent), null, { timeout: 8000 }).catch(() => {});
  ok('widok QR: nieistniejąca karta → komunikat', /Nie znaleziono/.test(await v.textContent('#viewer')));
  ok('widok QR: brak błędów JS/CSP', verrs.length === 0, verrs.join(' | '));
  // prowadzenie: następny krok, prowadzony edytor w 5 krokach, krótkie listy
  await p.evaluate(() => window.BNI.show('cards')); await p.waitForTimeout(300);
  ok('nawigacja: 3 pozycje zamiast 6', (await p.locator('#tabs button').count()) === 3);
  ok('start: jedna sugestia „Następny krok”', (await p.locator('#next-step .next').count()) === 1 && (await p.locator('#next-go').count()) === 1);
  await p.click('.tile:has-text("Adam Przykładowy")'); await p.evaluate(() => window.BNI.setStep(3)); await p.waitForTimeout(300);
  const rows5 = await p.locator('#tbl-offered tr[data-i]').count();
  ok('lista „Polecam”: tylko 5 wierszy naraz', rows5 === 5 && (await p.locator('[data-rows-more=offered]').count()) === 1, rows5 + ' wierszy');
  await p.click('[data-rows-more=offered]'); await p.waitForTimeout(150);
  ok('lista „Polecam”: „Pokaż kolejne” dodaje 5', (await p.locator('#tbl-offered tr[data-i]').count()) === 10);
  await p.evaluate(() => window.BNI.show('cards')); await p.click('#btn-new'); await p.waitForSelector('#stepper .step-count');
  ok('edytor: „Krok 1 z 5” i jeden przycisk Dalej', /Krok 1 z 5/.test(await p.textContent('#stepper')) && (await p.locator('#step-next').isVisible()) && !(await p.locator('#step-back').isVisible()));
  const ctl1 = await p.evaluate(() => [...document.querySelectorAll('#editor input,#editor textarea,#editor select,#editor button,#editor summary')].filter(e => e.offsetParent !== null && !(e.tagName !== 'SUMMARY' && e.closest('details:not([open])'))).length);
  ok('edytor: krok 1 ma ≤ 8 widocznych kontrolek (było 230 w całym edytorze)', ctl1 <= 8, ctl1 + ' kontrolek');
  await p.fill('[data-f=name]', 'Test Krok'); await p.click('#step-next');
  ok('edytor: krok 2 (8 pytań, bez edycji treści pytań)', /Krok 2 z 5/.test(await p.textContent('#stepper')) && (await p.locator('#qa textarea:visible').count()) === 8 && (await p.locator('#qa input:visible').count()) === 0);
  await p.click('#step-next'); await p.click('#step-next'); await p.click('#step-next');
  ok('edytor: krok 5 „Gotowe”: jedna akcja główna i podsumowanie', /Krok 5 z 5/.test(await p.textContent('#stepper')) && (await p.locator('#btn-to-preview').isVisible()) && (await p.locator('.done-row').count()) === 4);
  await p.click('#btn-to-preview'); await p.waitForSelector('.cover');
  ok('podgląd: link „Wróć do edycji”', await p.locator('#view-preview .back').isVisible() && (await p.locator('#tabs button.active').getAttribute('data-view')) === 'cards');
  await p.click('#view-preview .back'); await p.waitForTimeout(200);
  ok('powrót do edycji zachowuje krok', /Krok 5 z 5/.test(await p.textContent('#stepper')));
  await p.evaluate(() => { window.BNI.setStep(5); document.querySelector('#btn-del').click(); }); await p.waitForTimeout(600);

  // logo konfigurowalne: domyślnie BNI jak we wzorze, znak Referra, edycja tekstem i obrazem
  await p.evaluate(() => window.BNI.show('preview')); await p.waitForSelector('.qr svg');
  ok('logo: domyślnie BNI na okładce (jak we wzorze)', /BNI/.test(await p.textContent('.cover .logo')));
  ok('logo: mały znak Referra na okładce', /Referra/i.test(await p.textContent('.cover .cv-ref')));
  ok('marka: Referra w menu i tytule', /Referra/.test(await p.textContent('.brand-word')) && /Referra/.test(await p.title()));
  await p.click('#tabs [data-view=cards]'); await p.evaluate(() => document.querySelector('#btn-logo').click()); await p.waitForSelector('#logo-dialog[open]');
  await p.fill('#lg-text', 'ACME'); await p.click('#lg-form button[value=save]'); await p.waitForTimeout(400);
  await p.evaluate(() => window.BNI.show('preview')); await p.waitForSelector('.cover .logo');
  ok('logo: zmiana tekstu widoczna na okładce', /ACME/.test(await p.textContent('.cover .logo')));
  await p.click('#tabs [data-view=cards]'); await p.evaluate(() => document.querySelector('#btn-logo').click()); await p.waitForSelector('#logo-dialog[open]');
  await p.click('#lg-form .lg-seg button[data-mode=image]');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('#lg-file', { name: 'logo.png', mimeType: 'image/png', buffer: png }); await p.waitForTimeout(300);
  await p.click('#lg-form button[value=save]'); await p.evaluate(() => window.BNI.show('preview')); await p.waitForSelector('.cover .logo');
  ok('logo: wgrany obraz na okładce', (await p.locator('.cover .logo-img').count()) === 1 && /^data:image\/png/.test(await p.getAttribute('.cover .logo-img', 'src')));
  await p.click('#tabs [data-view=cards]'); await p.evaluate(() => document.querySelector('#btn-logo').click()); await p.waitForSelector('#logo-dialog[open]');
  await p.setInputFiles('#lg-file', { name: 'zly.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>window.__svg=1</script></svg>') }); await p.waitForTimeout(300);
  ok('logo: SVG ze skryptem odrzucony', (await p.evaluate(() => window.BNI.getLogo().image)).includes('data:image/png') && (await p.evaluate(() => window.__svg)) === undefined);
  await p.click('#lg-reset'); await p.click('#lg-form button[value=save]'); await p.evaluate(() => window.BNI.show('preview')); await p.waitForSelector('.cover .logo');
  ok('logo: przywrócenie BNI', /BNI/.test(await p.textContent('.cover .logo')) && (await p.locator('.cover .logo-img').count()) === 0);
  await p.waitForTimeout(1500);
  // XSS przez id (zatruta karta importowana jako JSON)
  await p.setInputFiles('#file-import', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ cards: [{ id: '"><img src=x onerror=window.__xss=1>', name: 'X', accent: 'red;background:url(//e)', qa: [], offered: [], sought: [] }], links: [{ id: 'a"b', from: 'x', to: 'y' }] })) });
  await p.click('#tabs [data-view=cards]'); await p.waitForTimeout(500);
  ok('XSS: zatrute id nie wykonuje kodu', (await p.evaluate(() => window.__xss)) === undefined);
  ok('XSS: kolor akcentu sanityzowany', await p.evaluate(() => !JSON.stringify(window.BNI.state.cards).includes('url(//e)')));
  // sprzątanie: usuń kartę testową z lokalnego stanu i (przez synchronizację) z bazy
  await p.evaluate(() => { window.BNI.state.cards = window.BNI.state.cards.filter(c => c.name !== 'X'); window.BNI.state.links = window.BNI.state.links.filter(l => window.BNI.getCard(l.from) && window.BNI.getCard(l.to)); window.BNI.save(); });
  await p.waitForTimeout(2500);
  ok('brak błędów JS', errs.length === 0, errs.join(' | '));
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - fails}/${results.length} PASS`);
  await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('E2E crash:', String(e).slice(0, 400), '| błędy JS:', typeof errs !== 'undefined' ? errs : ''); srv.close(); process.exit(2); });
