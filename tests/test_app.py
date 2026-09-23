import importlib
import json
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient


def sample(week, subject='Matematyka'):
    return [dict(date=week,start='08:00',end='08:45',number=1,subject=subject,details='Sala 1',status='regular',note='')]


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setenv('DATA_DIR', str(tmp_path))
    monkeypatch.setenv('ENCRYPTION_KEY', Fernet.generate_key().decode())
    monkeypatch.setenv('COOKIE_SECURE', 'false')
    import app.main as m
    m = importlib.reload(m)
    librus = {'first-user': 'first-pass', 'user-secret': 'pass-secret', 'other-user': 'other-pass'}
    def fake_timetable(u, p, w):
        if librus.get(u) != p:
            raise RuntimeError('invalid credentials')
        return sample(w)
    monkeypatch.setattr(m, 'fetch_timetable', fake_timetable)
    monkeypatch.setattr(m, 'fetch_account', lambda u, p, w: {'name': 'Staś', 'lessons': m.fetch_timetable(u, p, w)})
    m.LIBRUS = librus
    with TestClient(m.app) as client:
        client.headers['X-Dzwonek'] = '1'
        yield client, m


def login(c, username='first-user', password='first-pass'):
    return c.post('/api/login', json={'username': username, 'password': password})


def add(c, name='Ala'):
    return c.post('/api/children',json=dict(name=name,emoji='🦊',color='green',username='user-secret',password='pass-secret'))


def test_auth_and_csrf(setup):
    c,m=setup
    assert c.get('/api/children').status_code==401
    assert login(c,password='wrong').status_code==401
    assert c.post('/api/login',json={'username':'first-user','password':'first-pass'},headers={'Origin':'https://evil.example'}).status_code==403
    assert c.post('/api/login',json={'username':'first-user','password':'first-pass'},headers={'X-Dzwonek':''}).status_code==403
    assert login(c).status_code==200
    assert c.get('/api/children').status_code==200
    assert c.get('/api/children').headers['cache-control']=='no-store'
    cookie=c.cookies.get(m.COOKIE)
    assert c.post('/api/logout').status_code==200
    c.cookies.set(m.COOKIE,cookie)
    assert c.get('/api/children').status_code==401


def test_first_login_claims_and_later_logins(setup):
    c,m=setup
    assert login(c).status_code==200
    children=c.get('/api/children').json()
    assert [x['name'] for x in children]==['Staś']
    assert c.cookies.get(m.COOKIE)
    with m.db() as db:
        expires=db.execute('SELECT expires FROM sessions').fetchone()[0]
    assert expires-__import__('time').time()>399*86400
    assert add(c).status_code==201
    c.post('/api/logout');c.cookies.clear()
    # A valid Librus account that was never added cannot log in once the app is claimed.
    assert login(c,'other-user','other-pass').status_code==401
    assert login(c,'USER-SECRET','pass-secret').status_code==200
    # Changed Librus password is verified upstream and remembered.
    m.LIBRUS['user-secret']='new-pass'
    c.cookies.clear()
    assert login(c,'user-secret','pass-secret').status_code==200
    c.cookies.clear()
    assert login(c,'user-secret','new-pass').status_code==200
    with m.db() as db:
        rows=db.execute('SELECT credentials FROM children').fetchall()
    assert ['user-secret','new-pass'] in [json.loads(m.CIPHER.decrypt(r[0].encode())) for r in rows]
    assert c.get('/api/session').json()=={'authenticated':True,'configured':True}


def test_duplicate_account_and_default_name(setup):
    c,m=setup
    login(c)
    assert c.post('/api/children',json=dict(username='first-user',password='first-pass')).status_code==409
    child=c.post('/api/children',json=dict(username='other-user',password='other-pass'))
    assert child.status_code==201
    assert c.get('/api/children').json()[-1]['name']=='Staś'
    assert c.put('/api/children/'+child.json()['id'],json={'name':' '}).status_code==422


def test_rate_limit(setup):
    c,m=setup
    for _ in range(10):assert login(c,password='wrong').status_code==401
    assert login(c,password='wrong').status_code==429


def test_children_encryption_cache_edit_delete(setup,monkeypatch):
    c,m=setup
    login(c)
    calls=[]
    def fetch(u,p,w):
        calls.append((u,p,w));return sample(w)
    monkeypatch.setattr(m,'fetch_timetable',fetch)
    child_id=add(c).json()['id']
    children=c.get('/api/children').json()
    assert len(children)==2 and 'credentials' not in children[1]
    assert 'pass-secret' not in json.dumps(children)
    with m.db() as db:
        row=db.execute('SELECT * FROM children WHERE id=?',(child_id,)).fetchone()
        assert 'pass-secret' not in row['credentials']
        assert json.loads(m.CIPHER.decrypt(row['credentials'].encode()))==['user-secret','pass-secret']
        payload=db.execute('SELECT payload FROM plans').fetchone()[0]
        assert 'Matematyka' not in payload
    result=c.get('/api/timetable',params={'week':date.today().isoformat()}).json()
    assert result['week']==m.monday_of(date.today())
    assert result['plans'][1]['lessons'][0]['subject']=='Matematyka'
    assert len(calls)==1
    assert c.put('/api/children/'+child_id,json={'name':'Ola','emoji':'🌸','color':'pink'}).status_code==200
    assert c.get('/api/children').json()[1]['name']=='Ola'
    assert c.delete('/api/children/'+child_id).status_code==200
    with m.db() as db:
        assert db.execute('SELECT COUNT(*) FROM plans WHERE child_id=?',(child_id,)).fetchone()[0]==0
    assert [x['name'] for x in c.get('/api/children').json()]==['Staś']


