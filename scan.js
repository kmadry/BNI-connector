/* scan.js – zaczytywanie kontaktów z wizytówek (OCR lokalnie w przeglądarce, vCard, MECARD).
 * Moduł izolowany: window.BNIScan w przeglądarce, module.exports (czyste funkcje) w Node.
 * Dane testowe wyłącznie fikcyjne. */
(function () {
  'use strict';

  var TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  var MAX_SIDE = 1800;

  /* ------------------------------------------------------------------ */
  /* Narzędzia                                                          */
  /* ------------------------------------------------------------------ */

  function nowIso() { return new Date().toISOString(); }

  function uuid() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* fallback */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function stripDiacritics(s) {
    return String(s || '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function emptyDraft() {
    return {
      firstName: '', lastName: '', company: '', title: '', industry: '',
      emails: [], phones: [], website: '', city: '', tags: [],
      relation: '', scale: '', notes: '', source: 'scan', createdAt: nowIso()
    };
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function titleCaseWord(w) {
    return w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, function (m, a, b) { return a + b.toUpperCase(); });
  }

  /* Normalizacja telefonu: 9 cyfr -> +48 xxx xxx xxx */
  function normalizePhone(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var plus = /^\+/.test(s) || /^00/.test(s);
    var digits = s.replace(/\D/g, '');
    if (/^00/.test(s)) digits = digits.replace(/^00/, '');
    function pl(d) { return '+48 ' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 9); }
    if (!plus && digits.length === 9) return pl(digits);
    if (digits.length === 11 && digits.indexOf('48') === 0 && (plus || !/^0/.test(s))) return pl(digits.slice(2));
    if (plus) {
      var cleaned = s.replace(/^00/, '+').replace(/[().\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
      return cleaned.charAt(0) === '+' ? cleaned : '+' + cleaned;
    }
    return s.replace(/[().\-\/]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function phoneIsPL(p) { return /^\+48 \d{3} \d{3} \d{3}$/.test(p); }

  function normalizeWebsite(w) {
    w = String(w || '').trim().replace(/[.,;)]+$/, '');
    if (!w) return '';
    if (!/^https?:\/\//i.test(w)) w = 'https://' + w;
    return w;
  }

  /* ------------------------------------------------------------------ */
  /* parseCardText                                                      */
  /* ------------------------------------------------------------------ */

  var EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g;
  var URL_RE = /(?:https?:\/\/|www\.)[^\s,;|<>"')]+/gi;
  var PHONE_RE = /(?:\+|00)?\s?\(?\d[\d\s().\-]{6,}\d/g;
  var POSTAL_RE = /\b\d{2}-\d{3}\b/;
  var LABEL_RE = /(?:^|\s)(?:tel(?:efon)?|mob(?:ile)?|phone|cell|kom(?:órka)?|e-?mail|mail|www|web|url|fax|[tmewf])\s*[:.]\s*/gi;
  var NOINFO_RE = /\b(?:NIP|REGON|KRS|VAT|IBAN|PESEL)\b/i;

  var TITLE_RE = new RegExp('(?<![\\p{L}])(?:CEO|CTO|CFO|COO|CMO|CIO|Prezes|Wiceprezes|Dyrektor|Director|Manager|Menedżer|Menadżer|Kierownik|Specjalista|Specialist|Doradca|Advisor|Adviser|Consultant|Konsultant|Właściciel|Owner|Founder|Co-?founder|Współzałożyciel|Założyciel|Partner|Handlowiec|Przedstawiciel|Engineer|Inżynier|Developer|Architekt|Architect|Księgowa|Księgowy|Adwokat|Radca prawny|Lawyer|Agent|Broker|Head of|Lead|President|Vice President|VP|Chief|Analityk|Analyst|Koordynator|Coordinator|Pełnomocnik|Executive|Member of the Board)(?![\\p{L}])', 'iu');
  var COMPANY_SUFFIX_RE = /(?:^|[\s,])(?:sp\.?\s*z\s*o\.?\s*o\.?|sp\.?\s*k\.?|sp\.?\s*j\.?|s\.c\.|ltd\.?|llc|gmbh|inc\.?|corp\.?|group|grupa|plc|pllc)(?=$|[\s,.;])/i;
  var COMPANY_SUFFIX_CS_RE = /(?:^|[\s,])(?:S\.\s?A\.?|S\.K\.A\.|AG|BV|OY)(?=$|[\s,.;])/;
  var COMPANY_WORD_RE = /^(?:sp|spółka|group|grupa|studio|agency|agencja|solutions|consulting|systems|technologies|technology|partners|kancelaria|biuro|fundacja|holding|software|media|labs|lab|invest|centrum|instytut|ltd|llc|gmbh|inc|corp|company|bank|sklep|salon|klinika|clinic|design|digital|marketing|logistics|usługi|serwis|firma|polska|poland|europe|international|trade|trans|bud|tech|energy|finance|financial|bureau|office|team|works|ventures|capital|foundation|association|stowarzyszenie|zakład|przedsiębiorstwo|pphu|phu|ppuh|sa|ag|bv)$/i;
  var NOT_NAME_WORD_RE = /^(?:ulica|street|road|avenue|floor|piętro|poland|polska|germany|niemcy|warszawa|kraków|poznań|wrocław|gdańsk|katowice|łódź)$/i;
  var HONORIFIC_RE = /^(?:dr|mgr|inż|inz|prof|lic|hab|ks|mr|mrs|ms|dipl|ing|eng)\.?$/i;
  var STREET_RE = /^(?:ul\.?|ulica|al\.?|aleje|aleja|pl\.?|plac|os\.?|osiedle)\s/i;
  var STREET_EN_RE = /\b(?:street|st\.|road|rd\.|avenue|ave\.|lane|blvd|boulevard)\b/i;

  function stripHonorifics(line) {
    var s = line.replace(/[,\s]+(?:MBA|PhD|Ph\.D\.?|MSc|M\.Sc\.?|CFA)\.?$/i, '').trim();
    var words = s.split(/\s+/);
    while (words.length > 2 && HONORIFIC_RE.test(words[0])) words.shift();
    if (words.length > 2 && /^hab\.?$/i.test(words[0])) words.shift();
    return words.join(' ');
  }

  function nameWords(line) {
    var s = stripHonorifics(line);
    if (/[\d@:\/]/.test(s)) return null;
    var words = s.split(/\s+/);
    if (words.length < 2 || words.length > 3) return null;
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!/^\p{Lu}[\p{L}'’\-]+$/u.test(w)) return null;
      if (COMPANY_WORD_RE.test(w) || NOT_NAME_WORD_RE.test(w)) return null;
    }
    return words;
  }

  function isTitleLine(line) {
    return TITLE_RE.test(line) && line.length <= 70 && line.split(/\s+/).length <= 8;
  }

  function isAddressLine(line) {
    return POSTAL_RE.test(line) || STREET_RE.test(line) || (STREET_EN_RE.test(line) && /\d/.test(line));
  }

  function cleanResidual(s) {
    s = s.replace(LABEL_RE, ' ');
    s = s.replace(/^[\s|,;:–—\-•·]+|[\s|,;:–—\-•·]+$/g, '').replace(/\s{2,}/g, ' ');
    return s;
  }

  function parseCardText(text) {
    var draft = emptyDraft();
    var conf = { name: 0, company: 0, email: 0, phone: 0 };
    var raw = String(text || '').replace(/\r/g, '\n');
    var emails = [], phones = [], websites = [], notes = [], residual = [];
    var anyPlus48 = false;

    // 1) rozbicie na linie i separatory
    var lines = [];
    raw.split('\n').forEach(function (l) {
      l.split(/\s*[|•·]\s*|\s+[–—-]\s+/).forEach(function (p) {
        p = p.trim();
        if (p) lines.push(p);
      });
    });

    // 2) wyciąganie e-maili, www, telefonów z każdej linii
    lines.forEach(function (line) {
      var work = line;
      var isFax = /^\s*(?:fax|f)\s*[:.]/i.test(work);
      var noInfo = NOINFO_RE.test(work);

      (work.match(EMAIL_RE) || []).forEach(function (e) { emails.push(e.toLowerCase()); });
      work = work.replace(EMAIL_RE, ' ');

      (work.match(URL_RE) || []).forEach(function (u) { websites.push(u); });
      work = work.replace(URL_RE, ' ');

      if (!noInfo && !isFax && !(POSTAL_RE.test(work) && !/(?:tel|mob|phone|kom|\bm\b|\bt\b)\s*[:.]/i.test(work))) {
        work = work.replace(PHONE_RE, function (m) {
          var digits = m.replace(/\D/g, '');
          if (digits.length >= 9 && digits.length <= 14) {
            var p = normalizePhone(m.trim());
            phones.push(p);
            if (phoneIsPL(p)) anyPlus48 = true;
            return ' ';
          }
          return m;
        });
      }

      if (isFax) { notes.push('Fax: ' + line.replace(/^\s*(?:fax|f)\s*[:.]\s*/i, '')); return; }
      if (noInfo) { notes.push(line); return; }

      var rest = cleanResidual(work);
      if (/\p{L}{2,}/u.test(rest) || (rest && POSTAL_RE.test(rest))) residual.push(rest);
    });

    // bare domena w osobnej linii (np. example.com)
    residual = residual.filter(function (l) {
      if (/^[a-z0-9\-]+(?:\.[a-z0-9\-]+)*\.(?:com|pl|eu|net|org|io|de|co\.uk|info|biz)(?:\/\S*)?$/i.test(l)) {
        websites.push(l); return false;
      }
      return true;
    });

    draft.emails = uniq(emails);
    draft.phones = uniq(phones);
    if (websites.length) draft.website = normalizeWebsite(websites[0]);
    if (draft.emails.length) conf.email = 1;
    if (draft.phones.length) conf.phone = draft.phones.some(phoneIsPL) || anyPlus48 ? 0.95 : 0.6;

    // 3) rozdzielenie "Imię Nazwisko, Stanowisko"
    var expanded = [];
    residual.forEach(function (l) {
      if (l.indexOf(',') > 0) {
        var parts = l.split(/\s*,\s*/);
        if (parts.length === 2) {
          if (nameWords(parts[0]) && isTitleLine(parts[1])) { expanded.push(parts[0], parts[1]); return; }
          if (isTitleLine(parts[0]) && nameWords(parts[1])) { expanded.push(parts[1], parts[0]); return; }
        }
      }
      expanded.push(l);
    });

    // 4) klasyfikacja linii
    var company = '', companyStrong = false, title = '', city = '';
    var used = {};
    var types = expanded.map(function () { return ''; });

    expanded.forEach(function (l, i) {
      if (COMPANY_SUFFIX_RE.test(l) || COMPANY_SUFFIX_CS_RE.test(l)) {
        types[i] = 'company';
        if (!company) { company = l; companyStrong = true; used[i] = 1; }
        return;
      }
      if (isTitleLine(l)) { types[i] = 'title'; if (!title) { title = l; used[i] = 1; } return; }
      if (isAddressLine(l)) { types[i] = 'address'; return; }
    });

    // adres / miasto
    expanded.forEach(function (l, i) {
      if (types[i] !== 'address') return;
      var m = l.match(/\b\d{2}-\d{3}\b\s*,?\s*([^,\d][^,]*)/);
      var street = l;
      if (m) {
        if (!city) city = m[1].trim().replace(/[.;]+$/, '');
        street = l.replace(m[0], '').replace(/[,\s]+$/, '').replace(/^[,\s]+/, '');
        if (/^\d{2}-\d{3}\s*$/.test(street)) street = '';
        // kod pocztowy poprzedzony miastem ("Warszawa 00-001")
      } else {
        var parts = l.split(/\s*,\s*/);
        var last = parts[parts.length - 1];
        if (parts.length > 1 && /^\p{L}[\p{L} .\-]+$/u.test(last) && !city) {
          city = last.trim();
          street = parts.slice(0, -1).join(', ');
        }
      }
      if (street) notes.push('Adres: ' + street);
    });

    // imię i nazwisko
    var emailLocal = stripDiacritics((draft.emails[0] || '').split('@')[0]).toLowerCase();
    var best = -1, bestScore = 0, bestWords = null;
    expanded.forEach(function (l, i) {
      if (types[i]) return;
      var w = nameWords(l);
      if (!w) return;
      var s = 0.5;
      var allCaps = stripHonorifics(l) === stripHonorifics(l).toUpperCase();
      s += allCaps ? 0 : 0.2;
      if ((types[i - 1] === 'title') || (types[i + 1] === 'title')) s += 0.3;
      if (emailLocal && w.some(function (x) {
        var nx = stripDiacritics(x).toLowerCase();
        return nx.length > 2 && emailLocal.indexOf(nx) !== -1;
      })) s += 0.5;
      if (i === 0) s += 0.05;
      if (s > bestScore) { bestScore = s; best = i; bestWords = w; }
    });
    if (best >= 0) {
      var w = bestWords.map(function (x) { return x === x.toUpperCase() ? titleCaseWord(x) : x; });
      draft.lastName = w[w.length - 1];
      draft.firstName = w.slice(0, -1).join(' ');
      types[best] = 'name';
      conf.name = Math.min(1, bestScore + 0.2);
      if (conf.name < 0.6) conf.name = 0.6;
      if (conf.name > 0.95) conf.name = 1;
    }

    // firma: brak sufiksu -> pierwsza nieprzypisana linia
    if (!company) {
      for (var j = 0; j < expanded.length; j++) {
        if (!types[j] && /\p{L}{2,}/u.test(expanded[j])) {
          company = expanded[j]; types[j] = 'company'; break;
        }
      }
    }
    if (company) conf.company = companyStrong ? 0.9 : 0.4;

    // reszta -> notatki
    expanded.forEach(function (l, i) {
      if (types[i] === 'company' && l === company) return;
      if (types[i] === 'title' && l === title) return;
      if (types[i] === 'name' || types[i] === 'address') return;
      notes.push(l);
    });

    draft.company = company;
    draft.title = title;
    draft.city = city;
    draft.notes = notes.join('\n');
    draft.confidence = conf;
    return draft;
  }

  /* ------------------------------------------------------------------ */
  /* parseVCard                                                         */
  /* ------------------------------------------------------------------ */

  function decodeQP(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charAt(i);
      if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(str.substr(i + 1, 2))) {
        bytes.push(parseInt(str.substr(i + 1, 2), 16)); i += 2;
      } else {
        var code = str.charCodeAt(i);
        if (code < 128) bytes.push(code);
        else { Array.prototype.push.apply(bytes, Array.prototype.slice.call(utf8Bytes(c))); }
      }
    }
    try {
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch (e) {
      return String.fromCharCode.apply(null, bytes);
    }
  }

  function utf8Bytes(ch) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(ch);
    return [ch.charCodeAt(0)];
  }

  function splitUnescaped(s, sep) {
    var out = [], cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '\\' && i + 1 < s.length) { cur += c + s.charAt(i + 1); i++; }
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function unescapeVal(s) {
    return String(s).replace(/\\([nN,;:\\])/g, function (m, c) { return /n/i.test(c) ? '\n' : c; });
  }

  function unfoldVCard(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n');
    // składanie linii z wcięciem (RFC)
    t = t.replace(/\n[ \t]/g, '');
    var lines = t.split('\n');
    // QP: miękkie łamanie "=" na końcu linii
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      while (/=$/.test(l) && /ENCODING=QUOTED-PRINTABLE|QUOTED-PRINTABLE/i.test(l.split(':')[0] || '') && i + 1 < lines.length) {
        l = l.slice(0, -1) + lines[++i];
      }
      out.push(l);
    }
    return out;
  }

  function parseVCard(text) {
    var lines = unfoldVCard(text);
    var cards = [], cur = null;
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      if (/^BEGIN:VCARD$/i.test(t)) { cur = []; return; }
      if (/^END:VCARD$/i.test(t)) { if (cur) cards.push(cur); cur = null; return; }
      if (cur) cur.push(line);
    });
    return cards.map(vcardToDraft);
  }

  function vcardToDraft(lines) {
    var d = emptyDraft();
    var n = null, fn = '', notes = [], adrs = [], org = '';
    lines.forEach(function (line) {
      var idx = line.indexOf(':');
      if (idx < 0) return;
      var head = line.slice(0, idx), val = line.slice(idx + 1);
      var segs = head.split(';');
      var name = segs[0].replace(/^.*\./, '').toUpperCase();
      var params = segs.slice(1).join(';').toUpperCase();
      if (/QUOTED-PRINTABLE/.test(params)) val = decodeQP(val);
      var isUrl = name === 'URL';
      switch (name) {
        case 'FN': fn = unescapeVal(val).trim(); break;
        case 'N': n = splitUnescaped(val, ';').map(function (x) { return unescapeVal(x).trim(); }); break;
        case 'ORG': org = unescapeVal(splitUnescaped(val, ';')[0]).trim(); break;
        case 'TITLE': d.title = unescapeVal(val).trim(); break;
        case 'TEL': {
          var tel = normalizePhone(unescapeVal(val).replace(/^tel:/i, ''));
          if (tel && !/FAX/.test(params)) d.phones.push(tel);
          break;
        }
        case 'EMAIL': {
          var em = unescapeVal(val).trim().toLowerCase().replace(/^mailto:/, '');
          if (em) d.emails.push(em);
          break;
        }
        case 'URL': if (isUrl && !d.website) d.website = normalizeWebsite(unescapeVal(val)); break;
        case 'ADR': adrs.push(splitUnescaped(val, ';').map(function (x) { return unescapeVal(x).trim(); })); break;
        case 'NOTE': { var nt = unescapeVal(val).trim(); if (nt) notes.push(nt); break; }
        default: break;
      }
    });
    if (n && (n[0] || n[1])) {
      d.lastName = n[0] || '';
      d.firstName = [n[1], n[2]].filter(Boolean).join(' ');
    } else if (fn) {
      var parts = fn.split(/\s+/);
      d.lastName = parts.length > 1 ? parts.pop() : '';
      d.firstName = parts.join(' ');
      if (!d.lastName && d.firstName) { d.lastName = d.firstName; d.firstName = ''; }
    }
    d.company = org;
    if (!d.company && !d.firstName && !d.lastName && fn) d.company = fn;
    if (adrs.length) {
      var a = adrs[0];
      d.city = a[3] || '';
      var addr = [a[2], [a[5], a[3]].filter(Boolean).join(' '), a[6]].filter(Boolean).join(', ');
      if (addr) notes.push('Adres: ' + addr);
    }
    d.emails = uniq(d.emails);
    d.phones = uniq(d.phones);
    d.notes = notes.join('\n');
    d.confidence = {
      name: (d.firstName || d.lastName) ? 1 : 0, company: d.company ? 1 : 0,
      email: d.emails.length ? 1 : 0, phone: d.phones.length ? 1 : 0
    };
    return d;
  }

  /* ------------------------------------------------------------------ */
  /* parseMeCard                                                        */
  /* ------------------------------------------------------------------ */

  function parseMeCard(text) {
    var s = String(text || '').trim().replace(/^MECARD:/i, '');
    var d = emptyDraft(), notes = [];
    function unesc(v) { return v.replace(/\\([\\;:,"])/g, '$1'); }
    splitUnescaped(s, ';').forEach(function (field) {
      var i = field.indexOf(':');
      if (i < 0) return;
      var key = field.slice(0, i).toUpperCase();
      var val = unesc(field.slice(i + 1)).trim();
      if (!val) return;
      switch (key) {
        case 'N': {
          var p = val.split(',');
          if (p.length > 1) { d.lastName = p[0].trim(); d.firstName = p.slice(1).join(' ').trim(); }
          else {
            var w = val.split(/\s+/);
            d.lastName = w.length > 1 ? w.pop() : w[0]; d.firstName = w.length ? w.join(' ') : '';
            if (w.length === 0 && d.lastName === val) d.firstName = '';
          }
          break;
        }
        case 'TEL': d.phones.push(normalizePhone(val)); break;
        case 'EMAIL': d.emails.push(val.toLowerCase()); break;
        case 'URL': if (!d.website) d.website = normalizeWebsite(val); break;
        case 'ORG': d.company = val; break;
        case 'TITLE': d.title = val; break;
        case 'ADR': {
          notes.push('Adres: ' + val.replace(/,+/g, ', ').replace(/^[\s,]+|[\s,]+$/g, ''));
          var pm = val.match(/\b\d{2}-\d{3}\b\s*,?\s*([^,\d]+)/);
          if (pm) d.city = pm[1].trim();
          break;
        }
        case 'NOTE': notes.push(val); break;
        default: break;
      }
    });
    d.emails = uniq(d.emails);
    d.phones = uniq(d.phones);
    d.notes = notes.join('\n');
    d.confidence = {
      name: (d.firstName || d.lastName) ? 1 : 0, company: d.company ? 1 : 0,
      email: d.emails.length ? 1 : 0, phone: d.phones.length ? 1 : 0
    };
    return d;
  }

  /* ------------------------------------------------------------------ */
  /* Dopasowanie duplikatów, finalizacja kontaktu                       */
  /* ------------------------------------------------------------------ */

  function normName(c) {
    var s = stripDiacritics([c.firstName, c.lastName].filter(Boolean).join(' ')).toLowerCase().replace(/[^a-z ]/g, ' ');
    return s.split(/\s+/).filter(Boolean).sort().join(' ');
  }

  function levenshtein(a, b) {
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  function phoneKey(p) { var d = String(p || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : ''; }

  /* zwraca {reason, contact} lub null */
  function findDuplicate(draft, pool) {
    var emails = (draft.emails || []).map(function (e) { return String(e).toLowerCase(); });
    var phones = (draft.phones || []).map(phoneKey).filter(Boolean);
    var nn = normName(draft);
    for (var i = 0; i < (pool || []).length; i++) {
      var c = pool[i];
      if (!c) continue;
      var ce = (c.emails || []).map(function (e) { return String(e).toLowerCase(); });
      if (emails.some(function (e) { return ce.indexOf(e) !== -1; })) return { reason: 'ten sam e-mail', contact: c };
      var cp = (c.phones || []).map(phoneKey);
      if (phones.some(function (p) { return cp.indexOf(p) !== -1; })) return { reason: 'ten sam telefon', contact: c };
      var cn = normName(c);
      if (nn && cn && nn.indexOf(' ') > 0 && cn.indexOf(' ') > 0) {
        var dist = levenshtein(nn, cn);
        if (1 - dist / Math.max(nn.length, cn.length) >= 0.88) return { reason: 'podobne imię i nazwisko', contact: c };
      }
    }
    return null;
  }

  function finalizeContact(d) {
    return {
      id: uuid(),
      firstName: (d.firstName || '').trim(),
      lastName: (d.lastName || '').trim(),
      company: (d.company || '').trim(),
      title: (d.title || '').trim(),
      industry: d.industry || '',
      emails: (d.emails || []).filter(Boolean),
      phones: (d.phones || []).filter(Boolean),
      website: (d.website || '').trim(),
      city: (d.city || '').trim(),
      tags: (d.tags || []).filter(Boolean),
      relation: d.relation || '',
      scale: d.scale || '',
      notes: d.notes || '',
      source: 'scan',
      createdAt: nowIso()
    };
  }

  /* ------------------------------------------------------------------ */
  /* Przetwarzanie obrazu, OCR, QR (tylko przeglądarka)                 */
  /* ------------------------------------------------------------------ */

  var tessPromise = null, tessWorker = null, tessLogger = null;

  function loadTesseract() {
    if (typeof window !== 'undefined' && window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tessPromise) return tessPromise;
    tessPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = TESSERACT_URL;
      s.async = true;
      s.onload = function () { window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Nie udało się załadować silnika OCR.')); };
      s.onerror = function () { tessPromise = null; reject(new Error('Nie udało się pobrać silnika OCR (brak internetu?). Możesz wkleić tekst ręcznie.')); };
      document.head.appendChild(s);
    });
    return tessPromise;
  }

  function getWorker() {
    if (tessWorker) return tessWorker;
    tessWorker = loadTesseract().then(function (T) {
      return T.createWorker('pol+eng', 1, { logger: function (m) { if (tessLogger) tessLogger(m); } });
    }).catch(function (e) { tessWorker = null; throw e; });
    return tessWorker;
  }

  function terminate() {
    if (!tessWorker) return;
    var w = tessWorker; tessWorker = null;
    w.then(function (x) { return x.terminate(); }).catch(function () {});
  }

  function loadBitmap(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file).catch(function () { return loadImgEl(file); });
    }
    return loadImgEl(file);
  }

  function loadImgEl(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Nie można odczytać obrazu.')); };
      img.src = url;
    });
  }

  /* zmniejsz do MAX_SIDE, skala szarości + rozciągnięcie histogramu */
  function prepareCanvas(src) {
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    var k = Math.min(1, MAX_SIDE / Math.max(w, h));
    var cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, cw, ch);
    var img = ctx.getImageData(0, 0, cw, ch), px = img.data, hist = new Array(256).fill(0), i, g;
    for (i = 0; i < px.length; i += 4) {
      g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
      px[i] = g; hist[g]++;
    }
    var total = cw * ch, lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.01) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.01) { hi = i; break; } }
    var range = Math.max(1, hi - lo);
    for (i = 0; i < px.length; i += 4) {
      g = Math.max(0, Math.min(255, ((px[i] - lo) * 255 / range) | 0));
      px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  function readQr(source) {
    if (typeof BarcodeDetector === 'undefined') return Promise.resolve(null);
    try {
      var det = new BarcodeDetector({ formats: ['qr_code'] });
      return det.detect(source).then(function (codes) {
        return codes && codes.length ? codes[0].rawValue : null;
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  function readText(file) {
    if (file.text) return file.text();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error('Nie można odczytać pliku.')); };
      r.readAsText(file);
    });
  }

  function isTextFile(f) {
    return /\.(vcf|vcard|txt)$/i.test(f.name || '') || /^text\//.test(f.type || '');
  }

  function abortError() { var e = new Error('Anulowano'); e.name = 'AbortError'; return e; }

  /* scanFiles(files, onProgress, {signal, onResult}) -> [{file, previewUrl, draft, rawText, error?}] */
  async function scanFiles(files, onProgress, opts) {
    opts = opts || {};
    var list = Array.prototype.slice.call(files || []);
    var total = list.length, results = [];
    var signal = opts.signal;
    function report(index, status, progress, extra) {
      if (onProgress) {
        try { onProgress(Object.assign({ index: index, total: total, status: status, progress: progress || 0 }, extra || {})); } catch (e) { /* ignoruj */ }
      }
    }
    function push(r) { results.push(r); if (opts.onResult) { try { opts.onResult(r); } catch (e) { /* ignoruj */ } } }
    function check() { if (signal && signal.aborted) throw abortError(); }

    for (var i = 0; i < total; i++) {
      var file = list[i], previewUrl = null;
      try {
        check();
        report(i, 'preparing', 0, { fileName: file.name });
        if (isTextFile(file)) {
          var txt = await readText(file);
          report(i, 'parsing', 0.9, { fileName: file.name });
          if (/BEGIN:VCARD/i.test(txt)) {
            var cards = parseVCard(txt);
            if (!cards.length) throw new Error('Plik vCard nie zawiera kontaktów.');
            cards.forEach(function (d) { push({ file: file, previewUrl: null, draft: d, rawText: txt }); });
          } else if (/^\s*MECARD:/i.test(txt)) {
            push({ file: file, previewUrl: null, draft: parseMeCard(txt), rawText: txt });
          } else {
            push({ file: file, previewUrl: null, draft: parseCardText(txt), rawText: txt });
          }
          report(i, 'done', 1, { fileName: file.name });
          continue;
        }
        if (!/^image\//.test(file.type || '') && !/\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(file.name || '')) {
          throw new Error('Nieobsługiwany typ pliku.');
        }
        previewUrl = URL.createObjectURL(file);
        var bmp = await loadBitmap(file);
        check();
        var canvas = prepareCanvas(bmp);
        if (bmp.close) bmp.close();

        // QR
        report(i, 'qr', 0.05, { fileName: file.name });
        var qr = await readQr(canvas);
        var qrUrl = null;
        if (qr) {
          if (/BEGIN:VCARD/i.test(qr)) {
            var qc = parseVCard(qr);
            if (qc.length) { qc.forEach(function (d) { push({ file: file, previewUrl: previewUrl, draft: d, rawText: qr }); }); report(i, 'done', 1, { fileName: file.name }); continue; }
          } else if (/^MECARD:/i.test(qr)) {
            push({ file: file, previewUrl: previewUrl, draft: parseMeCard(qr), rawText: qr });
            report(i, 'done', 1, { fileName: file.name }); continue;
          } else if (/^https?:\/\//i.test(qr)) { qrUrl = qr; }
        }
        check();

        // OCR
        report(i, 'loading-ocr', 0.1, { fileName: file.name });
        var worker = await getWorker();
        check();
        tessLogger = function (m) {
          if (m && m.status === 'recognizing text') report(i, 'ocr', 0.2 + 0.7 * (m.progress || 0), { fileName: file.name });
        };
        report(i, 'ocr', 0.2, { fileName: file.name });
        var res = await worker.recognize(canvas);
        tessLogger = null;
        check();
        var rawText = (res && res.data && res.data.text) || '';
        report(i, 'parsing', 0.95, { fileName: file.name });
        var draft = parseCardText(rawText);
        if (qrUrl && !draft.website) draft.website = qrUrl;
        push({ file: file, previewUrl: previewUrl, draft: draft, rawText: rawText });
        report(i, 'done', 1, { fileName: file.name });
      } catch (err) {
        tessLogger = null;
        if (err && err.name === 'AbortError') {
          if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (e) { /* */ } }
          report(i, 'cancelled', 0, { fileName: file && file.name });
          break;
        }
        push({ file: file, previewUrl: previewUrl, draft: emptyDraft(), rawText: '', error: (err && err.message) || 'Błąd przetwarzania pliku.' });
        report(i, 'error', 1, { fileName: file && file.name, message: err && err.message });
      }
    }
    return results;
  }

  /* ------------------------------------------------------------------ */
  /* UI                                                                 */
  /* ------------------------------------------------------------------ */

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v == null) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  function splitList(s) {
    return String(s || '').split(/[,;\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  var STATUS_PL = {
    preparing: 'Przygotowanie obrazu', qr: 'Szukanie kodu QR', 'loading-ocr': 'Ładowanie silnika OCR (pierwszy raz może potrwać)',
    ocr: 'Rozpoznawanie tekstu', parsing: 'Analiza danych', done: 'Gotowe', error: 'Błąd', cancelled: 'Anulowano'
  };

  function mount(rootEl, options) {
    options = options || {};
    var items = [], seq = 0, ctl = null, busy = false;
    var idp = 'scan' + Math.random().toString(36).slice(2, 7);

    function existing() { try { return (options.existing && options.existing()) || []; } catch (e) { return []; } }

    rootEl.innerHTML = '';
    rootEl.classList.add('scan');

    var filesInput = h('input', { type: 'file', accept: 'image/*,.vcf,.vcard,.txt', multiple: true, class: 'scan-hidden', id: idp + '-files', 'aria-label': 'Wybierz pliki wizytówek' });
    var camInput = h('input', { type: 'file', accept: 'image/*,.vcf', multiple: true, capture: 'environment', class: 'scan-hidden', id: idp + '-cam', 'aria-label': 'Zrób zdjęcie wizytówki' });
    var pickBtn = h('button', { type: 'button', class: 'scan-btn scan-btn--primary', text: 'Wybierz pliki', onclick: function () { filesInput.click(); } });
    var camBtn = h('button', { type: 'button', class: 'scan-btn', text: 'Zrób zdjęcie', onclick: function () { camInput.click(); } });
    var zone = h('div', { class: 'scan-drop', tabindex: '0', role: 'button', 'aria-label': 'Strefa wgrywania: przeciągnij zdjęcia wizytówek lub plików vCard albo naciśnij Enter, aby wybrać pliki' }, [
      h('p', { class: 'scan-drop-title', text: 'Przeciągnij tutaj zdjęcia wizytówek lub pliki .vcf' }),
      h('p', { class: 'scan-muted', text: 'albo skorzystaj z przycisków poniżej. Możesz dodać wiele plików naraz.' }),
      h('div', { class: 'scan-actions' }, [pickBtn, camBtn])
    ]);
    zone.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === zone) { e.preventDefault(); filesInput.click(); }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('scan-drop--over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('scan-drop--over'); });
    });
    zone.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); });
    filesInput.addEventListener('change', function () { if (filesInput.files.length) handleFiles(filesInput.files); filesInput.value = ''; });
    camInput.addEventListener('change', function () { if (camInput.files.length) handleFiles(camInput.files); camInput.value = ''; });

    var privacy = h('p', { class: 'scan-privacy', text: 'Prywatność: rozpoznawanie tekstu (OCR) działa lokalnie w Twojej przeglądarce. Zdjęcia wizytówek nie są wysyłane na żaden serwer. Z internetu pobierany jest wyłącznie silnik OCR (jednorazowo).' });

    // wklejanie tekstu
    var pasteArea = h('textarea', { class: 'scan-textarea', id: idp + '-paste', rows: '5', placeholder: 'Jan Kowalski\nPrezes Zarządu\nPrzykład Sp. z o.o.\n+48 600 000 001\njan@example.com' });
    var pasteBtn = h('button', { type: 'button', class: 'scan-btn', text: 'Przetwórz tekst', onclick: function () {
      var t = pasteArea.value.trim();
      if (!t) { say('Wklej najpierw tekst wizytówki lub vCard.'); pasteArea.focus(); return; }
      var drafts;
      if (/BEGIN:VCARD/i.test(t)) drafts = parseVCard(t);
      else if (/^\s*MECARD:/i.test(t)) drafts = [parseMeCard(t)];
      else drafts = [parseCardText(t)];
      if (!drafts.length) { say('Nie znaleziono żadnych kontaktów w wklejonym tekście.'); return; }
      drafts.forEach(function (d) { addItem({ file: null, previewUrl: null, draft: d, rawText: t }); });
      pasteArea.value = '';
      say('Dodano do weryfikacji: ' + drafts.length + '.');
    } });
    var pasteBox = h('details', { class: 'scan-paste' }, [
      h('summary', { text: 'Wklej tekst wizytówki / vCard' }),
      h('label', { for: idp + '-paste', class: 'scan-label', text: 'Tekst wizytówki lub vCard (bez OCR)' }),
      pasteArea,
      h('div', { class: 'scan-actions' }, [pasteBtn])
    ]);

    // postęp
    var progressEl = h('progress', { class: 'scan-progress', max: '1', value: '0', 'aria-label': 'Postęp przetwarzania kolejki' });
    var cancelBtn = h('button', { type: 'button', class: 'scan-btn', text: 'Anuluj', onclick: function () { if (ctl) ctl.abort(); } });
    var progressText = h('span', { class: 'scan-progress-text' });
    var progressBox = h('div', { class: 'scan-progress-box scan-hidden' }, [progressText, progressEl, cancelBtn]);
    var live = h('div', { class: 'scan-live', role: 'status', 'aria-live': 'polite' });

    // lista + pasek akcji
    var listEl = h('div', { class: 'scan-list' });
    var countEl = h('span', { class: 'scan-count' });
    var saveBtn = h('button', { type: 'button', class: 'scan-btn scan-btn--primary', text: 'Zapisz zaznaczone', onclick: function () { save(false); } });
    var saveNextBtn = h('button', { type: 'button', class: 'scan-btn', text: 'Zapisz i skanuj następną', onclick: function () { save(true); } });
    var discardAllBtn = h('button', { type: 'button', class: 'scan-btn scan-btn--ghost', text: 'Odrzuć wszystkie', onclick: function () {
      items.slice().forEach(removeItem);
      say('Odrzucono wszystkie wyniki.');
    } });
    var bar = h('div', { class: 'scan-bar scan-hidden' }, [countEl, h('div', { class: 'scan-actions' }, [saveBtn, saveNextBtn, discardAllBtn])]);

    rootEl.appendChild(h('div', { class: 'scan-intro' }, [zone, privacy]));
    rootEl.appendChild(filesInput); rootEl.appendChild(camInput);
    rootEl.appendChild(pasteBox);
    rootEl.appendChild(progressBox);
    rootEl.appendChild(live);
    rootEl.appendChild(bar);
    rootEl.appendChild(listEl);

    function say(msg) { live.textContent = msg; }

    function updateBar() {
      var n = items.filter(isSavable).length;
      countEl.textContent = 'Do zapisu: ' + n + ' z ' + items.length;
      bar.classList.toggle('scan-hidden', !items.length);
      saveBtn.disabled = saveNextBtn.disabled = n === 0;
    }

    function isSavable(it) {
      if (!it.selected) return false;
      if (it.dup && it.decision !== 'add') return false;
      return true;
    }

    /* ---- obsługa plików ---- */
    function handleFiles(fl) {
      if (busy) { say('Trwa przetwarzanie kolejki. Poczekaj lub kliknij Anuluj.'); return; }
      busy = true;
      ctl = typeof AbortController !== 'undefined' ? new AbortController() : { abort: function () {}, signal: undefined };
      progressBox.classList.remove('scan-hidden');
      [pickBtn, camBtn].forEach(function (b) { b.disabled = true; });
      var files = Array.prototype.slice.call(fl);
      var lastStatus = '';
      scanFiles(files, function (p) {
        var label = (STATUS_PL[p.status] || p.status) + (p.fileName ? ' – ' + p.fileName : '');
        progressText.textContent = 'Plik ' + Math.min(p.index + 1, p.total) + ' z ' + p.total + ': ' + label;
        progressEl.value = (p.index + (p.progress || 0)) / p.total;
        var key = p.index + p.status;
        if (key !== lastStatus && p.status !== 'ocr') { lastStatus = key; say(progressText.textContent); }
      }, {
        signal: ctl.signal,
        onResult: function (r) { addItem(r); }
      }).then(function (res) {
        var errs = res.filter(function (r) { return r.error; }).length;
        say('Zakończono. Wyniki: ' + res.length + (errs ? ', w tym błędy: ' + errs : '') + '. Sprawdź dane i zapisz.');
      }).catch(function (e) {
        say('Błąd: ' + (e && e.message || e));
      }).then(function () {
        busy = false; ctl = null;
        progressBox.classList.add('scan-hidden');
        [pickBtn, camBtn].forEach(function (b) { b.disabled = false; });
      });
    }

    /* ---- elementy listy ---- */
    function addItem(r) {
      var it = {
        id: ++seq, file: r.file, previewUrl: r.previewUrl, draft: r.draft, rawText: r.rawText, error: r.error,
        selected: !r.error, dup: null, decision: null, el: null, refs: {}
      };
      var c = it.draft.confidence || { name: 1, company: 1, email: 1, phone: 1 };
      it.low = {
        firstName: !r.error && c.name < 0.6, lastName: !r.error && c.name < 0.6,
        company: !r.error && c.company < 0.6, emails: !r.error && c.email < 0.6, phones: !r.error && c.phone < 0.6
      };
      items.push(it);
      it.el = buildCard(it);
      listEl.appendChild(it.el);
      refreshDup();
      updateBar();
      return it;
    }

    function removeItem(it) {
      var i = items.indexOf(it);
      if (i < 0) return;
      items.splice(i, 1);
      if (it.previewUrl) { try { URL.revokeObjectURL(it.previewUrl); } catch (e) { /* */ } }
      var next = items[i] || items[i - 1];
      it.el.remove();
      refreshDup();
      updateBar();
      if (next && next.el) { var f = next.el.querySelector('input,button'); if (f) f.focus(); }
    }

    function refreshDup() {
      var ex = existing();
      items.forEach(function (it, idx) {
        var pool = ex.concat(items.slice(0, idx).filter(function (o) { return o.decision !== 'skip'; }).map(function (o) { return o.draft; }));
        var d = it.error ? null : findDuplicate(it.draft, pool);
        var changed = (!!d) !== (!!it.dup) || (d && it.dup && d.reason !== it.dup.reason);
        it.dup = d;
        if (changed && d) { it.decision = null; it.selected = false; if (it.refs.check) it.refs.check.checked = false; }
        if (changed && !d) { it.decision = null; if (!it.error) { it.selected = true; if (it.refs.check) it.refs.check.checked = true; } }
        renderDup(it);
      });
      updateBar();
    }

    function renderDup(it) {
      var box = it.refs.dup;
      if (!box) return;
      box.innerHTML = '';
      it.el.classList.toggle('scan-card--dup', !!it.dup);
      it.el.classList.toggle('scan-card--skipped', it.decision === 'skip');
      if (!it.dup) { box.classList.add('scan-hidden'); return; }
      box.classList.remove('scan-hidden');
      var c = it.dup.contact;
      var who = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || c.emails && c.emails[0] || 'istniejący kontakt';
      box.appendChild(h('span', { class: 'scan-badge', text: 'Możliwy duplikat' }));
      box.appendChild(h('span', { class: 'scan-dup-text', text: ' ' + who + ' (' + it.dup.reason + ')' }));
      if (it.decision === 'add') box.appendChild(h('span', { class: 'scan-dup-text', text: ' – zostanie dodany mimo to.' }));
      if (it.decision === 'skip') box.appendChild(h('span', { class: 'scan-dup-text', text: ' – pominięty.' }));
      var acts = h('div', { class: 'scan-actions' });
      acts.appendChild(h('button', { type: 'button', class: 'scan-btn scan-btn--small', text: 'Pomiń', onclick: function () {
        it.decision = 'skip'; it.selected = false; it.refs.check.checked = false; renderDup(it); updateBar();
      } }));
      acts.appendChild(h('button', { type: 'button', class: 'scan-btn scan-btn--small', text: 'Dodaj mimo to', onclick: function () {
        it.decision = 'add'; it.selected = true; it.refs.check.checked = true; renderDup(it); updateBar();
      } }));
      box.appendChild(acts);
    }

    function buildCard(it) {
      var d = it.draft, n = it.id;
      function fid(k) { return idp + '-' + n + '-' + k; }

      function textField(key, label, opts2) {
        opts2 = opts2 || {};
        var isList = !!opts2.list;
        var val = isList ? (d[key] || []).join(', ') : (d[key] || '');
        var input = opts2.multiline
          ? h('textarea', { id: fid(key), class: 'scan-input', rows: '3', value: val })
          : h('input', { id: fid(key), class: 'scan-input', type: opts2.type || 'text', value: val, autocomplete: 'off' });
        if (!opts2.multiline) input.value = val; else input.value = val;
        var wrap = h('div', { class: 'scan-field' + (opts2.wide ? ' scan-field--wide' : '') + (it.low[key] ? ' scan-field--low' : '') }, [
          h('label', { class: 'scan-label', for: fid(key), text: label }),
          input,
          it.low[key] ? h('span', { class: 'scan-hint', text: 'Niska pewność – sprawdź to pole' }) : null
        ]);
        input.addEventListener('input', function () {
          d[key] = isList ? splitList(input.value) : input.value;
          if (it.low[key]) {
            it.low[key] = false; wrap.classList.remove('scan-field--low');
            var hint = wrap.querySelector('.scan-hint'); if (hint) hint.remove();
          }
        });
        if (/^(firstName|lastName|emails|phones)$/.test(key)) input.addEventListener('change', refreshDup);
        return wrap;
      }
      function selectField(key, label, options) {
        var sel = h('select', { id: fid(key), class: 'scan-input' }, options.map(function (o) {
          var opt = h('option', { value: o[0], text: o[1] });
          if ((d[key] || '') === o[0]) opt.selected = true;
          return opt;
        }));
        sel.addEventListener('change', function () { d[key] = sel.value; });
        return h('div', { class: 'scan-field' }, [h('label', { class: 'scan-label', for: fid(key), text: label }), sel]);
      }

      var check = h('input', { type: 'checkbox', id: fid('sel'), class: 'scan-check' });
      check.checked = it.selected;
      check.addEventListener('change', function () {
        it.selected = check.checked;
        if (it.dup && check.checked && it.decision !== 'add') { it.decision = 'add'; }
        renderDup(it); updateBar();
      });
      it.refs.check = check;
      var dupBox = h('div', { class: 'scan-dup scan-hidden', role: 'group', 'aria-label': 'Możliwy duplikat' });
      it.refs.dup = dupBox;

      var title = (d.firstName || d.lastName) ? [d.firstName, d.lastName].filter(Boolean).join(' ') : (d.company || (it.file && it.file.name) || 'Nowy kontakt');
      var head = h('div', { class: 'scan-card-head' }, [
        h('label', { class: 'scan-selectlabel', for: fid('sel') }, [check, h('span', { text: ' Zapisz: ' + title })]),
        h('button', { type: 'button', class: 'scan-btn scan-btn--ghost scan-btn--small', text: 'Odrzuć', 'aria-label': 'Odrzuć wynik: ' + title, onclick: function () { removeItem(it); say('Odrzucono: ' + title); } })
      ]);

      var thumb = h('figure', { class: 'scan-thumb' });
      if (it.previewUrl) thumb.appendChild(h('img', { src: it.previewUrl, alt: 'Podgląd zeskanowanej wizytówki' + (it.file ? ' – ' + it.file.name : '') }));
      else thumb.appendChild(h('div', { class: 'scan-thumb-empty', text: it.file ? 'Plik: ' + it.file.name : 'Wklejony tekst' }));
      if (it.rawText && it.previewUrl) {
        thumb.appendChild(h('details', { class: 'scan-raw' }, [h('summary', { text: 'Rozpoznany tekst' }), h('pre', { text: it.rawText })]));
      }

      var fields = h('div', { class: 'scan-fields' }, [
        textField('firstName', 'Imię'), textField('lastName', 'Nazwisko'),
        textField('company', 'Firma'), textField('title', 'Stanowisko'),
        textField('emails', 'E-maile (po przecinku)', { list: true, type: 'text' }),
        textField('phones', 'Telefony (po przecinku)', { list: true }),
        textField('website', 'WWW'), textField('city', 'Miasto'),
        textField('tags', 'Tagi (po przecinku)', { list: true }),
        selectField('relation', 'Relacja', [['', '—'], ['Znajomy / Klient', 'Znajomy / Klient'], ['Znajomy / Partner biznesowy', 'Znajomy / Partner biznesowy']]),
        selectField('scale', 'Skala firmy', [['', '—'], ['Duża firma', 'Duża firma'], ['Średnia firma', 'Średnia firma'], ['Mała firma', 'Mała firma']]),
        textField('notes', 'Notatki', { multiline: true, wide: true })
      ]);

      var body = h('div', { class: 'scan-card-body' }, [thumb, h('div', { class: 'scan-card-main' }, [
        it.error ? h('p', { class: 'scan-error', role: 'alert', text: 'Nie udało się odczytać: ' + it.error + ' Możesz uzupełnić dane ręcznie lub odrzucić.' }) : null,
        fields
      ])]);
      return h('article', { class: 'scan-card' + (it.error ? ' scan-card--error' : ''), 'aria-label': 'Wizytówka: ' + title }, [head, dupBox, body]);
    }

    /* ---- zapis ---- */
    function save(next) {
      var toSave = items.filter(isSavable).filter(function (it) {
        var d = it.draft;
        return d.firstName || d.lastName || d.company || (d.emails && d.emails.length) || (d.phones && d.phones.length);
      });
      if (!toSave.length) { say('Brak kontaktów do zapisania (zaznacz kontakty i uzupełnij dane; duplikaty wymagają decyzji).'); return; }
      var contacts = toSave.map(function (it) { return finalizeContact(it.draft); });
      try {
        if (options.onSave) options.onSave(contacts);
      } catch (e) {
        say('Nie udało się zapisać: ' + (e && e.message || e));
        return;
      }
      toSave.forEach(removeItem);
      say('Zapisano kontaktów: ' + contacts.length + '.');
      if (next) camInput.click(); else (items.length ? saveBtn : zone).focus();
    }

    updateBar();
    return {
      destroy: function () { if (ctl) ctl.abort(); items.slice().forEach(removeItem); rootEl.innerHTML = ''; rootEl.classList.remove('scan'); },
      addText: function (t) { pasteArea.value = t; pasteBtn.click(); }
    };
  }

  /* ------------------------------------------------------------------ */

  var api = {
    parseCardText: parseCardText,
    parseVCard: parseVCard,
    parseMeCard: parseMeCard,
    scanFiles: scanFiles,
    mount: mount,
    terminate: terminate,
    // pomocnicze (czyste)
    normalizePhone: normalizePhone,
    findDuplicate: findDuplicate,
    finalizeContact: finalizeContact
  };

  if (typeof window !== 'undefined') window.BNIScan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
