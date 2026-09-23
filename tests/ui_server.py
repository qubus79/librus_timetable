"""Local-only browser test server. Uses a temporary DB and fake Librus data."""
import os
import tempfile
from cryptography.fernet import Fernet
os.environ.update(DATA_DIR=tempfile.mkdtemp(prefix='dzwonek-ui-'), APP_PASSWORD='browser-test-password', ENCRYPTION_KEY=Fernet.generate_key().decode(), COOKIE_SECURE='false')
from app import main

def fake_fetch(username, password, week):
    if password=='incorrect':
        raise RuntimeError('invalid credentials')
    return [dict(date=week,start='08:00',end='08:45',number=1,subject='Matematyka',details='Sala 24',status='regular',note='')]
main.fetch_timetable=fake_fetch
if __name__=='__main__':
    import uvicorn
    uvicorn.run(main.app, host='127.0.0.1', port=8001, access_log=False)
