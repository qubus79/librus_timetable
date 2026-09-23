"""Small adapter around the pinned librus-apix API. No credentials in logs."""
from datetime import datetime
from requests import Session
from requests.cookies import RequestsCookieJar
from librus_apix.client import Client, Token
from librus_apix.student_information import get_student_information
from librus_apix.timetable import get_timetable


class TimeoutSession(Session):
    def request(self, method, url, **kwargs):
        kwargs.setdefault('timeout', (8, 20))
        return super().request(method, url, **kwargs)


def fetch_timetable(username: str, password: str, monday: str) -> list[dict]:
    return fetch_account(username, password, monday, with_name=False)['lessons']


def fetch_account(username: str, password: str, monday: str, with_name: bool = True) -> dict:
    # Upstream has mutable default cookie/token arguments. Always isolate children.
    client = Client(token=Token(), extra_cookies=RequestsCookieJar(), proxy={})
    client._session = TimeoutSession()
    try:
        client.get_token(username, password)
        lessons = normalize(get_timetable(client, datetime.strptime(monday, '%Y-%m-%d')))
        name = ''
        if with_name:
            try:
                name = get_student_information(client).name.split()[0]
            except Exception:
                pass  # The name is a convenience; the timetable already proved the login.
        return {'name': name, 'lessons': lessons}
    finally:
        client._session.close()


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
