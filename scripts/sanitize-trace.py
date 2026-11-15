"""Remove ephemeral credentials from Playwright trace text resources before upload.
Screenshots are disabled while capturing (credentials can be rendered in pixels).
"""
import json
import sys
import zipfile
from pathlib import Path
secrets = sorted(set(json.load(sys.stdin)), key=len, reverse=True)
for name in sys.argv[1:]:
    path = Path(name)
    with zipfile.ZipFile(path) as source:
        entries = [(item, source.read(item)) for item in source.infolist()]
    with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as target:
        for item, data in entries:
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError:
                target.writestr(item, data)
                continue
            for secret in secrets:
                if secret:
                    text = text.replace(secret, '[REDACTED]')
            target.writestr(item, text.encode())
