# Dzwonek 🔔

Prywatny, polskojęzyczny plan lekcji dla jednej rodziny. FastAPI + interfejs bez frameworka + PWA. Integracja z [librus-apix](https://github.com/RustySnek/librus-apix), przypięta do konkretnego commita.

## Funkcje

- Logowanie kontem Librus Synergia — jednorazowo na urządzeniu. Sesja trwa 400 dni i odnawia się przy każdym otwarciu aplikacji.
- Pierwsze logowanie zakłada aplikację i dodaje to konto. Później zalogować się może tylko konto już dodane w zakładce „Konta”.
- Do 8 kont (np. każde dziecko osobno), z imieniem pobieranym z Librusa, kolorem i opcjonalnym zdjęciem.
- Widoki: tydzień, dzień i kolumny (konta obok siebie). Filtrowanie jednego ucznia.
- Zastępstwa, odwołania i szczegóły lekcji. Nawigacja po tygodniach; weekendy pojawiają się, jeśli są zajęcia.
- Motyw jasny, ciemny lub systemowy. Responsywny interfejs i PWA.
- Sesje HttpOnly, ochrona CSRF i ograniczenie prób logowania.
- Szyfrowanie Fernet danych logowania i zapisanych planów. Zdjęcia przetwarzane do JPEG 256 px bez metadanych.
- Ostatni pobrany plan pozostaje dostępny przy awarii Librusa. Cache na serwerze: 5 minut, ręczne odświeżenie: minimum 60 sekund.

## Railway

1. Utwórz usługę z tego repozytorium. Railway wykrywa `Dockerfile`; konfiguracja jest w `railway.json`.
2. **Przed pierwszym użyciem podłącz Volume w `/data`.** Bez woluminu konta i sesje zostaną utracone po ponownym wdrożeniu.
3. Ustaw zmienne:

| Zmienna | Wartość |
| --- | --- |
| `ENCRYPTION_KEY` | Klucz Fernet, generowany poleceniem poniżej |
| `DATA_DIR` | `/data` |
| `COOKIE_SECURE` | `true` |

```sh
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

4. Wygeneruj domenę Railway HTTPS. Port jest pobierany automatycznie ze zmiennej `PORT`.
5. Otwórz stronę i **od razu** zaloguj się kontem Librus Synergia — pierwsze logowanie przypisuje aplikację do tego konta. Kolejne konta dodasz w zakładce „Konta”.

Jedna instancja i jeden worker są celowe: SQLite na woluminie oraz blokada odświeżania chronią spójność. Nie zwiększaj liczby replik bez migracji bazy i blokad do usług współdzielonych. Healthcheck: `/api/health`.

Zachowaj bezpieczną kopię `ENCRYPTION_KEY` i ustaw kopie zapasowe woluminu w Railway. Zmiana klucza bez migracji uniemożliwi odczyt zapisanych kont i planów. Usunięcie profilu usuwa bieżące dane z bazy, ale starsze kopie zapasowe podlegają retencji Railway. Projekt jest przeznaczony dla jednej rodziny: logowanie dowolnym dodanym kontem daje dostęp do wszystkich kont. Jeśli hasło w Librusie się zmieni, zaloguj się nowym — aplikacja sprawdzi je w Librusie i zapamięta. Usunięcie wszystkich kont zwalnia aplikację — następne logowanie dowolnym kontem Librus przypisze ją ponownie. Wylogowanie unieważnia bieżącą sesję.

## iPhone

Safari → Udostępnij → **Dodaj do ekranu początkowego**. Prywatne plany nie są zapisywane w przeglądarce; bez internetu otwiera się tylko sama aplikacja.

## Lokalnie

Wymagany Python 3.12. Polecenia uruchamiaj z katalogu projektu.

```sh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
export COOKIE_SECURE=false
export ENCRYPTION_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
uvicorn app.main:app --reload
```

Dla trwałych danych lokalnych zachowaj wygenerowany klucz między uruchomieniami. Plik `.env` nie jest automatycznie ładowany: wyeksportuj zmienne lub użyj menedżera środowiska. Bez klucza logowanie jest wyłączone.

```sh
python -m pytest -q
node --check app/static/app.js
```

`tests/test_app.py` testuje logowanie kontem Librus, uprawnienia, CSRF, limity logowania, szyfrowanie, konta, izolację klientów i tygodni, zdjęcia, PWA i niepełne awarie Librusa. `scripts/browser-test.cjs` przechodzi logowanie, widoki, motywy i emulację iPhone’a w Chromium przy działającym `python -m tests.ui_server` (fikcyjne dane, port 8001). Ustaw `PLAYWRIGHT_MODULE`, jeśli moduł jest w innej lokalizacji.

## Integracja i ograniczenia

`librus-apix` jest nieoficjalną biblioteką odczytującą strony Synergii. Zmiany logowania, 2FA lub układu Librusa mogą wymagać aktualizacji integracji. Podaj login do konkretnego konta Synergia dla każdego dziecka. Aplikacja nie przełącza uczniów pod jednym zbiorczym kontem portalu Rodzina. Dane logowania są sprawdzane przez pobranie planu przed zapisaniem konta.

Testy korzystają z kontrolowanych danych; końcowe sprawdzenie rzeczywistego połączenia wymaga konta Librus użytkownika. Sposób logowania i dane wyjściowe adaptera odpowiadają przypiętej wersji biblioteki.

## Licencja

GPL-3.0-or-later. Biblioteka `librus-apix` korzysta z GPL-3.0; jej kod nie jest kopiowany do tego repozytorium i instalowany jest jako zależność. Zobacz `LICENSE` i `NOTICE`.
