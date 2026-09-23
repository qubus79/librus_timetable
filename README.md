# Dzwonek 🔔

Prywatny, polskojęzyczny plan lekcji dla jednej rodziny. FastAPI + interfejs bez frameworka + PWA. Integracja z [librus-apix](https://github.com/RustySnek/librus-apix), przypięta do konkretnego commita.

## Funkcje

- Logowanie kontem Librus Synergia — jednorazowo na urządzeniu. Sesja trwa 400 dni i odnawia się przy każdym otwarciu aplikacji.
- Pierwsze logowanie zakłada aplikację i dodaje to konto. Później zalogować się może tylko konto już dodane w zakładce „Konta”.
- Do 8 kont (np. każde dziecko osobno), z imieniem pobieranym z Librusa, kolorem i opcjonalnym zdjęciem.
- Widoki: tydzień, dzień i kolumny (konta obok siebie). Filtrowanie jednego ucznia.
- Zastępstwa, odwołania i szczegóły lekcji. Nawigacja po tygodniach; weekendy pojawiają się, jeśli są zajęcia.
- Motyw jasny, ciemny lub systemowy. Responsywny interfejs i PWA.
- Instalacja na własnym serwerze przez Docker Compose.
- Sesje HttpOnly, ochrona CSRF i ograniczenie prób logowania.
- Szyfrowanie Fernet danych logowania i zapisanych planów. Zdjęcia przetwarzane do JPEG 256 px bez metadanych.
- Ostatni pobrany plan pozostaje dostępny przy awarii Librusa. Cache na serwerze: 5 minut, ręczne odświeżenie: minimum 60 sekund.

## Instalacja w domu (Docker Compose)

Aplikacja musi łączyć się z Librusem z polskiego adresu IP (Librus nie odpowiada serwerom w chmurze), dlatego uruchom ją na domowym serwerze, NAS-ie lub Raspberry Pi (obraz działa na amd64 i arm64).

Wymagania: Docker z wtyczką Compose (`docker compose version`) i git.

Całość — kod, konfiguracja i dane — trzymamy w `/home/docker/librus_plan`:

```sh
sudo mkdir -p /home/docker
sudo chown "$USER" /home/docker
git clone https://github.com/qubus79/librus_timetable.git /home/docker/librus_plan
cd /home/docker/librus_plan
docker compose up -d --build
```

Po pierwszym starcie struktura wygląda tak:

```
/home/docker/librus_plan/
├── docker-compose.yml
├── Dockerfile, app/, …      # kod aplikacji
└── data/                    # wszystkie dane
    ├── dzwonek.sqlite       # konta, sesje, plany (zaszyfrowane)
    └── encryption.key       # klucz szyfrowania
```

Kontener i projekt Compose nazywają się `librus_plan`. Polecenia `docker compose …` uruchamiaj z katalogu `/home/docker/librus_plan`.

Otwórz `http://ADRES-SERWERA:8000` i zaloguj się kontem Librus Synergia (login w stylu `1234567u`, nie e-mail z portalu Librus Rodzina). Pierwsze logowanie przypisuje aplikację do tego konta; kolejne konta dodasz w zakładce „Konta”.

| Co | Polecenie |
| --- | --- |
| Logi | `docker compose logs -f` |
| Aktualizacja | `git pull && docker compose up -d --build` |
| Zatrzymanie | `docker compose down` |
| Stan | `docker compose ps` (STATUS powinien pokazać `healthy`) |

### Dane i kopia zapasowa

Wszystko jest w katalogu `/home/docker/librus_plan/data`:

- `dzwonek.sqlite` — konta, sesje i pobrane plany (zaszyfrowane),
- `encryption.key` — klucz szyfrowania, tworzony automatycznie przy pierwszym starcie.

Kopiuj cały katalog `/home/docker/librus_plan/data` (np. `sudo tar czf librus_plan-$(date +%F).tgz -C /home/docker/librus_plan data`). Bez `encryption.key` zapisanych kont nie da się odczytać. Jeśli wolisz trzymać klucz poza katalogiem danych, ustaw `ENCRYPTION_KEY` w `docker-compose.yml` (wartość z `python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'`).

### Dostęp spoza domu i na iPhonie

W sieci domowej wystarczy `http://ADRES-SERWERA:8000`. Poza domem i do instalacji na ekranie iPhone’a (wymaga HTTPS) najprościej użyć [Tailscale](https://tailscale.com):

```sh
# na serwerze, po zainstalowaniu i zalogowaniu Tailscale
sudo tailscale serve --bg 8000
```

Aplikacja będzie dostępna pod `https://NAZWA-SERWERA.TWOJA-SIEC.ts.net` na każdym urządzeniu z Tailscale. Alternatywa: Cloudflare Tunnel albo własny reverse proxy z certyfikatem. Na iPhonie: Safari → Udostępnij → **Dodaj do ekranu początkowego**.

Gdy aplikacja jest dostępna **wyłącznie** przez HTTPS, ustaw w `docker-compose.yml` `COOKIE_SECURE: "true"` i uruchom `docker compose up -d`. Przy dostępie przez zwykłe `http://` zostaw `false`, inaczej przeglądarka nie zapamięta logowania.

Nie przekierowuj portu 8000 na routerze bezpośrednio do internetu.

### Zasady działania

Jedna instancja i jeden worker są celowe: SQLite oraz blokada odświeżania chronią spójność. Logowanie dowolnym dodanym kontem daje dostęp do wszystkich kont. Jeśli hasło w Librusie się zmieni, zaloguj się nowym — aplikacja sprawdzi je w Librusie i zapamięta. Usunięcie wszystkich kont zwalnia aplikację — następne logowanie dowolnym kontem Librus przypisze ją ponownie. Wylogowanie unieważnia bieżącą sesję.

## Lokalnie

Wymagany Python 3.12. Polecenia uruchamiaj z katalogu projektu.

```sh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
export COOKIE_SECURE=false
uvicorn app.main:app --reload
```

Dane i klucz szyfrowania trafiają do `./data`.

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
