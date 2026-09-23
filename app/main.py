import base64
import hashlib
import hmac
import io
import json
import os
import secrets
import sqlite3
import threading
import time
from contextlib import asynccontextmanager, contextmanager
from datetime import date, timedelta
from pathlib import Path

from cryptography.fernet import Fernet
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator
from requests import RequestException
from .librus import fetch_account, fetch_timetable

ROOT = Path(__file__).parent
DATA = Path(os.getenv('DATA_DIR', './data'))
SECURE = os.getenv('COOKIE_SECURE', 'true').lower() != 'false'


def load_key():
    # ENCRYPTION_KEY wins; otherwise a key is generated once and kept on the data volume.
    if os.getenv('ENCRYPTION_KEY'):
        return os.environ['ENCRYPTION_KEY']
    path = DATA / 'encryption.key'
    DATA.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as file:
            file.write(Fernet.generate_key().decode())
    except FileExistsError:
        pass
    return path.read_text().strip()


CIPHER = Fernet(load_key().encode())
COOKIE = 'dzwonek_session'
# Log in once per device: sessions last the browser maximum and renew on use.
SESSION_TTL = 400 * 86400
COLORS = {'purple', 'green', 'orange', 'blue', 'pink'}
sync_lock = threading.Lock()


@contextmanager
def db():
    con = sqlite3.connect(DATA / 'dzwonek.sqlite', timeout=30)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


