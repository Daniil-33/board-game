"""Offline behavioral checks: no VPS, Docker daemon or public CA required."""
import base64
import hashlib
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

DEPLOY = Path(__file__).resolve().parents[1]
SHA = 'a' * 40


def load(name, path):
    loader = importlib.machinery.SourceFileLoader(name, str(path))
    spec = importlib.util.spec_from_loader(name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


gate = load('gate', DEPLOY / 'deploy-gate')
original_git = gate.git
health = load('health', DEPLOY / 'health.py')


class GateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        for env in ('staging', 'production'):
            src = self.root / env / 'src/deploy'
            src.mkdir(parents=True)
            script = src / 'deploy.sh'
            script.write_text('#!/bin/sh\nexit 0\n')
            script.chmod(0o755)
        self.patches = [patch.object(gate, 'ROOT', self.root),
                        patch.object(gate, 'docker_group', return_value=True),
                        patch.object(gate, 'git'), patch.object(gate.os, 'execv'),
                        patch.object(gate.os, 'chdir')]
        self.root_mock, self.group, self.git, self.exec, self.chdir = [p.start() for p in self.patches]
        for p in self.patches:
            self.addCleanup(p.stop)

    def run_gate(self, command):
        with patch.dict(os.environ, SSH_ORIGINAL_COMMAND=command), patch('sys.stderr', new_callable=io.StringIO) as err:
            result = gate.main()
        return result, err.getvalue()

    def test_invalid_commands_have_one_line_exit_two_before_side_effects(self):
        for command in ('', 'bash', f'deploy dev {SHA}', f'deploy staging {SHA[:-1]}',
                        f'deploy staging {SHA.upper()}', f'deploy staging {SHA} extra',
                        f'deploy staging {SHA};id', f'deploy staging $(id)',
                        f'deploy staging {SHA}\n', f'deploy  staging {SHA}'):
            with self.subTest(command=command):
                code, message = self.run_gate(command)
                self.assertEqual(code, 2)
                self.assertEqual(len(message.splitlines()), 1)
        self.git.assert_not_called()
        self.group.assert_not_called()
        self.exec.assert_not_called()

    def test_restrictive_caller_umask_does_not_make_checkout_private(self):
        previous = os.umask(0o077)
        try:
            def checkout(src, *args):
                if args[0] == 'checkout':
                    target = src / 'container-readable'
                    target.mkdir()
                    (target / 'config.js').write_text('public config')
            self.git.side_effect = checkout
            self.assertEqual(self.run_gate(f'deploy staging {SHA}')[0], 0)
            target = self.root / 'staging/src/container-readable'
            self.assertEqual(target.stat().st_mode & 0o777, 0o755)
            self.assertEqual((target / 'config.js').stat().st_mode & 0o777, 0o644)
        finally:
            os.umask(previous)

    def test_missing_target_script_cleanly_refused(self):
        (self.root / 'staging/src/deploy/deploy.sh').unlink()
        code, message = self.run_gate(f'deploy staging {SHA}')
        self.assertEqual(code, 2)
        self.assertEqual(len(message.splitlines()), 1)
        self.assertIn('target checkout lacks executable deploy/deploy.sh', message)
        self.exec.assert_not_called()

    def test_non_main_sha_refused(self):
        self.git.side_effect = [None, gate.Refused('not main')]
        self.assertEqual(self.run_gate(f'deploy staging {SHA}')[0], 2)
        self.exec.assert_not_called()

    def test_production_requires_exact_staging_log_field(self):
        log = self.root / 'staging/deployed.log'
        for content in ('', f'date {SHA}extra\n', f'date {SHA} third\n'):
            log.write_text(content)
            code, message = self.run_gate(f'deploy production {SHA}')
            self.assertEqual(code, 2)
            self.assertIn('production SHA has no successful staging deployment', message)
        self.exec.assert_not_called()
        log.write_text(f'2026-11-16T00:00:00Z {SHA}\n')
        self.assertEqual(self.run_gate(f'deploy production {SHA}')[0], 0)
        self.exec.assert_called_once()

    def test_git_uses_argv_not_shell(self):
        with patch.object(gate.subprocess, 'run') as run:
            run.return_value.returncode = 1
            with self.assertRaises(gate.Refused):
                original_git(self.root, 'merge-base', '--is-ancestor', SHA, 'origin/main')
            self.assertEqual(run.call_args.args[0], ['git', '-C', str(self.root), 'merge-base', '--is-ancestor', SHA, 'origin/main'])
            self.assertNotIn('shell', run.call_args.kwargs)

    def test_lock_is_held_and_inheritable_at_exec(self):
        import fcntl
        def at_exec(*_):
            with (self.root / 'staging/deploy.lock').open('a') as competing:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(competing, fcntl.LOCK_EX | fcntl.LOCK_NB)
            lock_path = self.root / 'staging/deploy.lock'
            fds = [int(p.name) for p in Path('/proc/self/fd').iterdir() if p.name.isdigit()]
            locks = [fd for fd in fds if Path(f'/proc/self/fd/{fd}').resolve() == lock_path]
            self.assertEqual(len(locks), 1)
            self.assertTrue(os.get_inheritable(locks[0]))
        self.exec.side_effect = at_exec
        self.assertEqual(self.run_gate(f'deploy staging {SHA}')[0], 0)
        self.assertEqual(self.git.call_args_list[0].args[1:], ('fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main'))
        self.assertEqual(self.git.call_args_list[-1].args[1:], ('checkout', '--quiet', '--detach', SHA))

    def test_forced_command_docker_reexec_is_constant(self):
        self.group.return_value = False
        with patch.object(gate.os, 'execvp', side_effect=SystemExit) as execute:
            with self.assertRaises(SystemExit):
                gate.deploy(f'deploy staging {SHA}')
        execute.assert_called_once_with('sg', ['sg', 'docker', '-c', '/srv/agents/game/bin/deploy-gate'])
        self.git.assert_not_called()

    def test_operational_exception_text_is_omitted(self):
        for error in (OSError('secret-path'), KeyError('secret-key')):
            with patch.object(gate, 'deploy', side_effect=error):
                code, message = self.run_gate(f'deploy staging {SHA}')
            self.assertEqual(code, 2)
            self.assertEqual(len(message.splitlines()), 1)
            self.assertNotIn('secret', message)

    def test_app_deployment_never_references_edge_checkout(self):
        for file in ('deploy-gate', 'deploy.sh'):
            source = (DEPLOY / file).read_text()
            self.assertNotIn('/srv/agents/game/edge', source)
            self.assertNotIn('deploy/edge', source)
            self.assertNotIn('EDGE_SOURCE_DIR', source)


class HealthTests(unittest.TestCase):
    def test_versions_and_origins(self):
        with patch.object(health, 'get', side_effect=[json.dumps({'status': 'ok', 'sha': SHA}).encode(), SHA.encode()]), patch.object(health, 'websocket') as ws:
            health.check('staging', SHA)
        self.assertEqual(ws.call_args_list[0].args, ('stage-api.focusima.space', 'https://stage.focusima.space', True))
        self.assertEqual(ws.call_args_list[1].args[-1], False)

    def test_version_mismatches(self):
        for responses in ([b'{"status":"ok","sha":"wrong"}'],
                          [json.dumps({'status': 'ok', 'sha': SHA}).encode(), b'wrong']):
            with patch.object(health, 'get', side_effect=responses), self.assertRaises(health.Unhealthy):
                health.check('staging', SHA)

    def test_network_tls_and_bad_json_fail_with_bounded_retries(self):
        import ssl
        for error in (OSError('network'), ssl.SSLError('untrusted'), ValueError('json')):
            with patch.object(health, 'check', side_effect=error) as check, patch.object(health.time, 'sleep'), patch('sys.stderr', new_callable=io.StringIO):
                self.assertEqual(health.main(['staging', SHA]), 1)
                self.assertEqual(check.call_count, 6)

    def test_real_handshake_parser(self):
        key = base64.b64encode(b'x' * 16).decode()
        accept = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
        valid = f'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n'.encode()
        from unittest.mock import MagicMock
        for allowed, response, succeeds in ((True, valid, True), (True, valid.replace(accept.encode(), b'bad'), False),
                                           (True, b'HTTP/1.1 403 Forbidden\r\n\r\n', False),
                                           (False, b'HTTP/1.1 403 Forbidden\r\n\r\n', True),
                                           (False, b'HTTP/1.1 401 Unauthorized\r\n\r\n', False),
                                           (False, valid, False), (False, b'HTTP/1.1 502 Bad Gateway\r\n\r\n', False)):
            with self.subTest(allowed=allowed, response=response):
                tls = MagicMock()
                tls.__enter__.return_value = tls
                tls.makefile.return_value = io.BytesIO(response)
                context = MagicMock()
                context.wrap_socket.return_value = tls
                with patch.object(health.socket, 'create_connection'), patch.object(health.ssl, 'create_default_context', return_value=context), patch.object(health.os, 'urandom', return_value=b'x' * 16):
                    if succeeds:
                        health.websocket('api.focusima.space', 'https://focusima.space', allowed)
                    else:
                        with self.assertRaises(health.Unhealthy):
                            health.websocket('api.focusima.space', 'https://focusima.space', allowed)
                context.wrap_socket.assert_called_once()
                self.assertEqual(context.wrap_socket.call_args.kwargs['server_hostname'], 'api.focusima.space')

    def test_http_status_and_size(self):
        from unittest.mock import MagicMock
        for status, body in ((502, b'bad'), (200, b'a' * 65537)):
            connection = MagicMock()
            response = connection.getresponse.return_value
            response.status = status
            response.read.return_value = body
            with patch.object(health.http.client, 'HTTPSConnection', return_value=connection), self.assertRaises(health.Unhealthy):
                health.get('api.focusima.space', '/api/health')
            connection.close.assert_called_once()


class ScriptTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / 'staging/src'
        (self.repo / 'deploy/app').mkdir(parents=True)
        self.env = self.root / 'staging/env'
        self.env.write_text('POSTGRES_PASSWORD=do-not-print-this-secret\n')
        self.env.chmod(0o600)
        script = (DEPLOY / 'deploy.sh').read_text().replace('root=/srv/agents/game', f'root={self.root}')
        (self.repo / 'deploy/deploy.sh').write_text(script)
        (self.repo / 'deploy/health.py').write_text("import os, sys\nsys.exit(int(os.environ.get('HEALTH_FAIL', '0')))\n")
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.fake = self.bin / 'docker'
        self.fake.write_text('''#!/bin/sh
printf '%s\\n' "$*" >> "$CALLS"
(umask) >> "$CALLS.masks"
printf '%s %s\\n' "${BUILDX_NO_DEFAULT_ATTESTATIONS:-unset}" "$*" >> "$CALLS.attestations"
case " $* " in
  *" build "*) test "${FAIL:-}" != build ;;
  *" up "*) test "${FAIL:-}" != up ;;
  *" logs "*) echo 'recent server logs' ;;
esac
''')
        self.fake.chmod(0o755)
        self.calls = self.root / 'calls'
        self.environment = {**os.environ, 'PATH': f'{self.bin}:{os.environ["PATH"]}', 'CALLS': str(self.calls)}

    def deploy(self, **env):
        return subprocess.run(['sh', str(self.repo / 'deploy/deploy.sh'), 'staging', SHA], env={**self.environment, **env}, text=True, capture_output=True)

    def test_deploy_failures_no_audit_and_bounded_logs(self):
        for env in ({'FAIL': 'build'}, {'FAIL': 'up'}, {'HEALTH_FAIL': '1'}):
            with self.subTest(env=env):
                result = self.deploy(**env)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('failed', result.stderr)
                self.assertIn('recent server logs', result.stderr)
                self.assertNotIn('do-not-print-this-secret', result.stdout + result.stderr)
                self.assertFalse((self.root / 'staging/deployed.log').exists())
                self.assertIn('logs --no-color --tail 80 server', self.calls.read_text())

    def test_success_repeated_sha_is_safe(self):
        previous = os.umask(0o077)
        try:
            for _ in range(2):
                result = self.deploy()
                self.assertEqual(result.returncode, 0, result.stderr)
        finally:
            os.umask(previous)
        masks = Path(str(self.calls) + '.masks').read_text().splitlines()
        self.assertTrue(masks)
        self.assertTrue(all(int(mask, 8) == 0o022 for mask in masks))
        builds = [line for line in self.calls.read_text().splitlines() if 'build' in line.split()]
        self.assertEqual(len(builds), 2)
        self.assertTrue(all(line.endswith(' build') for line in builds))
        attestations = Path(str(self.calls) + '.attestations').read_text().splitlines()
        build_envs = [line for line in attestations if 'build' in line.split()]
        self.assertEqual(len(build_envs), 2)
        self.assertTrue(all(line.startswith('1 compose ') for line in build_envs))
        self.assertTrue(all(line.startswith('unset compose ') for line in attestations if ' up ' in line))
        lines = (self.root / 'staging/deployed.log').read_text().splitlines()
        self.assertEqual(len(lines), 2)
        self.assertTrue(all(line.endswith(' ' + SHA) for line in lines))
        self.assertIn('up -d --wait --wait-timeout 180 --remove-orphans', self.calls.read_text())

    def test_unsafe_env_mode_refused(self):
        self.env.chmod(0o644)
        self.assertNotEqual(self.deploy().returncode, 0)
        self.assertFalse(self.calls.exists())

    def test_certificate_staging_state_is_disposable_before_live(self):
        result = subprocess.run(['sh', str(DEPLOY / 'edge/issue-certs.sh'), 'staging'], env=self.environment, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls.read_text().splitlines()
        self.assertEqual(len(calls), 3)
        self.assertIn('--staging --config-dir /dry-run/config --work-dir /dry-run/work --logs-dir /dry-run/logs', calls[0])
        self.assertIn('tmpfs: [/dry-run]', (DEPLOY / 'edge/compose.yml').read_text())
        self.assertNotIn('--staging', calls[1])
        self.assertIn('--register-unsafely-without-email', calls[1])
        self.assertIn('reload.sh', calls[2])

    def test_ops_certificate_names_only_the_ops_host(self):
        result = subprocess.run(['sh', str(DEPLOY / 'edge/issue-certs.sh'), 'ops'], env=self.environment, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls.read_text().splitlines()
        self.assertEqual(len(calls), 3)
        for call in calls[:2]:
            self.assertIn('--cert-name ops -d ops.focusima.space', call)
            self.assertNotIn('-d stage', call)
            self.assertNotIn('-d api', call)
        self.assertIn('--staging', calls[0])
        self.assertNotIn('--staging', calls[1])

    def test_failed_dry_run_does_not_issue_live(self):
        self.fake.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\nexit 1\n')
        result = subprocess.run(['sh', str(DEPLOY / 'edge/issue-certs.sh'), 'production'], env=self.environment, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(self.calls.read_text().splitlines()), 1)

    def test_hairpin_verifies_public_ip_and_always_restores_config(self):
        curl = self.bin / 'curl'
        curl.write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\nexit "${CURL_FAIL:-0}"\n')
        curl.chmod(0o755)
        sleep = self.bin / 'sleep'
        sleep.write_text('#!/bin/sh\nexit 0\n')
        sleep.chmod(0o755)
        for fails in ('0', '1'):
            self.calls.write_text('')
            result = subprocess.run(['sh', str(DEPLOY / 'edge/check-hairpin.sh')],
                                    env={**self.environment, 'CURL_FAIL': fails}, capture_output=True, text=True)
            self.assertEqual(result.returncode, int(fails), result.stderr)
            calls = self.calls.read_text()
            self.assertIn('--resolve stage.focusima.space:443:149.5.209.208', calls)
            self.assertIn('--cacert ', calls)
            self.assertNotIn('--insecure', calls)
            self.assertIn('exec -T nginx sh /edge/reload.sh', calls)
            self.assertTrue(calls.rstrip().endswith('exec -T nginx rm -rf /tmp/hairpin'))
            if fails == '1':
                self.assertIn('escalate to Team Lead', result.stderr)


class RenderTests(unittest.TestCase):
    def test_bootstrap_and_partial_certificates(self):
        with tempfile.TemporaryDirectory() as tmp:
            def render():
                return subprocess.check_output(['sh', str(DEPLOY / 'edge/render.sh'), tmp], text=True)
            self.assertNotIn('listen 443', render())
            cert = Path(tmp) / 'live/staging'
            cert.mkdir(parents=True)
            (cert / 'fullchain.pem').touch()
            (cert / 'privkey.pem').touch()
            config = render()
            self.assertEqual(config.count('listen 443 ssl;'), 2)
            self.assertIn('http://staging-web:80', config)
            self.assertIn('http://staging-server:8787', config)
            self.assertNotIn('http://production-', config)
            self.assertIn('$request_method $uri $server_protocol', config)
            self.assertNotIn('$request"', config)
            self.assertIn('proxy_read_timeout 1h', config)
            self.assertIn('resolver 127.0.0.11', config)
            self.assertIn('default_server; server_name _; return 444;', config)


    def test_ops_cockpit_vhost_only_with_its_certificate(self):
        with tempfile.TemporaryDirectory() as tmp:
            def render():
                return subprocess.check_output(['sh', str(DEPLOY / 'edge/render.sh'), tmp], text=True)
            config = render()
            self.assertIn('stage-api.focusima.space ops.focusima.space;', config)
            self.assertNotIn('172.17.0.1', config)
            cert = Path(tmp) / 'live/ops'
            cert.mkdir(parents=True)
            (cert / 'fullchain.pem').touch()
            (cert / 'privkey.pem').touch()
            config = render()
            self.assertEqual(config.count('listen 443 ssl;'), 1)
            self.assertIn('server_name ops.focusima.space;', config)
            self.assertIn('proxy_pass http://172.17.0.1:8765;', config)
            self.assertIn('if ($host != ops.focusima.space) { return 444; }', config)
            self.assertIn('proxy_set_header X-Forwarded-Proto https;', config)
            self.assertNotIn('http://staging-', config)

if __name__ == '__main__':
    unittest.main()
