"""Local-only browser test server. Uses a temporary DB and fake Librus data."""
import os
import tempfile
from datetime import date, timedelta
from cryptography.fernet import Fernet
os.environ.update(DATA_DIR=tempfile.mkdtemp(prefix='dzwonek-ui-'), ENCRYPTION_KEY=Fernet.generate_key().decode(), COOKIE_SECURE='false')
from app import main

SUBJECTS = ['Matematyka', 'Język polski', 'Język angielski', 'Historia', 'Biologia', 'Wychowanie fizyczne']
TIMES = [('08:00', '08:45'), ('08:55', '09:40'), ('09:50', '10:35'), ('10:55', '11:40'), ('11:50', '12:35')]


def fake_fetch(username, password, week):
    if password == 'incorrect':
        raise RuntimeError('invalid credentials')
    monday, offset = date.fromisoformat(week), len(username)
    return [dict(date=(monday + timedelta(days=d)).isoformat(), start=s, end=e, number=n + 1,
                 subject=SUBJECTS[(n + d + offset) % len(SUBJECTS)], details=f'Sala {10 + n + offset}',
                 status='changed' if (d, n) == (2, 1) else 'cancelled' if (d, n) == (3, 4) and offset % 2 else 'regular',
                 note='Zastępstwo' if (d, n) == (2, 1) else '')
            for d in range(5) for n, (s, e) in enumerate(TIMES[:4 + offset % 2])]


main.fetch_timetable = fake_fetch
main.fetch_account = lambda u, p, w: {'name': u.split('.')[0].capitalize(), 'lessons': fake_fetch(u, p, w)}
if __name__ == '__main__':
    import uvicorn
    uvicorn.run(main.app, host='127.0.0.1', port=8001, access_log=False)