@asynccontextmanager
async def lifespan(app):
    DATA.mkdir(parents=True, exist_ok=True)
    with db() as con:
        con.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS children (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, emoji TEXT NOT NULL,
          color TEXT NOT NULL, photo TEXT NOT NULL, credentials TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS plans (
          child_id TEXT NOT NULL, week TEXT NOT NULL, payload TEXT NOT NULL,
          updated REAL NOT NULL, PRIMARY KEY (child_id, week));
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts (ip TEXT NOT NULL, created REAL NOT NULL);
        ''')
    yield


app = FastAPI(title='Dzwonek', lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def security(request, call_next):
    if request.method not in {'GET', 'HEAD', 'OPTIONS'}:
        # Non-simple header prevents cross-origin form CSRF; CORS is not enabled.
        if request.headers.get('x-dzwonek') != '1':
            return JSONResponse({'detail': 'Odśwież aplikację i spróbuj ponownie.'}, status_code=403)
        origin = request.headers.get('origin')
        # Reverse proxies (Tailscale Serve, Cloudflare Tunnel) may rewrite Host but keep X-Forwarded-Host.
        hosts = {request.headers.get('host'), request.headers.get('x-forwarded-host')}
        if origin and origin.split('://', 1)[-1] not in hosts:
            return JSONResponse({'detail': 'Niedozwolone źródło żądania.'}, status_code=403)
        try:
            if int(request.headers.get('content-length', 0)) > 1_000_000:
                return JSONResponse({'detail': 'Plik jest za duży.'}, status_code=413)
        except ValueError:
            return JSONResponse({'detail': 'Nieprawidłowe żądanie.'}, status_code=400)
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    if request.url.path.startswith('/api/'):
        response.headers['Cache-Control'] = 'no-store'
    if SECURE:
        response.headers['Strict-Transport-Security'] = 'max-age=31536000'
    return response


def configured():
    return CIPHER is not None


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def authorized(request: Request):
    token = request.cookies.get(COOKIE, '')
    with db() as con:
        session = con.execute('SELECT expires FROM sessions WHERE token=?', (digest(token),)).fetchone()
    if not configured() or not session or session['expires'] < time.time():
        raise HTTPException(401, 'Zaloguj się kontem Librus Synergia.')
    return session['expires']


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=512)


class Profile(BaseModel):
    name: str = Field(default='', max_length=40)
    emoji: str = Field(default='🌻', min_length=1, max_length=12)
    color: str = 'purple'
    photo: str = Field(default='', max_length=500_000)
    username: str = Field(default='', max_length=200)
    password: str = Field(default='', max_length=512)

    @field_validator('name')
    @classmethod
    def name_valid(cls, value):
        return value.strip()

    @field_validator('color')
    @classmethod
    def color_valid(cls, value):
        if value not in COLORS:
            raise ValueError('Nieprawidłowy kolor')
        return value

    @field_validator('photo')
    @classmethod
    def photo_valid(cls, value):
        if not value:
            return value
        try:
            prefix, raw = value.split(',', 1)
            if prefix not in {'data:image/jpeg;base64', 'data:image/png;base64', 'data:image/webp;base64'}:
                raise ValueError()
            image = Image.open(io.BytesIO(base64.b64decode(raw, validate=True)))
            if image.width * image.height > 4_000_000:
                raise ValueError()
            image = image.convert('RGB')
            image.thumbnail((256, 256))
            out = io.BytesIO()
            image.save(out, format='JPEG', quality=85)
            return 'data:image/jpeg;base64,' + base64.b64encode(out.getvalue()).decode()
        except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
            raise ValueError('Nieprawidłowe zdjęcie')


def monday_of(value: date):
    return (value - timedelta(days=value.weekday())).isoformat()


def public(row):
    return {k: row[k] for k in ('id', 'name', 'emoji', 'color', 'photo')}


@app.get('/api/health')
def health():
    with db() as con:
        con.execute('SELECT 1')
    return {'status': 'ok'}


def set_session_cookie(response, token):
    response.set_cookie(COOKIE, token, max_age=SESSION_TTL, httponly=True, secure=SECURE, samesite='strict')


@app.get('/api/session')
def session(request: Request, response: Response):
    try:
        expires = authorized(request)
    except HTTPException:
        return {'authenticated': False, 'configured': configured()}
    now = time.time()
    if expires < now + SESSION_TTL - 86400:
        token = request.cookies.get(COOKIE, '')
        with db() as con:
            con.execute('UPDATE sessions SET expires=? WHERE token=?', (now + SESSION_TTL, digest(token)))
        set_session_cookie(response, token)
    return {'authenticated': True, 'configured': True}


def encrypt_credentials(username, password):
    return CIPHER.encrypt(json.dumps([username, password]).encode()).decode()


def credentials(row):
    return json.loads(CIPHER.decrypt(row['credentials'].encode()))


def find_child(rows, username):
    return next((r for r in rows if credentials(r)[0].casefold() == username.casefold()), None)


@app.post('/api/login')
def login(body: Login, request: Request, response: Response):
    if not configured():
        raise HTTPException(503, 'Aplikacja czeka na ustawienie ENCRYPTION_KEY na serwerze.')
    ip = request.client.host if request.client else 'unknown'
    now = time.time()
    with db() as con:
        con.execute('DELETE FROM attempts WHERE created<?', (now - 900,))
        count = con.execute('SELECT COUNT(*) FROM attempts WHERE ip=?', (ip,)).fetchone()[0]
        if count >= 10:
            raise HTTPException(429, 'Zbyt wiele prób. Spróbuj ponownie za 15 minut.')
        con.execute('INSERT INTO attempts VALUES (?,?)', (ip, now))
    username, week = body.username.strip(), monday_of(date.today())
    with sync_lock:
        with db() as con:
            rows = con.execute('SELECT * FROM children ORDER BY rowid').fetchall()
        child = find_child(rows, username)
        if child and not hmac.compare_digest(credentials(child)[1].encode(), body.password.encode()):
            # The Librus password may have changed: accept only what Librus accepts, then remember it.
            try:
                lessons = fetch_timetable(username, body.password, week)
            except Exception as exc:
                raise librus_error(exc, 401)
            with db() as con:
                con.execute('UPDATE children SET credentials=? WHERE id=?', (encrypt_credentials(username, body.password), child['id']))
                save_plan(con, child['id'], week, lessons)
        elif not child and rows:
            # Only accounts already added to this family may log in.
            raise HTTPException(401, 'Nieprawidłowy login lub hasło albo to konto nie zostało dodane do Dzwonka.')
        elif not child:
            # First login claims this instance and creates the first profile.
            try:
                account = fetch_account(username, body.password, week)
            except Exception as exc:
                raise librus_error(exc, 401)
            create_child(Profile(name=account['name'] or 'Uczeń'), username, body.password, week, account['lessons'])
    token = secrets.token_urlsafe(32)
    with db() as con:
        con.execute('DELETE FROM sessions WHERE expires<?', (now,))
        con.execute('DELETE FROM attempts WHERE ip=?', (ip,))
        con.execute('INSERT INTO sessions VALUES (?,?)', (digest(token), now + SESSION_TTL))
    set_session_cookie(response, token)
    return {'ok': True}


@app.post('/api/logout')
def logout(request: Request, response: Response):
    with db() as con:
        con.execute('DELETE FROM sessions WHERE token=?', (digest(request.cookies.get(COOKIE, '')),))
    response.delete_cookie(COOKIE, secure=SECURE, httponly=True, samesite='strict')
    return {'ok': True}


@app.get('/api/children', dependencies=[Depends(authorized)])
def children():
    with db() as con:
        return [public(r) for r in con.execute('SELECT * FROM children ORDER BY rowid')]


def save_plan(con, child_id, week, lessons):
    con.execute('INSERT OR REPLACE INTO plans VALUES (?,?,?,?)',
                (child_id, week, CIPHER.encrypt(json.dumps(lessons).encode()).decode(), time.time()))


def librus_error(exc, status):
    # Never return upstream messages; they may contain sensitive values.
    if isinstance(exc, RequestException):
        return HTTPException(504, 'Librus nie odpowiada serwerowi aplikacji. Spróbuj później; jeśli to się powtarza, sprawdź logi serwera.')
    return HTTPException(status, 'Librus nie przyjął tego loginu i hasła. Użyj loginu do Synergii (np. 1234567u), nie adresu e-mail z portalu Librus Rodzina.')


def connect(username, password, week, fetch=None):
    try:
        return (fetch or fetch_timetable)(username, password, week)
    except Exception as exc:
        raise librus_error(exc, 502)


def create_child(body, username, password, week, lessons):
    child_id = secrets.token_hex(8)
    with db() as con:
        con.execute('INSERT INTO children VALUES (?,?,?,?,?,?)',
                    (child_id, body.name, body.emoji, body.color, body.photo, encrypt_credentials(username, password)))
        save_plan(con, child_id, week, lessons)
    return child_id


@app.post('/api/children', dependencies=[Depends(authorized)], status_code=201)
def add_child(body: Profile):
    username = body.username.strip()
    if not username or not body.password:
        raise HTTPException(422, 'Podaj login i hasło konta Librus Synergia.')
    week = monday_of(date.today())
    with sync_lock:
        with db() as con:
            rows = con.execute('SELECT * FROM children').fetchall()
        if len(rows) >= 8:
            raise HTTPException(400, 'Możesz dodać maksymalnie 8 kont.')
        if find_child(rows, username):
            raise HTTPException(409, 'To konto Librus jest już dodane.')
        account = connect(username, body.password, week, fetch_account)
        body.name = body.name or account['name'] or 'Uczeń'
        child_id = create_child(body, username, body.password, week, account['lessons'])
    return {'id': child_id}


@app.put('/api/children/{child_id}', dependencies=[Depends(authorized)])
def edit_child(child_id: str, body: Profile):
    if not body.name:
        raise HTTPException(422, 'Podaj imię.')
    with sync_lock:
        with db() as con:
            row = con.execute('SELECT * FROM children WHERE id=?', (child_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Nie znaleziono profilu.')
        stored = row['credentials']
        if body.username or body.password:
            if not body.username.strip() or not body.password:
                raise HTTPException(422, 'Aby zmienić konto, podaj login i hasło.')
            with db() as con:
                others = con.execute('SELECT * FROM children WHERE id<>?', (child_id,)).fetchall()
            if find_child(others, body.username.strip()):
                raise HTTPException(409, 'To konto Librus jest już dodane.')
            connect(body.username.strip(), body.password, monday_of(date.today()))
            stored = encrypt_credentials(body.username.strip(), body.password)
        with db() as con:
            con.execute('UPDATE children SET name=?,emoji=?,color=?,photo=?,credentials=? WHERE id=?',
                        (body.name, body.emoji, body.color, body.photo, stored, child_id))
            if body.username:
                con.execute('DELETE FROM plans WHERE child_id=?', (child_id,))
    return {'ok': True}


@app.delete('/api/children/{child_id}', dependencies=[Depends(authorized)])
def delete_child(child_id: str):
    with sync_lock, db() as con:
        con.execute('DELETE FROM children WHERE id=?', (child_id,))
        con.execute('DELETE FROM plans WHERE child_id=?', (child_id,))
    return {'ok': True}


@app.get('/api/timetable', dependencies=[Depends(authorized)])
def timetable(week: date, refresh: bool = False):
    monday = monday_of(week)
    if abs((week - date.today()).days) > 370:
        raise HTTPException(422, 'Wybierz datę w zakresie jednego roku.')
    results = []
    with sync_lock:
        with db() as con:
            rows = con.execute('SELECT * FROM children ORDER BY rowid').fetchall()
        for child in rows:
            with db() as con:
                cached = con.execute('SELECT * FROM plans WHERE child_id=? AND week=?', (child['id'], monday)).fetchone()
            error = None
            # Even explicit refresh is throttled to avoid hammering Librus.
            ttl = 60 if refresh else 300
            if not cached or time.time() - cached['updated'] > ttl:
                try:
                    username, password = credentials(child)
                    lessons = connect(username, password, monday)
                    with db() as con:
                        save_plan(con, child['id'], monday, lessons)
                        cached = con.execute('SELECT * FROM plans WHERE child_id=? AND week=?', (child['id'], monday)).fetchone()
                except Exception:
                    error = 'Librus jest niedostępny lub dane logowania wymagają aktualizacji.'
            results.append({'child': public(child), 'lessons': json.loads(CIPHER.decrypt(cached['payload'].encode())) if cached else [],
                            'updated': cached['updated'] if cached else None, 'error': error})
        with db() as con:
            con.execute('DELETE FROM plans WHERE updated<?', (time.time() - 90 * 86400,))
    return {'week': monday, 'plans': results}


@app.get('/')
def index():
    return FileResponse(ROOT / 'static' / 'index.html', headers={'Cache-Control': 'no-cache'})


@app.get('/sw.js')
def service_worker():
    return FileResponse(ROOT / 'static' / 'sw.js', media_type='application/javascript', headers={'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/'})


app.mount('/static', StaticFiles(directory=ROOT / 'static'), name='static')
