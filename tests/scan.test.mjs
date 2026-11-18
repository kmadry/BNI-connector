import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../scan.js');

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('ok   - ' + name); }
  catch (e) { failed++; console.log('FAIL - ' + name + '\n       ' + e.message); }
}

/* ---------- parseCardText ---------- */
t('PL: pełna wizytówka z sp. z o.o.', () => {
  const d = S.parseCardText(`Jan Kowalski
Prezes Zarządu
Przykładowa Sp. z o.o.
ul. Testowa 12/4
00-001 Warszawa
tel. +48 600 000 011
jan.kowalski@example.com
www.example.com`);
  assert.equal(d.firstName, 'Jan'); assert.equal(d.lastName, 'Kowalski');
  assert.equal(d.title, 'Prezes Zarządu');
  assert.equal(d.company, 'Przykładowa Sp. z o.o.');
  assert.equal(d.city, 'Warszawa');
  assert.deepEqual(d.phones, ['+48 600 000 011']);
  assert.deepEqual(d.emails, ['jan.kowalski@example.com']);
  assert.equal(d.website, 'https://www.example.com');
  assert.ok(d.notes.includes('ul. Testowa 12/4'));
  assert.equal(d.source, 'scan');
});
t('EN: wizytówka angielska, Ltd', () => {
  const d = S.parseCardText(`John Smith
Sales Director
Acme Widgets Ltd
Phone: +44 20 7946 0000
john.smith@example.com
https://example.com/widgets`);
  assert.equal(d.firstName, 'John'); assert.equal(d.lastName, 'Smith');
  assert.equal(d.title, 'Sales Director');
  assert.equal(d.company, 'Acme Widgets Ltd');
  assert.equal(d.phones[0], '+44 20 7946 0000');
  assert.equal(d.website, 'https://example.com/widgets');
});
t('Telefon 600-000-000 -> +48', () => {
  const d = S.parseCardText('Anna Nowak\nmob. 600-000-022\nanna@example.com');
  assert.deepEqual(d.phones, ['+48 600 000 022']);
  assert.ok(d.confidence.phone >= 0.9);
});
t('Telefon stacjonarny (32) 123 45 67', () => {
  const d = S.parseCardText('Piotr Wiśniewski\nTel.: (32) 123 45 67\nZielona Góra');
  assert.deepEqual(d.phones, ['+48 321 234 567']);
});
t('Telefon 600 000 033 bez prefiksu oraz +48 w jednym wierszu z etykietami', () => {
  const d = S.parseCardText('Ewa Zielińska\nTel. 600 000 033 | Mob. +48 600 000 034');
  assert.deepEqual(d.phones, ['+48 600 000 033', '+48 600 000 034']);
});
t('E-mail z wielkimi literami jest normalizowany', () => {
  const d = S.parseCardText('Marek Lis\nMarek.Lis@EXAMPLE.COM\nDoradca biznesowy');
  assert.deepEqual(d.emails, ['marek.lis@example.com']);
  assert.equal(d.confidence.email, 1);
  assert.equal(d.title, 'Doradca biznesowy');
});
t('Polskie znaki w imieniu i nazwisku', () => {
  const d = S.parseCardText('Zażółć Gęślą-Jaźń\nDyrektor Handlowy\nŁąka Studio\n+48 600 000 044');
  assert.equal(d.firstName, 'Zażółć'); assert.equal(d.lastName, 'Gęślą-Jaźń');
  assert.equal(d.title, 'Dyrektor Handlowy');
});
t('Brak imienia: tylko firma i kontakt', () => {
  const d = S.parseCardText('Przykład Solutions S.A.\nbiuro@example.com\n+48 600 000 055\nwww.przyklad-example.pl');
  assert.equal(d.firstName, ''); assert.equal(d.lastName, '');
  assert.equal(d.confidence.name, 0);
  assert.equal(d.company, 'Przykład Solutions S.A.');
  assert.deepEqual(d.emails, ['biuro@example.com']);
});
t('Tytuł dr inż. jest ignorowany w imieniu', () => {
  const d = S.parseCardText('dr inż. Katarzyna Maj\nSpecjalista ds. jakości\nLab Przykład Sp. k.\nk.maj@example.com');
  assert.equal(d.firstName, 'Katarzyna'); assert.equal(d.lastName, 'Maj');
  assert.equal(d.title, 'Specjalista ds. jakości');
  assert.equal(d.company, 'Lab Przykład Sp. k.');
});
t('Imię i stanowisko w jednej linii po przecinku', () => {
  const d = S.parseCardText('Tomasz Bielak, CEO\nBielak Group\ntomasz@example.com');
  assert.equal(d.firstName, 'Tomasz'); assert.equal(d.lastName, 'Bielak');
  assert.equal(d.title, 'CEO');
  assert.equal(d.company, 'Bielak Group');
});
t('Nazwisko WIELKIMI LITERAMI i imię (układ z etykietami T:/E:)', () => {
  const d = S.parseCardText('ANNA MALINOWSKA\nWłaściciel\nPracownia Test GmbH\nT: 600 000 066\nE: anna@example.com');
  assert.equal(d.firstName, 'Anna'); assert.equal(d.lastName, 'Malinowska');
  assert.equal(d.title, 'Właściciel');
  assert.deepEqual(d.phones, ['+48 600 000 066']);
  assert.deepEqual(d.emails, ['anna@example.com']);
});
t('Kod pocztowy nie jest telefonem; NIP trafia do notatek', () => {
  const d = S.parseCardText('Karol Dąb\nul. Długa 5\n80-001 Gdańsk\nNIP 525-000-12-34\n+48 600 000 077');
  assert.deepEqual(d.phones, ['+48 600 000 077']);
  assert.equal(d.city, 'Gdańsk');
  assert.ok(d.notes.includes('NIP'));
});
t('Firma bez sufiksu (najbardziej firmowa linia) ma niską pewność', () => {
  const d = S.parseCardText('Olga Sowa\nManager\nKwiaciarnia Pod Dębem\n600 000 088');
  assert.equal(d.company, 'Kwiaciarnia Pod Dębem');
  assert.ok(d.confidence.company < 0.6);
  assert.equal(d.title, 'Manager');
});
t('Puste wejście nie rzuca wyjątku', () => {
  const d = S.parseCardText('');
  assert.equal(d.firstName, ''); assert.deepEqual(d.emails, []); assert.equal(d.confidence.phone, 0);
});
t('Imię dopasowane po adresie e-mail (dwie linie z wielkiej litery)', () => {
  const d = S.parseCardText('Zielone Wzgórza\nAnna Lis\nanna.lis@example.com');
  assert.equal(d.lastName, 'Lis');
});

