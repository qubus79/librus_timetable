"""Small adapter around the pinned librus-apix API. No credentials in logs."""
import html
import logging
import re
import time
from contextlib import contextmanager
from datetime import datetime
from requests import Session
from requests.cookies import RequestsCookieJar
from librus_apix.client import Client, Token
from librus_apix.exceptions import ParseError
from librus_apix.grades import get_grades
from librus_apix.student_information import get_student_information
from librus_apix.timetable import get_timetable

log = logging.getLogger('dzwonek.librus')


class TimeoutSession(Session):
    def request(self, method, url, **kwargs):
        kwargs.setdefault('timeout', (8, 20))
        return super().request(method, url, **kwargs)


def fetch_timetable(username: str, password: str, monday: str) -> list[dict]:
    return fetch_account(username, password, monday, with_name=False)['lessons']


@contextmanager
def librus_session(username: str, password: str, what: str):
    """Logged-in, isolated client. Failures are logged without secrets and re-raised."""
    # Upstream has mutable default cookie/token arguments. Always isolate children.
    client = Client(token=Token(), extra_cookies=RequestsCookieJar(), proxy={})
    client._session = TimeoutSession()
    step, started = {'name': 'login'}, time.monotonic()
    try:
        client.get_token(username, password)
        step['name'] = what
        yield client
    except Exception as exc:
        # Diagnostics without secrets: the exception type, the step and Librus' own message.
        detail = str(exc)[:200].replace(password, '***').replace(username, '***') if password and username else ''
        log.warning('Librus %s failed after %.1fs: %s %s', step['name'], time.monotonic() - started, type(exc).__name__, detail)
        raise
    finally:
        client._session.close()


def fetch_account(username: str, password: str, monday: str, with_name: bool = True) -> dict:
    with librus_session(username, password, 'timetable') as client:
        lessons = normalize(get_timetable(client, datetime.strptime(monday, '%Y-%m-%d')))
        name = ''
        if with_name:
            try:
                name = get_student_information(client).name.split()[0]
            except Exception:
                pass  # The name is a convenience; the timetable already proved the login.
        return {'name': name, 'lessons': lessons}


def fetch_grades(username: str, password: str) -> dict:
    with librus_session(username, password, 'grades') as client:
        try:
            numeric, averages, descriptive = get_grades(client, 'all')
        except ParseError:
            # Librus renders no grade table at all before the first grade of the year.
            return {'subjects': []}
        return {'subjects': normalize_grades(numeric, averages, descriptive)}


# Fields already shown separately; the remaining lines of Librus' tooltip become the comment.
KNOWN_FIELDS = ('Ocena', 'Przedmiot', 'Kategoria', 'Data', 'Nauczyciel', 'Waga', 'Licz do średniej', 'Dodał', 'Ocena poprawiona')


def comment_from(desc: str) -> str:
    lines = []
    for line in re.sub(r'<[^>]+>', '\n', desc or '').splitlines():
        line = html.unescape(line).strip()
        if line and not line.startswith(KNOWN_FIELDS):
            lines.append(line.removeprefix('Komentarz:').strip())
    return '\n'.join(filter(None, lines))


def normalize_grades(numeric, averages, descriptive) -> list[dict]:
    subjects: dict[str, dict] = {}

    def subject(name):
        return subjects.setdefault(name, {'name': name, 'average': {'1': '', '2': '', 'year': ''}, 'grades': [], 'descriptive': []})

    for semester in numeric:
        for name, grades in semester.items():
            entry = subject(name)
            for g in grades:
                entry['grades'].append(dict(grade=g.grade.strip(), date=g.date, category=g.category, teacher=g.teacher,
                                            weight=g.weight, counts=bool(g.counts), semester=g.semester,
                                            comment=comment_from(g.desc)))
    for name, gpas in averages.items():
        entry = subject(name)
        for gpa in gpas:
            value = str(gpa.gpa).strip()
            entry['average']['year' if gpa.semester == 0 else str(gpa.semester)] = '' if value in {'-', '0.0', '0'} else value
    for semester in descriptive:
        for name, grades in semester.items():
            entry = subject(name)
            for g in grades:
                entry['descriptive'].append(dict(grade=g.grade.strip(), date=g.date, teacher=g.teacher,
                                                 semester=g.semester, comment=comment_from(g.desc)))
    for entry in subjects.values():
        entry['grades'].sort(key=lambda g: g['date'])
        entry['descriptive'].sort(key=lambda g: g['date'])
    return [e for e in subjects.values() if e['grades'] or e['descriptive'] or any(e['average'].values())]


def normalize(days) -> list[dict]:
    lessons = []
    for day in days:
        for period in day:
            if not period.subject:
                continue
            info = period.info or {}
            status = 'regular'
            subject, teacher = period.subject, period.teacher_and_classroom
            notes = []
            for label, details in info.items():
                notes.append(str(label))
                if 'odwoł' in label.lower() or 'odwol' in label.lower():
                    status = 'cancelled'
                elif status != 'cancelled':
                    status = 'changed'
                if isinstance(details, dict):
                    subject = details.get('subject_swap') or subject
                    changed = [details.get('teacher_swap'), details.get('classroom_swap')]
                    if any(changed):
                        teacher = ' · '.join(filter(None, changed))
            lessons.append(dict(date=period.date, start=period.date_from[:5],
                                end=period.date_to[:5], number=period.number,
                                subject=subject, details=teacher, status=status,
                                note=' · '.join(notes)))
    return sorted(lessons, key=lambda p: (p['date'], p['start'], p['number']))