def test_failed_connect_does_not_save_credentials(setup,monkeypatch):
    c,m=setup
    def fail(*args):raise RuntimeError('sensitive-password')
    login(c)
    monkeypatch.setattr(m,'fetch_timetable',fail)
    result=add(c)
    assert result.status_code==502
    assert 'sensitive-password' not in result.text
    assert len(c.get('/api/children').json())==1
    c.cookies.clear()
    result=login(c,'user-secret','pass-secret')
    assert result.status_code==401 and 'sensitive-password' not in result.text


def test_librus_timeout_is_reported_separately(setup,monkeypatch):
    import requests
    c,m=setup
    def slow(*args):raise requests.ReadTimeout('timed out')
    monkeypatch.setattr(m,'fetch_account',slow)
    assert login(c).status_code==504


def test_partial_failure_and_stale_plan(setup,monkeypatch):
    c,m=setup
    monkeypatch.setattr(m,'fetch_timetable',lambda u,p,w:sample(w))
    login(c)
    add(c,'Ala');add(c,'Ola')
    with m.db() as db:db.execute('UPDATE plans SET updated=1')
    calls=[]
    def partial(u,p,w):
        calls.append(1)
        if len(calls)==1:raise RuntimeError('down')
        return sample(w,'Historia')
    monkeypatch.setattr(m,'fetch_timetable',partial)
    result=c.get('/api/timetable',params={'week':date.today().isoformat()}).json()['plans']
    assert result[0]['error'] and result[0]['lessons'][0]['subject']=='Matematyka'
    assert not result[1]['error'] and result[1]['lessons'][0]['subject']=='Historia'


def test_week_isolation(setup,monkeypatch):
    c,m=setup
    monkeypatch.setattr(m,'fetch_timetable',lambda u,p,w:sample(w))
    login(c);add(c)
    future=date.today()+timedelta(days=7)
    def fail(*args):raise RuntimeError()
    monkeypatch.setattr(m,'fetch_timetable',fail)
    result=c.get('/api/timetable',params={'week':future.isoformat()}).json()
    assert result['plans'][0]['lessons']==[]
    assert result['plans'][0]['error']
    assert c.get('/api/timetable?week=wrong').status_code==422
    assert c.get('/api/timetable?week=2039-01-01').status_code==422


def test_validation(setup):
    c,m=setup
    login(c)
    for body in [{'name':' '},{'name':'A','color':'evil'},{'name':'A','photo':'data:image/svg+xml;base64,aaa'}]:
        assert c.post('/api/children',json=body).status_code==422


def test_photo_reencoding(setup):
    import base64,io
    from PIL import Image
    c,m=setup
    image=Image.new('RGB',(500,500),'red')
    buf=io.BytesIO();image.save(buf,format='PNG')
    profile=m.Profile(name='A',photo='data:image/png;base64,'+base64.b64encode(buf.getvalue()).decode())
    assert profile.photo.startswith('data:image/jpeg;base64,')
    decoded=Image.open(io.BytesIO(base64.b64decode(profile.photo.split(',')[1])))
    assert decoded.size==(256,256)


def test_normalize_upstream_shape():
    from app.librus import normalize
    p=SimpleNamespace(subject='Matematyka',teacher_and_classroom='Nauczyciel — sala 7',date='2026-09-21',date_from='08:00',date_to='08:45',number=1,info={'Zastępstwo':{'subject_swap':'Historia','teacher_swap':'Jan','classroom_swap':'12'}})
    empty=SimpleNamespace(subject='')
    data=normalize([[p,empty],[]])
    assert data[0]['subject']=='Historia'
    assert data[0]['details']=='Jan · 12' and data[0]['status']=='changed'
    p.info={'Lekcja odwołana':''}
    assert normalize([[p]])[0]['status']=='cancelled'


def test_static_and_pwa(setup):
    c,m=setup
    assert c.get('/').status_code==200
    assert c.get('/api/health').json()=={'status':'ok'}
    manifest=c.get('/static/manifest.webmanifest').json()
    for icon in manifest['icons']:assert c.get(icon['src']).status_code==200
    assert c.get('/sw.js').headers['service-worker-allowed']=='/'
    assert c.get('/static/style.css').headers['cache-control']=='no-cache'
    assert c.get('/api/session').json()=={'authenticated':False,'configured':True}
    assert 'frame-ancestors' in c.get('/').headers['content-security-policy']


def test_client_isolation(monkeypatch):
    import app.librus as librus
    clients=[]
    def fake_login(self,u,p):
        clients.append(self)
        self.cookies.set('test',u)
    monkeypatch.setattr(librus.Client,'get_token',fake_login)
    monkeypatch.setattr(librus,'get_timetable',lambda client,week:[])
    librus.fetch_timetable('a','b','2026-09-21')
    def broken(client):raise RuntimeError('no info page')
    monkeypatch.setattr(librus,'get_student_information',broken)
    assert librus.fetch_account('c','d','2026-09-21')=={'name':'','lessons':[]}
    assert clients[0].cookies is not clients[1].cookies
    assert clients[0].token is not clients[1].token
    assert clients[0].cookies.get('test')=='a'


def test_key_generated_once_on_data_volume(tmp_path, monkeypatch):
    monkeypatch.setenv('DATA_DIR', str(tmp_path))
    monkeypatch.delenv('ENCRYPTION_KEY', raising=False)
    import app.main as m
    first = importlib.reload(m).load_key()
    assert (tmp_path / 'encryption.key').read_text().strip() == first
    assert importlib.reload(m).load_key() == first
    assert (tmp_path / 'encryption.key').stat().st_mode & 0o077 == 0