/* ---------- parseVCard ---------- */
t('vCard 3.0', () => {
  const [d] = S.parseVCard(`BEGIN:VCARD
VERSION:3.0
FN:Jan Kowalski
N:Kowalski;Jan;;;
ORG:Przykład Sp. z o.o.;Dział
TITLE:Prezes
TEL;TYPE=CELL:600000101
EMAIL;TYPE=INTERNET:Jan@Example.com
URL:https://example.com
ADR;TYPE=WORK:;;ul. Testowa 1;Warszawa;;00-001;Polska
NOTE:Poznany na spotkaniu\\, super
END:VCARD`);
  assert.equal(d.firstName, 'Jan'); assert.equal(d.lastName, 'Kowalski');
  assert.equal(d.company, 'Przykład Sp. z o.o.'); assert.equal(d.title, 'Prezes');
  assert.deepEqual(d.phones, ['+48 600 000 101']); assert.deepEqual(d.emails, ['jan@example.com']);
  assert.equal(d.website, 'https://example.com'); assert.equal(d.city, 'Warszawa');
  assert.ok(d.notes.includes('Poznany na spotkaniu, super'));
});
t('vCard 2.1 z QUOTED-PRINTABLE', () => {
  const [d] = S.parseVCard(`BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:Wi=C5=9Bniewski;=C5=81ukasz;;;
TEL;CELL:+48 600 000 102
EMAIL;INTERNET:lukasz@example.com
ORG:Test
END:VCARD`);
  assert.equal(d.lastName, 'Wiśniewski'); assert.equal(d.firstName, 'Łukasz');
  assert.deepEqual(d.phones, ['+48 600 000 102']);
});
t('vCard: wiele wizytówek w jednym pliku (4.0 i CRLF)', () => {
  const r = S.parseVCard('BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Anna Nowak\r\nEMAIL:a@example.com\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:4.0\r\nFN:Piotr Lis\r\nTEL:600000103\r\nEND:VCARD\r\n');
  assert.equal(r.length, 2);
  assert.equal(r[0].firstName, 'Anna'); assert.equal(r[0].lastName, 'Nowak');
  assert.equal(r[1].lastName, 'Lis'); assert.deepEqual(r[1].phones, ['+48 600 000 103']);
});
t('vCard: składanie linii z wcięciem', () => {
  const [d] = S.parseVCard('BEGIN:VCARD\nVERSION:3.0\nFN:Ewa Przykład\nNOTE:To jest bardzo dl\n ugi opis\n  z wcięciem\nEMAIL:ewa@exam\n\tple.com\nEND:VCARD');
  assert.equal(d.notes, 'To jest bardzo dlugi opis z wcięciem');
  assert.deepEqual(d.emails, ['ewa@example.com']);
});

