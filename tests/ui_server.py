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
                 subject=SUBJECTS[(n + d + offset) % len(SUBJECTS)], details='Fidos-Kowalewska Renata -> Zieliński Przemysław · 8 -> 20' if (d, n) == (2, 1) else f'Sala {10 + n + offset}',
                 status='changed' if (d, n) == (2, 1) else 'cancelled' if (d, n) == (3, 4) and offset % 2 else 'regular',
                 note='Zastępstwo' if (d, n) == (2, 1) else '')
            for d in range(5) for n, (s, e) in enumerate(TIMES[:4 + offset % 2])]


def fake_grades(username, password):
    if password == 'incorrect':
        raise RuntimeError('invalid credentials')
    today, offset = date.today(), len(username)
    def g(grade, days_ago, category='Sprawdzian', weight=3, counts=True, comment=''):
        return dict(grade=grade, date=(today - timedelta(days=days_ago)).isoformat(), category=category, teacher='Anna Nowak',
                    weight=weight, counts=counts, semester=1, comment=comment)
    subjects = [
        {'name': 'Matematyka', 'average': {'1': '', '2': '', 'year': ''},
         'grades': [g('5', 20), g('4+', 12, 'Kartkówka', 2), g('3-', 6, 'Odpowiedź', 1), g('np', 3, 'Nieprzygotowanie', 0, False)]},
        {'name': 'Język polski', 'average': {'1': '4.60', '2': '', 'year': '4.60'},
         'grades': [g('6', 2, 'Wypracowanie', 3, True, 'Bardzo ciekawa interpretacja wiersza'), g('4', 15)]},
        {'name': 'Historia', 'average': {'1': '', '2': '', 'year': ''}, 'grades': [g('2', 9 + offset), g('1', 30)]},
    ]
    for s in subjects:
        s['descriptive'] = []
    subjects.append({'name': 'Edukacja wczesnoszkolna', 'average': {'1': '', '2': '', 'year': ''}, 'grades': [],
                     'descriptive': [dict(grade='T', date=(today - timedelta(days=4)).isoformat(), teacher='Jolanta M.', semester=1,
                                          comment='Czyta płynnie i ze zrozumieniem, chętnie pracuje w grupie.')]})
    return {'subjects': subjects}


main.fetch_timetable = fake_fetch
main.fetch_grades = fake_grades
main.fetch_account = lambda u, p, w: {'name': u.split('.')[0].capitalize(), 'lessons': fake_fetch(u, p, w)}
if __name__ == '__main__':
    import uvicorn
    uvicorn.run(main.app, host='127.0.0.1', port=8001, access_log=False)
