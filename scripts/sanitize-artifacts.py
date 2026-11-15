"""Sanitize text reports and trace ZIPs, including failure artifacts, before upload."""
import json
import subprocess
import sys
from pathlib import Path
secret_file = Path('.e2e-secrets.jsonl')
secrets = [json.loads(line) for line in secret_file.read_text().splitlines()] if secret_file.exists() else []
for root in sys.argv[1:]:
    for path in Path(root).rglob('*'):
        if not path.is_file():
            continue
        if path.suffix == '.zip':
            subprocess.run([sys.executable, 'scripts/sanitize-trace.py', str(path)], input=json.dumps(secrets), text=True, check=True)
            continue
        try:
            text = path.read_text()
        except UnicodeDecodeError:
            continue
        for secret in sorted(set(secrets), key=len, reverse=True):
            text = text.replace(secret, '[REDACTED]')
        path.write_text(text)
secret_file.unlink(missing_ok=True)
