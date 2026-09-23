"""Generate local production secrets and send them to the linked Railway service."""
import os
import secrets
import subprocess
from pathlib import Path
from cryptography.fernet import Fernet

path = Path('.env.production')
if not path.exists():
    values = {'APP_PASSWORD': secrets.token_urlsafe(18), 'ENCRYPTION_KEY': Fernet.generate_key().decode(), 'DATA_DIR': '/data', 'COOKIE_SECURE': 'true'}
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as file:
        file.write(''.join(f'{key}={value}\n' for key, value in values.items()))
else:
    values = dict(line.split('=', 1) for line in path.read_text().splitlines() if line and not line.startswith('#'))
for key, value in values.items():
    result = subprocess.run(['railway', 'variable', 'set', key, '--stdin', '--skip-deploys'], input=value, text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(f'Failed to configure {key}; values were not printed.')
print('Railway configured. Password and encryption key are saved in the local, git-ignored .env.production file.')
