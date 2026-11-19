# Referra: dokumentacja zgodności z RODO (wersja robocza)

To jest wzór do uzupełnienia i przeglądu przez prawnika lub inspektora ochrony danych. Pola `[...]` uzupełnia administrator.

## 1. Role
| Dane | Administrator | Podmiot przetwarzający |
|---|---|---|
| Konto, wizytówka użytkownika, ustawienia, anonimowy identyfikator gościa | Referra ([NAZWA]) | Supabase, Vercel, dostawca e-mail |
| Kontakty i skany wizytówek innych osób | użytkownik | Referra (umowa powierzenia w Regulaminie, pkt 5) |

## 2. Rejestr czynności przetwarzania (art. 30)
| Czynność | Kategorie osób | Kategorie danych | Podstawa | Odbiorcy | Retencja | Zabezpieczenia |
|---|---|---|---|---|---|---|
| Obsługa konta | użytkownicy | e-mail, skrót hasła, identyfikator, znaczniki zgody (terms_at, terms_v) | art. 6(1)(b) | Supabase, dostawca e-mail | do usunięcia konta | szyfrowanie, RLS, hasła hashowane |
| Wizytówki | użytkownicy | dane z wizytówki, listy poleceń, logo | art. 6(1)(b) | Supabase | do usunięcia | RLS, limity wierszy |
| Publiczna strona wizytówki | użytkownicy | dane z wizytówki | art. 6(1)(a) zgoda | każdy, kto zna link | do wyłączenia udostępniania | domyślnie prywatne, funkcja get_public_card tylko dla udostępnionych |
| Kontakty użytkownika | osoby trzecie | dane z wizytówek | użytkownik jako administrator | Supabase | do usunięcia przez użytkownika | RLS, brak dostępu innych użytkowników |
| Tryb gościa | goście | anonimowy identyfikator, wizytówka | art. 6(1)(b) | Supabase | 90 dni nieaktywności | automatyczne czyszczenie (purge_stale_guests) |
| Liczniki zdarzeń | brak danych osobowych | rodzaj zdarzenia, czas | art. 6(1)(f) | Supabase | 1 rok | brak identyfikatorów |
| Logi techniczne | odwiedzający | IP, czas, adres | art. 6(1)(f) | Vercel | [30] dni | zgodnie z ustawieniami Vercel |

## 3. Wstępna ocena skutków (DPIA, screening)
Przetwarzanie nie obejmuje danych szczególnych kategorii, profilowania ani monitorowania na dużą skalę. Główne ryzyka i środki:
- **Publiczna ekspozycja wizytówki:** wyłącznie za zgodą, wyłączenie natychmiastowe, możliwość ukrycia list.
- **Dane osób trzecich w kontaktach:** informacja z art. 14 w Polityce prywatności, umowa powierzenia, pomoc w realizacji praw.
- **Przejęcie konta:** hasło min. 10 znaków, potwierdzenie e-mail, potwierdzenie przy logowaniu z linku, wylogowanie ze wszystkich urządzeń.
- **Wyciek z bazy:** RLS na każdej tabeli, brak dostępu anon do tabel, limity, kopie zapasowe po stronie Supabase.
- **Rozszerzenia (sprawdzanie kontrahentów):** wymaga oddzielnej oceny. Używać tylko oficjalnych rejestrów publicznych na żądanie użytkownika, bez scrapingu mediów społecznościowych.
Wniosek: ryzyko niskie do średniego; pełna DPIA nie jest wymagana, ale ocenę trzeba powtórzyć przy nowych funkcjach (rejestry, baza potwierdzeń, druk na zamówienie).

## 4. Zadania dla administratora przed uruchomieniem
- [ ] Uzupełnić dane administratora, datę i region w `prywatnosc.html` i `regulamin.html`.
- [x] Region Supabase: eu-central-1 (Frankfurt).
- [ ] Zawrzeć lub zaakceptować DPA z Supabase, Vercel i dostawcą e-mail (SCC / DPF).
- [ ] Dodać w Vercelu zmienną `SUPABASE_SERVICE_ROLE_KEY` (tylko jako zmienna środowiskowa, nigdy w kodzie), aby działało usuwanie konta.
- [ ] Włączyć w Supabase: logowanie anonimowe (uwaga: CAPTCHA przy rejestracji zablokuje konta gości, bo aplikacja nie przekazuje tokenu; zostaw wyłączoną albo dodaj obsługę), ochronę przed wyciekłymi hasłami, min. długość hasła 10, Site URL i Redirect URLs.
- [ ] Włączyć pg_cron (Database → Extensions) i potwierdzić, że `purge_stale_guests` jest zaplanowana.
- [ ] Zdecydować, czy potrzebny jest inspektor ochrony danych (zwykle nie dla małej usługi, ale sprawdzić kryteria art. 37).
- [ ] Wyznaczyć adres do próśb osób, których dane dotyczą, i procedurę odpowiedzi w 1 miesiąc.

## 5. Prawa osób: jak je realizujemy
- Dostęp i przenoszenie: Konto → „Pobierz moje dane” (JSON).
- Usunięcie: Konto → „Usuń wszystkie moje dane” lub „Usuń konto”.
- Sprostowanie: edycja w aplikacji.
- Cofnięcie zgody na publiczne udostępnianie: wyłączenie pola „Udostępnij”.
- Dane osób trzecich: żądanie kierowane do użytkownika, a gdy to niemożliwe, do administratora Referry.

## 6. Naruszenia ochrony danych
1. Wykryj i ogranicz (unieważnij sesje: `auth.sessions`, rotacja kluczy, wyłączenie funkcji).
2. Oceń ryzyko dla osób. Zapisz w rejestrze naruszeń: co, kiedy, jakie dane, jakie środki.
3. Zgłoś do UODO w ciągu 72 godzin od stwierdzenia, jeśli istnieje ryzyko naruszenia praw lub wolności.
4. Jeśli ryzyko jest wysokie, powiadom osoby, których dotyczy, bez zbędnej zwłoki.
5. Jako podmiot przetwarzający powiadom administratorów (użytkowników) bez zbędnej zwłoki.

## 7. Zabezpieczenia techniczne (stan na dziś)
HTTPS i HSTS; CSP bez zewnętrznych skryptów i CDN; RLS owner-only na tabelach; funkcja publiczna zwraca tylko udostępnione wizytówki; brak uprawnień anon do tabel; limity liczby wierszy; potwierdzenie logowania z linku; import zawsze prywatny; sanitizacja vCard i mailto; usuwanie konta przez funkcję serwerową; cache QR przypisany do konta; Service Worker bez buforowania zapytań do bazy.
