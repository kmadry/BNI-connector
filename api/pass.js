// GET /api/pass?c=<id>&e=<exp>&s=<podpis> → plik .pkpass (Apple Wallet). Link jest krótkotrwały i podpisany.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { PKPass } = require('passkit-generator');
const { publicCard, cardUrl, sign, send, fail, okId } = require('./_lib/card.js');
const dec = v => Buffer.from(v || '', 'base64');
module.exports = async (req, res) => {
  try {
    const q = new URL(req.url, 'http://x').searchParams, id = q.get('c') || '', exp = +q.get('e'), sig = q.get('s') || '';
    if (!okId(id) || !exp || exp < Date.now() / 1000) return send(res, 410, { error: 'Link wygasł. Wygeneruj go ponownie w aplikacji.' });
    const good = sign(id, exp); if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return send(res, 403, { error: 'Zły podpis.' });
    const c = await publicCard(id); if (!c) return send(res, 404, { error: 'Wizytówka nie jest już udostępniona.' });
    const E = process.env;
    if (!E.APPLE_PASS_TYPE_ID || !E.APPLE_TEAM_ID || !E.APPLE_SIGNER_CERT || !E.APPLE_SIGNER_KEY || !E.APPLE_WWDR) return send(res, 503, { error: 'Karta Apple Wallet nie jest jeszcze skonfigurowana.' });
    const dir = path.join(process.cwd(), 'wallet-assets'), files = {};
    for (const f of fs.readdirSync(dir)) files[f] = fs.readFileSync(path.join(dir, f));
    files['pass.json'] = Buffer.from(JSON.stringify({ formatVersion: 1, passTypeIdentifier: E.APPLE_PASS_TYPE_ID, teamIdentifier: E.APPLE_TEAM_ID, organizationName: 'Referra', description: 'Wizytówka Referra' }));
    const pass = new PKPass(files, { wwdr: dec(E.APPLE_WWDR), signerCert: dec(E.APPLE_SIGNER_CERT), signerKey: dec(E.APPLE_SIGNER_KEY), signerKeyPassphrase: E.APPLE_SIGNER_KEY_PASS || undefined },
      { serialNumber: id, backgroundColor: 'rgb(31,29,26)', foregroundColor: 'rgb(242,238,227)', labelColor: 'rgb(200,194,180)', logoText: 'Referra' });
    pass.type = 'generic';
    pass.primaryFields.push({ key: 'name', label: 'WIZYTÓWKA', value: c.name || '' });
    if (c.company) pass.secondaryFields.push({ key: 'company', label: 'FIRMA', value: c.company });
    if (c.phone) pass.auxiliaryFields.push({ key: 'phone', label: 'TELEFON', value: c.phone });
    if (c.email) pass.backFields.push({ key: 'email', label: 'E-mail', value: c.email });
    pass.backFields.push({ key: 'url', label: 'Wizytówka online', value: cardUrl(id) });
    pass.setBarcodes({ format: 'PKBarcodeFormatQR', message: cardUrl(id), messageEncoding: 'iso-8859-1' });
    const buf = pass.getAsBuffer();
    res.statusCode = 200; res.setHeader('Content-Type', 'application/vnd.apple.pkpass'); res.setHeader('Content-Disposition', 'attachment; filename="referra.pkpass"'); res.setHeader('Cache-Control', 'no-store'); res.end(buf);
  } catch (e) { fail(res, e); }
};
