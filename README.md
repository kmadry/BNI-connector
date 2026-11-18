# Referra

Statyczna aplikacja (bez budowania) do tworzenia rozszerzonych, składanych wizytówek (format BNI)
(awers z danymi, 8 pytań 1:1, listy TOP 20 kontaktów oferowanych i poszukiwanych)
oraz do łączenia wizytówek między sobą (podpowiedzi dopasowań + mapa połączeń).

Uruchomienie: otwórz `index.html` (lub `python3 -m http.server`). Dane są w localStorage;
eksport/import JSON, link do udostępnienia wizytówki i druk/PDF z zakładki „Podgląd / druk”.

## Status i ograniczenia (prototyp)

- Aplikacja jest **publicznym prototypem bez logowania**. Baza Supabase ma otwarte polityki RLS dla roli `anon`,
  więc każdy, kto zna adres, może dane odczytać, zmienić lub skasować.
- **Wpisuj wyłącznie dane fikcyjne.** Przed użyciem prawdziwych danych wymagane są: Supabase Auth, RLS per właściciel
  (patrz raport bezpieczeństwa), klauzula informacyjna RODO i polityka retencji.
- Rozpoznawanie wizytówek (OCR) działa lokalnie w przeglądarce; zdjęcia nie są wysyłane na serwer.
  Silnik Tesseract ładuje się z CDN (skrypt zabezpieczony SRI, hosty ograniczone przez CSP w `vercel.json`).
- Testy: `node tests/scan.test.mjs` (parser) oraz `NODE_PATH=$(npm root -g) node tests/e2e.js` (E2E, Playwright;
  uruchamia się na prawdziwej bazie i dopisuje fikcyjne kontakty).
