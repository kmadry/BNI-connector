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
  const AH = require('./auth-helper.js'); const CR = AH.creds(); const SA = await AH.signIn(CR.a), SB = await AH.signIn(CR.b);
  const _nc = b.newContext.bind(b); b.rawContext = _nc; // bez sesji (niezalogowany)
  b.authContextAs = async (sess, o, flags) => { const c = await _nc(o); await AH.inject(c, sess, flags || { onboarded: true }); return c; };
  b.newContext = async o => b.authContextAs(SA, o, { onboarded: true });   // zalogowany A, po onboardingu
  b.authContext = async (o, flags) => b.authContextAs(SA, o, flags);       // zalogowany A, z własnymi flagami
  // dane startowe konta A: przykłady, główna wizytówka Adama udostępniona (QR), Jan prywatny
  const sc = await b.newContext({ viewport: { width: 1000, height: 800 } }); const sp0 = await sc.newPage(); sp0.on('dialog', d => d.accept());
  await sp0.goto(base); await sp0.waitForFunction(() => document.querySelector('#sync') && /OK|zapisano/.test(document.querySelector('#sync').textContent), null, { timeout: 15000 }).catch(() => {});
  if (!(await sp0.evaluate(() => window.BNI.idOf('Adam Przykładowy')))) { await sp0.evaluate(() => document.querySelector('#btn-demo').click()); await sp0.waitForTimeout(3500); }
  await sp0.evaluate(() => { const B = window.BNI; B.getCard(B.idOf('Adam Przykładowy')).shared = true; B.getCard(B.idOf('Adam Przykładowy')).showLists = true; B.getCard(B.idOf('Jan Kowalski')).shared = false; B.save(); });
  await sp0.waitForTimeout(2500);
  const ADAM = await sp0.evaluate(() => window.BNI.idOf('Adam Przykładowy')), JAN = await sp0.evaluate(() => window.BNI.idOf('Jan Kowalski')); await sc.close();
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
  await p.click('#tabs [data-view=cards]'); await p.evaluate(() => window.BNI.openEditor(window.BNI.idOf('Adam Przykładowy'))); await p.evaluate(() => window.BNI.setStep(3)); await p.waitForSelector('#ct-tray .tc');
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
  await p.click('#tabs [data-view=cards]'); await p.evaluate(() => window.BNI.openEditor(window.BNI.idOf('Adam Przykładowy'))); await p.evaluate(() => window.BNI.setStep(3)); await p.waitForSelector('#ct-tray .tc');

  // paleta
  await p.keyboard.press('Control+k'); await p.fill('#pal-input', 'kontakty'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  ok('paleta poleceń otwiera widok', await p.locator('#view-contacts.active').count() === 1, JSON.stringify(await p.evaluate(() => ({ active: [...document.querySelectorAll('.view.active')].map(v => v.id), items: [...document.querySelectorAll('#pal-list li')].map(l => l.textContent.trim()), pal: document.querySelector('#palette').open, step: window.BNI.getStep() }))));

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
  ok('mobile: 3 pozycje nawigacji, wszystkie klikalne', (await m.locator('#tabs button:visible').count()) === 3);
  await m.click('#tabs [data-view=contacts]'); await m.waitForTimeout(400); await m.screenshot({ path: OUT + '/m2-kontakty.png' });
  ok('mobile: kontakty bez przewijania poziomego', (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  await m.click('#tabs [data-view=cards]'); await m.evaluate(() => window.BNI.openEditor(window.BNI.idOf('Adam Przykładowy'))); await m.waitForTimeout(500); await m.evaluate(() => window.BNI.setStep(3)); await m.waitForTimeout(300); await m.screenshot({ path: OUT + '/m3-edytor.png' });
  ok('mobile: edytor bez przewijania poziomego', (await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);

  // zabezpieczenie synchronizacji: niepełny stan jednego okna nie może skasować bazy
  const gx = await b.newContext({ viewport: { width: 1000, height: 800 } }); const gp = await gx.newPage(); gp.on('dialog', d => d.accept());
  await gp.goto(base); await gp.waitForFunction(() => document.querySelector('#sync') && /OK|zapisano/.test(document.querySelector('#sync').textContent), null, { timeout: 15000 }).catch(() => {}); await gp.waitForTimeout(500);
  const remoteCount = () => gp.evaluate(async () => { const C = window.BNI_CONFIG; const r = await fetch(C.url + '/rest/v1/bni_cards?select=id', { headers: { apikey: C.key, Authorization: 'Bearer ' + window.BNIAuth.token() } }); return (await r.json()).length; });
  const cntBefore = await remoteCount();
  await gp.evaluate(() => { window.BNI.state.cards = []; window.BNI.state.links = []; window.BNI.save(); }); await gp.waitForTimeout(3000);
  const cntAfter = await remoteCount();
  ok('synchronizacja: wyczyszczenie stanu w jednym oknie NIE kasuje bazy', cntBefore >= 3 && cntAfter === cntBefore, cntBefore + ' → ' + cntAfter);
  ok('synchronizacja: użytkownik widzi komunikat o zatrzymaniu', /zatrzymano/.test(await gp.textContent('#sync')));
  if (cntAfter < cntBefore) { await gp.reload(); await gp.waitForTimeout(1500); await gp.evaluate(() => document.querySelector('#btn-demo').click()); await gp.waitForTimeout(3000); }
  await gx.close();

  // onboarding i ekran startowy z główną wizytówką i kodem QR
  const ob = await b.authContext({ viewport: { width: 1280, height: 800 } }, { onboarded: false }); const op = await ob.newPage(); op.on('pageerror', e => errs.push('onboarding: ' + e.message)); op.on('dialog', d => d.accept());
  await op.goto(base); await op.waitForSelector('#view-welcome.active', { timeout: 10000 });
  ok('onboarding: pierwsze uruchomienie pokazuje powitanie bez menu', !(await op.locator('.rail').isVisible()) && (await op.locator('#wl-start').isVisible()));
  ok('onboarding: ekran powitalny ma jedną akcję główną i „Pomiń”', (await op.locator('#view-welcome button:visible').count()) === 2);
  await op.click('#wl-start'); await op.waitForSelector('#wl-2:not([hidden])');
  ok('onboarding: „Dalej” czeka na imię', await op.locator('#wl-next').isDisabled());
  await op.fill('#wl-name', 'Test Onboarding'); await op.fill('#wl-phone', '+48 600 000 999'); await op.fill('#wl-email', 'onb@example.com');
  ok('onboarding: zgoda na udostępnienie jest jawna (pole z opisem, co będzie publiczne)', /publicznie/.test(await op.textContent('.wl-share')));
  await op.click('#wl-next'); await op.waitForSelector('#view-cards.active #mine .mine-card');
  ok('start: główna wizytówka z danymi z onboardingu', /Test/i.test(await op.textContent('#mine .mine-card .nm')) && /onb@example.com/.test(await op.textContent('#mine .mine-card')));
  await op.waitForSelector('#mine-qr svg', { timeout: 8000 });
  ok('start: duży kod QR do podzielenia się', (await op.locator('#mine-qr svg').count()) === 1 && (await op.locator('#mine-qr').boundingBox()).width >= 160);
  ok('start: akcje: pełny ekran QR, udostępnij, edytuj', (await op.locator('#mine [data-qr-id]').isVisible()) && (await op.locator('#mine-share').isVisible()) && (await op.locator('#mine [data-edit-mine]').isVisible()));
  await op.click('#mine [data-qr-id]'); await op.waitForSelector('#qr-modal[open]');
  ok('start: „Pokaż kod QR” otwiera duży kod z linkiem do wizytówki', /#c=/.test(await op.textContent('#qr-url')));
  await op.click('#qr-close'); await op.reload(); await op.waitForTimeout(1800);
  ok('onboarding: po odświeżeniu nie wraca, wizytówka główna zostaje', (await op.locator('#view-welcome.active').count()) === 0 && (await op.locator('#mine .mine-card').count()) === 1);
  await op.evaluate(() => { const B = window.BNI; B.state.cards = B.state.cards.filter(c => c.name !== 'Test Onboarding'); B.save(); }); await op.waitForTimeout(2500);
  await ob.close();
  const sk = await b.authContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { onboarded: false }); const sp = await sk.newPage(); sp.on('dialog', d => d.accept());
  await sp.goto(base); await sp.waitForSelector('#view-welcome.active'); await sp.click('#wl-skip'); await sp.waitForSelector('#view-cards.active');
  ok('onboarding: „Pomiń” prowadzi na start z zaproszeniem do utworzenia wizytówki', (await sp.locator('#mine .mine-empty').count()) === 1 && (await sp.locator('#mine-create').isVisible()));
  ok('onboarding: telefon bez poziomego przewijania', (await sp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  await sp.screenshot({ path: OUT + '/o2-pomin-telefon.png' }); await sk.close();
  const hx = await b.authContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, { onboarded: true, mine: ADAM });
  const hp = await hx.newPage(); hp.on('dialog', d => d.accept()); await hp.goto(base); await hp.waitForSelector('#mine-qr svg', { timeout: 12000 }); await hp.waitForTimeout(400);
  ok('start (telefon): wizytówka i QR bez poziomego przewijania', (await hp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  ok('start (telefon): lista pozostałych wizytówek schowana', !(await hp.locator('#all-cards').evaluate(d => d.open)));
  await hp.screenshot({ path: OUT + '/o1-start-telefon.png' }); await hx.close();

  // Komfort: panel ustawień sensorycznych (osobny kontekst, żeby nie zmieniać pozostałych testów)
  const cx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const c = await cx.newPage(); c.on('pageerror', e => errs.push('komfort: ' + e.message)); c.on('dialog', d => d.accept());
  await c.goto(base); await c.waitForFunction(() => document.querySelector('#sync') && document.querySelector('#sync').textContent.trim().length > 0, null, { timeout: 15000 }).catch(() => {}); await c.waitForTimeout(500);
  await c.evaluate(() => window.BNI.show('cards'));
  const D = () => c.evaluate(() => Object.assign({}, document.documentElement.dataset));
  const css = v => c.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
  const dx = () => c.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('komfort: domyślnie Prosty, brak animacji, łagodny kontrast', (await D()).detail === 'simple' && (await D()).motion === 'off' && (await D()).contrast === 'soft' && (await c.evaluate(() => getComputedStyle(document.querySelector('button')).transitionDuration)) === '0s');
  await c.click('#btn-theme'); await c.waitForSelector('#comfort-dialog[open]');
  ok('komfort: panel ma 8 ustawień w 3 grupach', (await c.locator('#comfort-dialog .cf-row').count()) === 8 && (await c.locator('#comfort-dialog .cf-group').count()) === 3);
  await c.click('#comfort-dialog [data-k=text][data-v="150"]');
  ok('komfort: tekst 150% bez poziomego przewijania (komputer)', (await D()).text === '150' && (await dx()) <= 1);
  await c.click('#comfort-dialog [data-k=contrast][data-v=high]');
  ok('komfort: kontrast wysoki (czysta czerń na bieli)', (await css('--text')) === '#000' && (await css('--paper')) === '#fff');
  await c.click('#comfort-dialog [data-k=contrast][data-v=soft]'); await c.click('#comfort-dialog [data-k=theme][data-v=evening]');
  ok('komfort: motyw wieczorny (ciepłe tło, bez czystej czerni)', (await D()).theme === 'evening' && (await c.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(28, 23, 17)');
  await c.click('#comfort-dialog [data-k=caps][data-v=off]');
  await c.evaluate(() => window.BNI.show('preview')); await c.waitForSelector('.panel h3', { timeout: 8000 });
  const capsApp = await c.evaluate(() => getComputedStyle(document.querySelector('.rail .brand-name')).textTransform);
  const capsCard = await c.evaluate(() => getComputedStyle(document.querySelector('.panel h3')).textTransform);
  ok('komfort: bez wersalików w aplikacji, panele wizytówki bez zmian', capsApp === 'none' && capsCard === 'uppercase', capsApp + ' / ' + capsCard);
  await c.click('#comfort-dialog [data-k=font][data-v=readable]');
  await c.evaluate(() => document.fonts.load("16px 'Atkinson Hyperlegible'")); await c.waitForTimeout(300);
  ok('komfort: czcionka czytelna (Atkinson Hyperlegible załadowana)', (await c.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('Atkinson') && (await c.evaluate(() => document.fonts.check("16px 'Atkinson Hyperlegible'"))));
  await c.click('#comfort-dialog [data-k=density][data-v=standard]');
  ok('komfort: odstępy Standard zmieniają układ', (await D()).density === 'standard');
  await c.click('#comfort-dialog [data-k=detail][data-v=full]');
  ok('komfort: poziom Pełny pokazuje 6 zakładek', (await c.locator('#tabs button:visible').count()) === 6);
  await c.click('#comfort-dialog [data-k=motion][data-v=on]');
  ok('komfort: animacje można włączyć', (await D()).motion === 'on');
  await c.click('#cf-close'); await c.reload(); await c.waitForTimeout(1500);
  const kept = await D();
  ok('komfort: ustawienia zostają po odświeżeniu', kept.text === '150' && kept.theme === 'evening' && kept.font === 'readable' && kept.caps === 'off' && kept.detail === 'full');
  await c.evaluate(() => window.BNI.show('cards')); await c.click('#btn-theme'); await c.waitForSelector('#comfort-dialog[open]'); await c.click('#cf-reset');
  const rst = await D();
  ok('komfort: „Przywróć domyślne” przywraca wszystko', rst.text === '100' && rst.theme === undefined && rst.font === 'plex' && rst.caps === 'on' && rst.detail === 'simple' && rst.motion === 'off' && rst.contrast === 'soft' && rst.density === 'spacious');
  await cx.close();
  // tekst 150% na telefonie: żaden widok nie może się rozjechać poziomo
  const mx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); const mm = await mx.newPage(); mm.on('pageerror', e => errs.push('komfort mobile: ' + e.message)); mm.on('dialog', d => d.accept());
  await mm.goto(base); await mm.waitForTimeout(2000); await mm.evaluate(() => window.BNIComfort.set('text', '150')); await mm.waitForTimeout(300);
  const over = [];
  for (const [v, st] of [['cards'], ['contacts'], ['links'], ['editor', 1], ['editor', 3], ['editor', 5], ['preview']]) {
    await mm.evaluate(([vv, ss]) => { window.BNI.setCurrent(window.BNI.idOf('Adam Przykładowy')); window.BNI.show(vv); if (ss) window.BNI.setStep(ss); }, [v, st]); await mm.waitForTimeout(350);
    const d = await mm.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); if (d > 1) over.push(v + (st ? ':' + st : '') + '=' + d + 'px');
  }
  ok('komfort: tekst 150% na telefonie bez poziomego przewijania (7 widoków)', over.length === 0, over.join(', '));
  await mm.screenshot({ path: OUT + '/c1-tekst150-telefon.png' });
  await mm.evaluate(() => window.BNI.show('cards')); await mm.click('#btn-theme'); await mm.waitForSelector('#comfort-dialog[open]');
  const bb = await mm.locator('#comfort-dialog').boundingBox(); const vw = await mm.evaluate(() => innerWidth);
  ok('komfort: panel mieści się na ekranie telefonu przy tekście 150%', bb.x >= -1 && bb.x + bb.width <= vw + 1, JSON.stringify(bb));
  await mm.screenshot({ path: OUT + '/c2-panel-telefon.png' });
  await mx.close();

  // logowanie, rejestracja (walidacja), reset hasła, wylogowanie
  // OCR z własnych plików (bez CDN) pod ścisłym CSP
  const ocx = await b.rawContext({ viewport: { width: 800, height: 600 } }); const ocp = await ocx.newPage(); const ext = []; const cspErr = [];
  ocp.on('request', r => { const u = r.url(); if (!/^(http:\/\/localhost|data:|blob:)/.test(u) && !/supabase\.co/.test(u)) ext.push(u); }); ocp.on('console', m => { if (/Content Security Policy/i.test(m.text())) cspErr.push(m.text().slice(0, 140)); });
  await ocp.goto(base); await ocp.waitForTimeout(500);
  const ocrText = await ocp.evaluate(async () => {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'ocr/tesseract.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    const c = document.createElement('canvas'); c.width = 900; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 900, 160); g.fillStyle = '#000'; g.font = '48px sans-serif'; g.fillText('Jan Przykładowy', 30, 60); g.fillText('jan@example.com', 30, 130);
    const O = new URL('ocr/', location.href).href, w = await window.Tesseract.createWorker('pol+eng', 1, { workerPath: O + 'worker.min.js', corePath: O, langPath: O + 'lang' });
    const r = await w.recognize(c); await w.terminate(); return r.data.text;
  }).catch(e => 'BŁĄD ' + e);
  ok('OCR: rozpoznaje tekst z lokalnych plików', /Przyk/i.test(ocrText) && /example\.com/i.test(ocrText), JSON.stringify(ocrText).slice(0, 80));
  ok('OCR: żadnych zapytań do zewnętrznych serwerów i brak naruszeń CSP', ext.length === 0 && cspErr.length === 0, ext.concat(cspErr).join(' | '));
  await ocx.close();

  // tryb gościa: pierwsza wizyta bez konta trafia od razu na prostą wizytówkę
  const gsx = await b.rawContext({ viewport: { width: 1000, height: 800 } }); const gpg = await gsx.newPage(); gpg.on('pageerror', e => errs.push('gość: ' + e.message));
  await gpg.goto(base); await gpg.waitForSelector('#view-welcome.active', { timeout: 15000 });
  ok('gość: pierwsza wizyta bez logowania pokazuje tworzenie prostej wizytówki', (await gpg.locator('#view-login.active').count()) === 0 && (await gpg.locator('#wl-start').isVisible()));
  await gpg.click('#wl-start'); await gpg.fill('#wl-name', 'Gość Testowy'); await gpg.click('#wl-next'); await gpg.waitForSelector('#view-cards.active #mine .mine-card');
  ok('gość: wizytówka powstaje i zapisuje się w przeglądarce (localStorage)', await gpg.evaluate(() => Object.keys(localStorage).some(k => /^bni-connector-v3:/.test(k) && /Gość Testowy/.test(localStorage.getItem(k)))));
  await gpg.waitForSelector('#mine-qr svg', { timeout: 10000 });
  ok('gość: kod QR działa bez konta', (await gpg.locator('#mine-qr svg').count()) === 1);
  await gpg.evaluate(() => window.BNI.show('contacts')); await gpg.waitForTimeout(300);
  ok('gość: Kontakty wymagają konta (bramka z przyciskiem założenia konta)', (await gpg.locator('#view-gate.active').count()) === 1 && (await gpg.locator('#gate-up').isVisible()));
  await gpg.click('#gate-up'); await gpg.waitForSelector('#account-dialog[open]');
  ok('gość: okno konta oferuje e-mail i hasło (bez wylogowania)', (await gpg.locator('#ac-up').isVisible()) && !(await gpg.locator('#ac-logout').isVisible()));
  await gpg.fill('#ac-upmail', 'zly'); await gpg.fill('#ac-uppass', 'krotkie'); await gpg.click('#ac-up button[type=submit]');
  ok('gość: założenie konta waliduje e-mail i hasło', /poprawny adres/.test(await gpg.textContent('#ac-upmsg')));
  await gsx.close();

  const lx = await b.rawContext({ viewport: { width: 1000, height: 800 } }); await lx.addInitScript(() => { try { localStorage.setItem('bni-returning', '1'); } catch (e) {} }); const lp = await lx.newPage(); lp.on('pageerror', e => errs.push('logowanie: ' + e.message)); lp.on('dialog', d => d.accept());
  await lp.goto(base); await lp.waitForSelector('#view-login.active', { timeout: 10000 });
  ok('logowanie: niezalogowany widzi tylko ekran logowania (bez menu)', !(await lp.locator('.rail').isVisible()) && (await lp.locator('#au-form').isVisible()));
  await lp.fill('#au-email', CR.a.email); await lp.fill('#au-pass', 'zle-haslo-123456'); await lp.click('#au-go'); await lp.waitForSelector('.au-msg.err', { timeout: 10000 });
  ok('logowanie: błędne hasło → czytelny komunikat po polsku', /Nieprawidłowy e-mail lub hasło/.test(await lp.textContent('.au-msg')));
  await lp.click('[data-au=signup]'); await lp.fill('#au-email', 'zly-adres'); await lp.fill('#au-pass', 'krotkie'); await lp.click('#au-go');
  ok('rejestracja: walidacja adresu e-mail', /poprawny adres e-mail/.test(await lp.textContent('.au-msg')));
  await lp.fill('#au-email', 'nikt@example.com'); await lp.fill('#au-pass', 'krotkie'); await lp.click('#au-go');
  ok('rejestracja: hasło krótsze niż 10 znaków odrzucone', /co najmniej 10 znaków/.test(await lp.textContent('.au-msg')));
  await lp.click('[data-au=login]'); await lp.click('[data-au=recover]');
  await lp.fill('#au-email', 'nikt-' + Date.now() + '@example.com'); await lp.click('#au-go'); await lp.waitForFunction(() => /Sprawdź skrzynkę/.test(document.querySelector('#view-login').textContent), null, { timeout: 10000 });
  ok('reset hasła: komunikat nie zdradza, czy konto istnieje', /Jeśli konto .* istnieje/.test(await lp.textContent('#view-login')));
  await lp.click('[data-au=login]'); await lp.fill('#au-email', CR.a.email); await lp.fill('#au-pass', CR.a.password); await lp.click('#au-go');
  await lp.waitForFunction(() => !document.querySelector('#view-login').classList.contains('active'), null, { timeout: 15000 });
  ok('logowanie: poprawne dane wpuszczają do aplikacji', (await lp.evaluate(() => !!window.BNIAuth.user())) && (await lp.locator('#view-login.active').count()) === 0);
  const uidA = await lp.evaluate(() => window.BNIAuth.user().id);
  await lp.evaluate(() => window.BNIAuth.openAccount()); await lp.waitForSelector('#account-dialog[open]');
  ok('konto: okno pokazuje e-mail i akcje (eksport, usunięcie danych, wylogowanie)', /e2e-a@example\.com/.test(await lp.textContent('#ac-mail')) && (await lp.locator('#ac-export, #ac-wipe, #ac-logout').count()) === 3);
  await lp.click('#ac-logout'); await lp.waitForSelector('#view-login.active', { timeout: 10000 });
  ok('wylogowanie: wraca ekran logowania, sesja i dane lokalne usunięte z urządzenia', (await lp.evaluate(u => !localStorage.getItem('bni-auth') && !localStorage.getItem('bni-connector-v3:' + u), uidA)));
  await lx.close();

  // prywatność: izolacja użytkowników (RLS) i dostęp niezalogowanego
  const aRows = (await AH.rest(SA, 'GET', 'bni_cards?select=id,shared')).body, bRows = (await AH.rest(SB, 'GET', 'bni_cards?select=id')).body;
  ok('RLS: użytkownik B nie widzi kart użytkownika A', Array.isArray(bRows) && bRows.length === 0 && Array.isArray(aRows) && aRows.length >= 3, 'A: ' + (aRows || []).length + ', B: ' + (bRows || []).length);
  ok('RLS: B nie zmieni cudzej karty', (await AH.rest(SB, 'PATCH', 'bni_cards?id=eq.' + ADAM, { data: { name: 'HACK' } }, { Prefer: 'return=representation' })).body.length === 0);
  ok('RLS: B nie usunie cudzej karty', (await AH.rest(SB, 'DELETE', 'bni_cards?id=eq.' + ADAM, undefined, { Prefer: 'return=representation' })).body.length === 0 && (await AH.rest(SA, 'GET', 'bni_cards?id=eq.' + ADAM + '&select=id')).body.length === 1);
  ok('RLS: B nie wpisze karty „na konto” A', [401, 403].includes((await AH.rest(SB, 'POST', 'bni_cards', { id: 'hack' + Date.now(), owner: SA.user.id, data: {} })).status));
  const anonRead = await Promise.all(['bni_cards', 'bni_contacts', 'bni_links', 'bni_settings'].map(t => AH.rest(null, 'GET', t + '?select=id')));
  ok('anon (niezalogowany): nie odczyta żadnej tabeli', anonRead.every(r => [401, 403].includes(r.status) || (Array.isArray(r.body) && r.body.length === 0)));
  ok('anon (niezalogowany): nie zapisze do bazy', [401, 403].includes((await AH.rest(null, 'POST', 'bni_cards', { id: 'x' + Date.now(), data: {} })).status));
  ok('publiczna funkcja: prywatna wizytówka jest niedostępna', (await AH.rest(null, 'POST', 'rpc/get_public_card', { p_id: JAN })).body === null);
  const pub = (await AH.rest(null, 'POST', 'rpc/get_public_card', { p_id: ADAM })).body;
  ok('publiczna funkcja: udostępniona wizytówka zwraca dane (z listami)', pub && pub.card && pub.card.name === 'Adam Przykładowy' && Array.isArray(pub.card.offered) && pub.card.offered.length > 0);
  const adamRow = (await AH.rest(SA, 'GET', 'bni_cards?id=eq.' + ADAM + '&select=data')).body[0].data;
  await AH.rest(SA, 'PATCH', 'bni_cards?id=eq.' + ADAM, { data: Object.assign({}, adamRow, { showLists: false }) });
  const pub2 = (await AH.rest(null, 'POST', 'rpc/get_public_card', { p_id: ADAM })).body;
  ok('publiczna funkcja: bez list osób, gdy właściciel je wyłączy', pub2 && pub2.card && !('offered' in pub2.card) && !('sought' in pub2.card));
  await AH.rest(SA, 'PATCH', 'bni_cards?id=eq.' + ADAM, { data: adamRow });

  // zgoda na udostępnienie wizytówki + prywatna karta w podglądzie
  const sh = await b.newContext({ viewport: { width: 1280, height: 900 } }); const shp = await sh.newPage(); shp.on('dialog', d => d.accept()); shp.on('pageerror', e => errs.push('udostępnianie: ' + e.message));
  await shp.goto(base); await shp.waitForFunction(() => document.querySelector('#sync') && /OK|zapisano/.test(document.querySelector('#sync').textContent), null, { timeout: 15000 }).catch(() => {}); await shp.waitForTimeout(500);
  await shp.evaluate(id => { window.BNI.openEditor(id); window.BNI.setStep(5); }, JAN); await shp.waitForSelector('#sh-on');
  ok('prywatność: nowa/nieudostępniona wizytówka jest domyślnie prywatna', !(await shp.locator('#sh-on').isChecked()) && (await shp.locator('#sh-lists').isDisabled()));
  await shp.evaluate(() => window.BNI.show('preview')); await shp.waitForTimeout(600);
  ok('prywatność: podgląd prywatnej wizytówki pokazuje „QR po udostępnieniu”', /po udostępnieniu/.test(await shp.textContent('#sheet .cover .qr')));
  await shp.evaluate(id => { window.BNI.openEditor(id); window.BNI.setStep(5); }, JAN); await shp.waitForSelector('#sh-on');
  await shp.check('#sh-on'); await shp.waitForTimeout(3000);
  ok('udostępnianie: po zgodzie karta jest publiczna', (await AH.rest(null, 'POST', 'rpc/get_public_card', { p_id: JAN })).body !== null);
  await shp.uncheck('#sh-on'); await shp.waitForTimeout(3000);
  ok('udostępnianie: wyłączenie natychmiast zamyka stronę publiczną', (await AH.rest(null, 'POST', 'rpc/get_public_card', { p_id: JAN })).body === null);
  await sh.close();

  // usunięcie wszystkich moich danych (konto B)
  const bx = await b.authContextAs(SB, { viewport: { width: 1000, height: 800 } }, { onboarded: true }); const bp = await bx.newPage(); bp.on('dialog', d => d.accept());
  await bp.goto(base); await bp.waitForFunction(() => document.querySelector('#sync') && /OK|zapisano/.test(document.querySelector('#sync').textContent), null, { timeout: 15000 }).catch(() => {});
  await bp.click('#btn-new'); await bp.fill('[data-f=name]', 'Dane Do Usunięcia'); await bp.waitForTimeout(3000);
  const bBefore = (await AH.rest(SB, 'GET', 'bni_cards?select=id')).body.length;
  await bp.evaluate(() => window.BNI.wipeMyData()); await bp.waitForTimeout(1500);
  const bAfter = (await AH.rest(SB, 'GET', 'bni_cards?select=id')).body.length;
  ok('prywatność: „Usuń wszystkie moje dane” czyści bazę użytkownika', bBefore >= 1 && bAfter === 0, bBefore + ' → ' + bAfter);
  ok('prywatność: dane A nietknięte po usunięciu danych B', (await AH.rest(SA, 'GET', 'bni_cards?select=id')).body.length >= 3);
  await bx.close();

  // PWA: kod QR działa bez internetu
  const px = await b.authContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, { onboarded: true, mine: ADAM }); const pp = await px.newPage(); pp.on('pageerror', e => errs.push('pwa: ' + e.message));
  await pp.goto(base); await pp.waitForSelector('#mine-qr svg', { timeout: 15000 });
  await pp.evaluate(() => navigator.serviceWorker.ready); await pp.reload(); await pp.waitForSelector('#mine-qr svg', { timeout: 15000 }); await pp.waitForTimeout(800);
  const man = await pp.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()));
  ok('PWA: skrót „Mój kod QR” w manifeście', man.shortcuts && man.shortcuts[0] && man.shortcuts[0].url.endsWith('#qr'));
  await px.setOffline(true); await pp.goto(base + '#qr'); await pp.waitForSelector('#qr-screen .qs-qr svg', { timeout: 10000 });
  ok('PWA: pełnoekranowy kod QR otwiera się bez internetu', (await pp.locator('#qr-screen .qs-qr svg').count()) === 1 && /bez internetu/.test(await pp.textContent('#qr-screen')));
  await px.setOffline(false); await px.close();

  // widok publiczny wizytówki (cel kodu QR): tylko wizytówka + polecajki, bez zapisu do bazy
  const vctx = await b.rawContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const v = await vctx.newPage(); const writes = []; const verrs = [];
  v.on('pageerror', e => verrs.push(e.message)); v.on('console', m => { if (/Content Security Policy|violates/i.test(m.text())) verrs.push('CSP: ' + m.text().slice(0, 120)); });
  v.on('request', r => { if (/supabase\.co/.test(r.url()) && r.method() !== 'GET' && !/rpc\/get_public_card/.test(r.url())) writes.push(r.method() + ' ' + r.url()); });
  const reqs = []; v.on('request', r => { if (/supabase\.co/.test(r.url())) reqs.push(r.url()); });
  await v.goto(base + '#c=' + ADAM); await v.waitForSelector('.v-hero h1', { timeout: 15000 });
  ok('widok QR: pokazuje wizytówkę', /Adam/i.test(await v.textContent('.v-hero h1')));
  ok('widok QR: bez powłoki aplikacji (menu/nawigacja ukryte)', !(await v.isVisible('.rail')) && !(await v.isVisible('#tabs')));
  ok('widok QR: polecajki (TOP 20) widoczne', (await v.locator('.v-list li').count()) >= 20, (await v.locator('.v-list li').count()) + ' pozycji');
  ok('widok QR: 8 pytań 1:1', (await v.locator('.v-sec details').count()) === 8);
  ok('widok QR: przyciski Zadzwoń / Napisz / Zapisz kontakt', (await v.locator('a[href^="tel:"]').count()) >= 1 && (await v.locator('a[href^="mailto:"]').count()) === 1 && (await v.locator('#v-save').count()) === 1);
  ok('widok QR: brak poziomego przewijania', (await v.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
  ok('widok QR: jedno publiczne zapytanie (funkcja get_public_card), bez zapisu', reqs.length === 1 && /rpc\/get_public_card/.test(reqs[0]) && writes.length === 0, reqs.length + ' zapytań, zapisów: ' + writes.length);
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
  ok('nawigacja: 3 widoczne pozycje zamiast 6', (await p.locator('#tabs button:visible').count()) === 3);
  ok('start: jedna sugestia „Następny krok”', (await p.locator('#next-step .next').count()) === 1 && (await p.locator('#next-go').count()) === 1);
  await p.evaluate(() => window.BNI.openEditor(window.BNI.idOf('Adam Przykładowy'))); await p.evaluate(() => window.BNI.setStep(3)); await p.waitForTimeout(300);
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
