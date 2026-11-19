// Audyt przeciążenia: liczy, ile bodźców widzi użytkownik na każdym ekranie.
// Uruchom: NODE_PATH=$(npm root -g) node tests/audit.js [plik-wyjsciowy.json]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(__dirname, 'audit.json');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => {
  const f = path.join(root, q.url.split('?')[0].split('#')[0].replace(/^\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('content-type', types[path.extname(f)] || 'text/plain'); r.end(d); });
}).listen(0);

// logika liczenia wykonywana w przeglądarce
const MEASURE = () => {
  const vis = e => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; let p = e.parentElement; while (p) { if (p !== document.body && +getComputedStyle(p).opacity === 0) return false; if (p.tagName === 'DETAILS' && !p.open && e.tagName !== 'SUMMARY' && !(e.parentElement === p && e.tagName === 'SUMMARY')) { const s = p.querySelector(':scope > summary'); if (!s || !s.contains(e)) return false; } p = p.parentElement; } return true; };
  const root = document.body.classList.contains('viewer-mode') ? document.querySelector('#viewer') : document.querySelector('main');
  const inter = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[tabindex="0"]')].filter(e => vis(e) && !e.closest('dialog:not([open])'));
  const inNav = inter.filter(e => e.closest('.rail'));
  const inMain = inter.filter(e => !e.closest('.rail'));
  const texts = [...document.querySelectorAll('*')].filter(e => vis(e) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1));
  const styles = new Set(texts.map(e => { const c = getComputedStyle(e); return [c.fontFamily.split(',')[0], c.fontSize, c.fontWeight, c.textTransform, c.letterSpacing, c.fontStyle].join('|'); }));
  const caps = texts.filter(e => getComputedStyle(e).textTransform === 'uppercase').length;
  const lines = [...document.querySelectorAll('main *,#viewer *')].filter(e => { if (!vis(e)) return false; const c = getComputedStyle(e); return ['Top', 'Right', 'Bottom', 'Left'].some(s => parseFloat(c['border' + s + 'Width']) > 0 && c['border' + s + 'Style'] !== 'none'); }).length;
  const helpers = [...document.querySelectorAll('.hint,.sub,.v-kicker')].filter(vis).map(e => e.textContent.trim().length);
  const small = inter.filter(e => { const r = e.getBoundingClientRect(); return r.height < 40 && !(e.tagName === 'INPUT' && e.type === 'checkbox'); }).length;
  return { interactiveMain: inMain.length, interactiveNav: inNav.length, textStyles: styles.size, upperCaseTexts: caps, borderedElements: lines, longestHelper: helpers.length ? Math.max(...helpers) : 0, smallTargets: small, pageHeightScreens: +(document.documentElement.scrollHeight / innerHeight).toFixed(1) };
};

(async () => {
  const b = await chromium.launch(); const _nc = b.newContext.bind(b); b.newContext = async o => { const c = await _nc(o); await c.addInitScript(() => { try { localStorage.setItem('bni-onboarded', '1'); localStorage.setItem('bni-my-card', 'demo-adam'); } catch (e) {} }); return c; }; const base = 'http://localhost:' + srv.address().port + '/index.html';
  const res = {};
  for (const [vp, dims] of [['telefon 390', { width: 390, height: 844 }], ['komputer 1440', { width: 1440, height: 900 }]]) {
    const ctx = await b.newContext({ viewport: dims, deviceScaleFactor: 1, isMobile: dims.width < 600, hasTouch: dims.width < 600 });
    const p = await ctx.newPage(); p.on('dialog', d => d.accept());
    await p.goto(base); await p.waitForFunction(() => document.querySelector('#sync') && document.querySelector('#sync').textContent.trim().length > 0, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(600);
    const go = async v => { await p.evaluate(x => window.BNI.show(x), v); await p.waitForTimeout(350); };
    const views = {};
    await go('cards'); views['Wizytówki (lista)'] = await p.evaluate(MEASURE);
    await go('contacts'); views['Kontakty'] = await p.evaluate(MEASURE);
    await go('scan'); views['Skan'] = await p.evaluate(MEASURE);
    await p.evaluate(() => { window.BNI.setCurrent('demo-adam'); }); await go('editor'); await p.waitForTimeout(400);
    const hasSteps = await p.evaluate(() => typeof window.BNI.setStep === 'function');
    if (hasSteps) { for (const n of [1, 3, 5]) { await p.evaluate(x => window.BNI.setStep(x), n); await p.waitForTimeout(250); views['Edytor, krok ' + n] = await p.evaluate(MEASURE); } }
    else views['Edytor'] = await p.evaluate(MEASURE);
    await go('preview'); await p.waitForSelector('.qr svg', { timeout: 8000 }).catch(() => {}); views['Druk / podgląd'] = await p.evaluate(MEASURE);
    await go('links'); views['Sieć'] = await p.evaluate(MEASURE);
    const vctx = await b.newContext({ viewport: dims, isMobile: dims.width < 600, hasTouch: dims.width < 600 }); const v = await vctx.newPage();
    await v.goto(base + '#c=demo-adam'); await v.waitForSelector('.v-hero h1', { timeout: 15000 }).catch(() => {}); await v.waitForTimeout(300);
    views['Strona z QR (publiczna)'] = await v.evaluate(MEASURE);
    res[vp] = views; await ctx.close(); await vctx.close();
  }
  fs.writeFileSync(OUT, JSON.stringify(res, null, 2));
  for (const vp of Object.keys(res)) {
    console.log('\n== ' + vp + ' ==');
    console.log('ekran'.padEnd(26) + 'klik.(treść)'.padEnd(14) + 'klik.(menu)'.padEnd(13) + 'style tekstu'.padEnd(14) + 'WERSALIKI'.padEnd(11) + 'ramki/linie'.padEnd(13) + 'najdł.podp.'.padEnd(12) + 'małe cele'.padEnd(10) + 'wys.(ekr.)');
    for (const [k, m] of Object.entries(res[vp])) console.log(k.padEnd(26) + String(m.interactiveMain).padEnd(14) + String(m.interactiveNav).padEnd(13) + String(m.textStyles).padEnd(14) + String(m.upperCaseTexts).padEnd(11) + String(m.borderedElements).padEnd(13) + String(m.longestHelper).padEnd(12) + String(m.smallTargets).padEnd(10) + m.pageHeightScreens);
  }
  await b.close(); srv.close();
})().catch(e => { console.error('audit crash:', e); srv.close(); process.exit(2); });
