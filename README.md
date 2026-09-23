# Dzwonek 🔔

Prywatny, polskojęzyczny plan lekcji dla jednej rodziny. FastAPI + interfejs bez frameworka + PWA. Integracja z [librus-apix](https://github.com/RustySnek/librus-apix), przypięta do konkretnego commita.

## Funkcje

- Do 8 niezależnych kont Librus Synergia, każde z imieniem, kolorem, emotką lub zdjęciem.
- Wspólny tydzień, chronologiczny dzień i kolumny dzieci obok siebie. Filtrowanie pojedynczego dziecka.
- Zastępstwa, odwołania i szczegóły lekcji. Nawigacja po tygodniach; weekendy pojawiają się, jeśli są zajęcia.
- Responsywny interfejs, manifest, ikony i service worker; instalacja na ekranie iPhone’a.
- Oddzielne, fikcyjne dane demonstracyjne przed zalogowaniem. Puste konto po pierwszym logowaniu.
- Hasło rodzinne, sesje HttpOnly, ochrona CSRF i ograniczenie prób logowania.
- Szyfrowanie Fernet danych logowania i zapisanych planów. Zdjęcia przetwarzane do JPEG 256 px bez metadanych.
- Ostatni pobrany plan pozostaje dostępny przy awarii Librusa, z datą aktualizacji i ostrzeżeniem. Cache na serwerze: 5 minut, ręczne odświeżenie: minimum 60 sekund.

## Railway

1. Utwórz usługę z tego repozytorium. Railway wykrywa `Dockerfile`; konfiguracja jest w `railway.json`.
2. **Przed pierwszym użyciem podłącz Volume w `/data`.** Bez woluminu konta i sesje zostaną utracone po ponownym wdrożeniu.
3. Ustaw zmienne:

| Zmienna | Wartość |
| --- | --- |
| `APP_PASSWORD` | Losowe, unikalne hasło rodzinne, co najmniej 12 znaków |
| `ENCRYPTION_KEY` | Klucz Fernet, generowany poleceniem poniżej |
| `DATA_DIR` | `/data` |
| `COOKIE_SECURE` | `true` |

```sh
python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'
```

4. Wygeneruj domenę Railway HTTPS. Port jest pobierany automatycznie ze zmiennej `PORT`.
5. Otwórz stronę, wybierz „Połącz swoją rodzinę”, wpisz hasło rodzinne i dodaj dzieci.

Jedna instancja i jeden worker są celowe: SQLite na woluminie oraz blokada odświeżania chronią spójność. Nie zwiększaj liczby replik bez migracji bazy i blokad do usług współdzielonych. Healthcheck: `/api/health`.

Zachowaj bezpieczną kopię `ENCRYPTION_KEY` i ustaw kopie zapasowe woluminu w Railway. Zmiana klucza bez migracji uniemożliwi odczyt zapisanych kont i planów. Usunięcie profilu usuwa bieżące dane z bazy, ale starsze kopie zapasowe podlegają retencji Railway. Projekt jest przeznaczony dla jednej rodziny; wspólne hasło daje wszystkim zalogowanym dostęp do wszystkich profili. Wylogowanie unieważnia bieżącą sesję; sama zmiana hasła rodzinnego nie usuwa innych istniejących sesji.

## iPhone

Otwórz adres w Safari → Udostępnij → **Dodaj do ekranu początkowego** → Dodaj. Aplikacja otwiera się jako osobne okno. PWA może wymagać ponownego zalogowania. Powłoka uruchamia się bez internetu, ale prywatne plany nie są zapisywane w przeglądarce: po ponownym uruchomieniu offline wymagane jest połączenie. Podczas działania aplikacji ostatnio wyświetlony plan pozostaje w pamięci do zamknięcia karty lub wylogowania.

## Lokalnie

Wymagany Python 3.12. Polecenia uruchamiaj z katalogu projektu.

```sh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
export COOKIE_SECURE=false
export APP_PASSWORD='lokalne-haslo-minimum-12-znakow'
export ENCRYPTION_KEY="$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
uvicorn app.main:app --reload
```

Dla trwałych danych lokalnych zachowaj wygenerowany klucz między uruchomieniami. Plik `.env` nie jest automatycznie ładowany: wyeksportuj zmienne lub użyj menedżera środowiska. Bez hasła i klucza działa wyłącznie podgląd demonstracyjny.

```sh
python -m pytest -q
node --check app/static/app.js
```

`tests/test_app.py` testuje uprawnienia, CSRF, limity logowania, szyfrowanie, profile, izolację klientów i tygodni, zdjęcia, PWA i niepełne awarie Librusa. `scripts/browser-test.cjs` sprawdza widok demonstracyjny w Chromium, desktop i emulację iPhone’a (przy działającym serwerze `127.0.0.1:8000`). Narzędzia przeglądarkowe instalowane są oddzielnie; ustaw `PLAYWRIGHT_MODULE`, jeśli moduł jest w innej lokalizacji.

## Integracja i ograniczenia

`librus-apix` jest nieoficjalną biblioteką odczytującą strony Synergii. Zmiany logowania, 2FA lub układu Librusa mogą wymagać aktualizacji integracji. Podaj login do konkretnego konta Synergia dla każdego dziecka. Aplikacja nie przełącza uczniów pod jednym zbiorczym kontem portalu Rodzina. Dane logowania są sprawdzane przez pobranie planu przed zapisaniem profilu. Po błędzie edytuj profil, aby zaktualizować hasło. Brak planu nie jest zastępowany danymi demonstracyjnymi.

Testy korzystają z kontrolowanych danych; końcowe sprawdzenie rzeczywistego połączenia wymaga konta Librus użytkownika. Sposób logowania i dane wyjściowe adaptera odpowiadają przypiętej wersji biblioteki.

## Licencja

GPL-3.0-or-later. Biblioteka `librus-apix` korzysta z GPL-3.0; jej kod nie jest kopiowany do tego repozytorium i instalowany jest jako zależność. Zobacz `LICENSE` i `NOTICE`.
