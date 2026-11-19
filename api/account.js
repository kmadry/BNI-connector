// POST /api/account  (Authorization: Bearer <token>)  → usuwa konto i, kaskadowo, wszystkie dane użytkownika (art. 17 RODO).
// Wymaga zmiennej środowiskowej SUPABASE_SERVICE_ROLE_KEY (klucz serwisowy, tylko po stronie serwera).
const { send, fail } = require('./_lib/card.js');
const SB = process.env.SUPABASE_URL || 'https://pcokxvhnouzskiwictxy.supabase.co';
const ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_X6TBn1y2PNiCHc8ZUEaJHQ_N75-w0Pa';
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'Metoda niedozwolona.' });
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); if (!m) return send(res, 401, { error: 'Zaloguj się.' });
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const u = await fetch(SB + '/auth/v1/user', { headers: { apikey: ANON, Authorization: 'Bearer ' + m[1] } });
    if (!u.ok) return send(res, 401, { error: 'Sesja wygasła. Zaloguj się ponownie.' });
    if (!svc) { // bez klucza serwisowego usuwamy przynajmniej wszystkie dane użytkownika (jego tokenem, w granicach RLS)
      for (const t of ['bni_links', 'bni_cards', 'bni_contacts', 'bni_settings']) await fetch(SB + '/rest/v1/' + t + '?id=not.is.null', { method: 'DELETE', headers: { apikey: ANON, Authorization: 'Bearer ' + m[1] } });
      return send(res, 200, { ok: true, partial: true });
    }
    const id = (await u.json()).id; if (!/^[0-9a-f-]{36}$/i.test(id || '')) return send(res, 400, { error: 'Zły użytkownik.' });
    const d = await fetch(SB + '/auth/v1/admin/users/' + id, { method: 'DELETE', headers: { apikey: svc, Authorization: 'Bearer ' + svc } });
    if (!d.ok) return send(res, 502, { error: 'Nie udało się usunąć konta. Spróbuj ponownie lub napisz do nas.' });
    send(res, 200, { ok: true });
  } catch (e) { fail(res, e); }
};
