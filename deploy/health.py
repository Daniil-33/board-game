#!/usr/bin/env python3
"""Public HTTPS/WSS verification using the system trust store, no proxy bypass."""
import base64
import hashlib
import http.client
import json
import os
import re
import socket
import ssl
import sys
import time

HOSTS = {
    'staging': ('stage.focusima.space', 'stage-api.focusima.space'),
    'production': ('focusima.space', 'api.focusima.space'),
}


class Unhealthy(Exception):
    pass


def get(host, path):
    connection = http.client.HTTPSConnection(host, timeout=10)
    try:
        connection.request('GET', path)
        response = connection.getresponse()
        body = response.read(65537)
        if response.status != 200 or len(body) > 65536:
            raise Unhealthy('HTTP health response refused')
        return body
    finally:
        connection.close()


def websocket(host, origin, allowed):
    key = base64.b64encode(os.urandom(16)).decode('ascii')
    with socket.create_connection((host, 443), timeout=10) as raw:
        with ssl.create_default_context().wrap_socket(raw, server_hostname=host) as tls:
            request = (f'GET /ws HTTP/1.1\r\nHost: {host}\r\nOrigin: {origin}\r\n'
                       f'Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\n'
                       'Sec-WebSocket-Version: 13\r\n\r\n')
            tls.sendall(request.encode('ascii'))
            response = http.client.HTTPResponse(tls)
            response.begin()
            if not allowed:
                if response.status != 403:
                    raise Unhealthy('foreign Origin was not explicitly refused')
                return
            expected = base64.b64encode(hashlib.sha1(
                (key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode('ascii')).digest()).decode('ascii')
            if (response.status != 101 or response.getheader('Upgrade', '').lower() != 'websocket'
                    or 'upgrade' not in [v.strip().lower() for v in response.getheader('Connection', '').split(',')]
                    or response.getheader('Sec-WebSocket-Accept') != expected):
                raise Unhealthy('allowed Origin WebSocket upgrade failed')


def check(env, sha):
    web, api = HOSTS[env]
    health = json.loads(get(api, '/api/health'))
    if not isinstance(health, dict) or health.get('status') != 'ok' or health.get('sha') != sha:
        raise Unhealthy('API health SHA/status mismatch')
    if get(web, '/version.txt').decode('ascii').strip() != sha:
        raise Unhealthy('client version SHA mismatch')
    websocket(api, f'https://{web}', True)
    websocket(api, 'https://foreign.invalid', False)


def main(argv):
    if len(argv) != 2 or argv[0] not in HOSTS or not re.fullmatch('[0-9a-f]{40}', argv[1]):
        print('health: expected environment and full SHA', file=sys.stderr)
        return 2
    for attempt in range(6):
        try:
            check(*argv)
            print('health: HTTPS versions and WebSocket origins verified')
            return 0
        except (Unhealthy, OSError, ValueError, http.client.HTTPException):
            if attempt < 5:
                time.sleep(5)
    print('health: public HTTPS or WebSocket verification failed', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
