#!/usr/bin/env python3
"""Validate rendered Compose contracts with dummy secrets only."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
env = {**os.environ, 'POSTGRES_PASSWORD': 'ephemeral-test-only', 'GIT_SHA': 'a' * 40,
       'ALLOWED_ORIGINS': 'https://stage.focusima.space', 'API_ORIGIN': 'https://stage-api.focusima.space'}
for name in ('staging', 'production'):
    config = json.loads(subprocess.check_output(['docker', 'compose', '-p', f'game-{name}', '-f',
                        str(root / 'deploy/app/compose.yml'), 'config', '--format', 'json'],
                        env={**env, 'DEPLOY_ENV': name}))
    services = config['services']
    assert all(not s.get('ports') and s['restart'] == 'unless-stopped' for s in services.values())
    assert set(services['db']['networks']) == {'internal'}
    assert config['networks']['internal']['internal']
    assert config['networks']['edge']['name'] == f'edge-{name}'
    assert config['volumes']['game-data']['name'] == f'game-{name}_game-data'
    for service, cpu, memory in (('db', 1, 768), ('server', 1, 768), ('web', .25, 128)):
        assert float(services[service]['cpus']) == cpu
        assert int(services[service]['mem_limit']) == memory * 1024 * 1024
    for service in ('server', 'web'):
        assert f'{name}-{service}' in services[service]['networks']['edge']['aliases']
        assert services[service]['build']['args']['GIT_SHA'] == 'a' * 40
edge = json.loads(subprocess.check_output(['docker', 'compose', '-p', 'edge', '-f',
                  str(root / 'deploy/edge/compose.yml'), 'config', '--format', 'json']))
assert {p['published'] for p in edge['services']['nginx']['ports']} == {'80', '443'}
assert all(p['host_ip'] == '0.0.0.0' for p in edge['services']['nginx']['ports'])
assert not edge['services']['certbot'].get('ports')
for service in ('nginx', 'certbot'):
    mount = next(v for v in edge['services'][service]['volumes'] if v['target'] == '/edge')
    assert mount['source'] == '/srv/game/edge/src/deploy/edge' and mount['read_only']
print('Compose: both isolated app environments and edge contracts verified')