/* ---------- parseMeCard ---------- */
t('MECARD podstawowy', () => {
  const d = S.parseMeCard('MECARD:N:Kowalski,Jan;TEL:600000201;EMAIL:jan@example.com;URL:www.example.com;ORG:Przykład Sp. z o.o.;ADR:ul. Testowa 1\\, 00-001 Warszawa;NOTE:Test;;');
  assert.equal(d.firstName, 'Jan'); assert.equal(d.lastName, 'Kowalski');
  assert.deepEqual(d.phones, ['+48 600 000 201']); assert.deepEqual(d.emails, ['jan@example.com']);
  assert.equal(d.website, 'https://www.example.com'); assert.equal(d.company, 'Przykład Sp. z o.o.');
  assert.equal(d.city, 'Warszawa'); assert.ok(d.notes.includes('Test'));
});
t('MECARD z wieloma telefonami i znakami ucieczki', () => {
  const d = S.parseMeCard('MECARD:N:Nowak,Anna Maria;TEL:+48 600 000 202;TEL:600000203;NOTE:a\\;b;;');
  assert.equal(d.firstName, 'Anna Maria');
  assert.deepEqual(d.phones, ['+48 600 000 202', '+48 600 000 203']);
  assert.ok(d.notes.includes('a;b'));
});

/* ---------- pomocnicze ---------- */
t('findDuplicate: e-mail, telefon, podobne imię', () => {
  const pool = [{ firstName: 'Jan', lastName: 'Kowalski', emails: ['jan@example.com'], phones: ['+48 600 000 001'] }];
  assert.equal(S.findDuplicate({ emails: ['JAN@example.com'], phones: [] }, pool).reason, 'ten sam e-mail');
  assert.equal(S.findDuplicate({ emails: [], phones: ['600-000-001'] }, pool).reason, 'ten sam telefon');
  assert.ok(S.findDuplicate({ firstName: 'Jan', lastName: 'Kowalsky', emails: [], phones: [] }, pool));
  assert.equal(S.findDuplicate({ firstName: 'Piotr', lastName: 'Nowak', emails: [], phones: [] }, pool), null);
});
t('finalizeContact: pełny model', () => {
  const c = S.finalizeContact(S.parseCardText('Jan Kowalski\njan@example.com'));
  assert.ok(c.id); assert.equal(c.source, 'scan'); assert.ok(!('confidence' in c));
  assert.ok(!isNaN(Date.parse(c.createdAt)));
  assert.deepEqual(Object.keys(c).sort(), ['city','company','createdAt','emails','firstName','id','industry','lastName','notes','phones','relation','scale','source','tags','title','website'].sort());
});

console.log(`\n${passed} ok, ${failed} niepowodzeń`);
process.exit(failed ? 1 : 0);
