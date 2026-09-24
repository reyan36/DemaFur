"""Create a private local .env with generated household keys. Never overwrites one."""
import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parent
content = (root / '.env.example').read_text()
for name in ('DEMAFUR_API_KEY', 'DEMAFUR_WEBHOOK_SECRET'):
    content = content.replace(name + '=\n', name + '=' + secrets.token_urlsafe(32) + '\n')
fd = os.open(root / '.env', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as handle:
    handle.write(content)
print('Created private .env. Edit it locally to add provider credentials. Do not commit or share it.')
