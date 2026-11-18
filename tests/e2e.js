// E2E (Playwright, Chromium). Uruchom: NODE_PATH=$(npm root -g) node tests/e2e.js [katalog-na-screenshoty]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, q.url.split('?')[0].split('#')[0].replace(/^\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', types[path.extname(f)] || 'text/plain'); r.end(d); });
}).listen(0);
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); };

process.on('exit', () => {});
(async () => {
  const port = srv.address().port, base = `http://localhost:${port}/index.html`;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  globalThis.errs = []; const errs = globalThis.errs; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await p.goto(base); await p.waitForFunction(() => document.querySelector('#sync').textContent.trim().length > 0, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(500);
  ok('sync z bazą', /OK|zapisano/.test(await p.textContent('#sync')), await p.textContent('#sync'));
  await p.screenshot({ path: OUT + '/01-wizytowki.png' });

  // magazyn
  await p.click('#tabs [data-view=contacts]');
  if (await p.locator('.ct').count() < 30) { await p.click('#ct-demo'); await p.waitForTimeout(800); }
  const n = await p.locator('.ct').count(); ok('magazyn: kontakty widoczne', n >= 30, n + ' kontaktów');
  await p.fill('#ct-search', 'Alfa'); const f = await p.locator('.ct').count(); ok('magazyn: wyszukiwanie filtruje', f > 0 && f < n, f + ' wyników');
  await p.fill('#ct-search', ''); await p.screenshot({ path: OUT + '/02-kontakty.png' });

  // edytor + przeciąganie
  await p.click('#tabs [data-view=cards]'); await p.click('.tile >> nth=0'); await p.waitForSelector('#ct-tray .tc');
  ok('tacka widoczna w edytorze', await p.isVisible('#ct-tray'));
  const before = await p.inputValue('#tbl-offered tr[data-i="2"] input[data-k="name"]');
  const names = (await p.locator('#ct-tray .tc-main b').allTextContents()).map(x => x.trim());
  const pick = names.findIndex(x => x !== before); const cname = names[pick];
  await p.locator('#tbl-offered').scrollIntoViewIfNeeded();
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
  const a0 = await p.inputValue('#tbl-offered tr[data-i="0"] input[data-k="name"]');
  const g = await p.locator('#tbl-offered tr[data-i="0"] .grip').boundingBox(), t = await p.locator('#tbl-offered tr[data-i="3"]').boundingBox();
  await p.mouse.move(g.x + 8, g.y + g.height / 2); await p.mouse.down(); await p.mouse.move(g.x + 20, g.y + 30, { steps: 3 }); await p.mouse.move(t.x + 80, t.y + t.height / 2, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(300);
  ok('zmiana kolejności wierszy', (await p.inputValue('#tbl-offered tr[data-i="3"] input[data-k="name"]')) === a0);
  await p.click('#snack button'); await p.waitForTimeout(300);
  ok('cofnij kolejność', (await p.inputValue('#tbl-offered tr[data-i="0"] input[data-k="name"]')) === a0);

  // przycisk +O na świeżej karcie (dostępność bez myszy)
  await p.screenshot({ path: OUT + '/04-edytor.png', fullPage: false });
  await p.click('#tabs [data-view=cards]'); await p.click('#btn-new'); await p.waitForSelector('#ct-tray .tc');
  const first = (await p.locator('#ct-tray .tc-main b').first().textContent()).trim();
  await p.locator('#ct-tray .tc [data-add=offered]').first().click(); await p.waitForTimeout(300);
  ok('przycisk +O dodaje kontakt do TOP 20', (await p.inputValue('#tbl-offered tr[data-i="0"] input[data-k="name"]')) === first, first);
  await p.locator('#ct-tray .tc [data-add=sought]').nth(1).click(); await p.waitForTimeout(300);
  ok('przycisk +S dodaje kontakt do poszukiwanych', (await p.inputValue('#tbl-sought tr[data-i="0"] input[data-k="name"]')).length > 0);
  await p.click('#btn-del'); await p.waitForTimeout(500);
  await p.click('#tabs [data-view=cards]'); await p.click('.tile >> nth=0'); await p.waitForSelector('#ct-tray .tc');

  // paleta
  await p.keyboard.press('Control+k'); await p.fill('#pal-input', 'kontakty'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('paleta poleceń otwiera widok', await p.locator('#view-contacts.active').count() === 1);

  // skan
  await p.click('#tabs [data-view=scan]'); await p.waitForTimeout(300);
  ok('skan: moduł zamontowany', (await p.locator('#scan-root *').count()) > 5);
  const parsed = await p.evaluate(() => window.BNIScan.parseCardText('Jan Przykładowy\nDyrektor Handlowy\nAlfa Budowa Sp. z o.o.\ntel. +48 600 000 123\njan@example.com\nwww.example.com\nul. Testowa 1, 40-001 Katowice'));
  ok('skan: parser wyciąga e-mail/tel/firmę', /jan@example.com/.test(JSON.stringify(parsed)) && /600 000 123|600000123/.test(JSON.stringify(parsed)) && /Alfa Budowa/.test(JSON.stringify(parsed)), JSON.stringify(parsed).slice(0, 140));
  await p.screenshot({ path: OUT + '/05-skan.png' });
  await p.click('#tabs [data-view=preview]'); await p.waitForSelector('.qr svg'); await p.screenshot({ path: OUT + '/06-druk.png' });

  // mobile
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })).newPage();
  m.on('pageerror', e => errs.push('mobile: ' + e.message));
  await m.goto(base); await m.waitForTimeout(2000);
  const navBox = await m.locator('.rail').boundingBox();
  ok('mobile: dolna nawigacja', navBox.y > 700 && navBox.width >= 385, JSON.stringify(navBox));
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok('mobile: brak poziomego przewijania', overflow <= 1, 'nadmiar ' + overflow + 'px');
  await m.screenshot({ path: OUT + '/m1-wizytowki.png' });
  await m.click('#tabs [data-view=contacts]'); await m.waitForTimeout(400); await m.screenshot({ path: OUT + '/m2-kontakty.png' });
  ok('mobile: kontakty bez przewijania poziomego', (await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);
  await m.click('#tabs [data-view=cards]'); await m.click('.tile >> nth=0'); await m.waitForTimeout(500); await m.screenshot({ path: OUT + '/m3-edytor.png' });
  ok('mobile: edytor bez przewijania poziomego', (await m.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 1);

  ok('brak błędów JS', errs.length === 0, errs.join(' | '));
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log(`\n${results.length - fails}/${results.length} PASS`);
  await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error('E2E crash:', String(e).slice(0, 400), '| błędy JS:', typeof errs !== 'undefined' ? errs : ''); srv.close(); process.exit(2); });
