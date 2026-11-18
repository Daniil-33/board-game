const assert = require('node:assert/strict');
const http2 = require('node:http2');
const https = require('node:https');
const { gunzipSync } = require('node:zlib');

async function request(session, authority, path) {
  return new Promise((resolve, reject) => {
    const stream = session.request({ ':method': 'GET', ':path': path, ':authority': authority, 'accept-encoding': 'gzip' });
    const chunks = [];
    stream.on('response', (headers) => {
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve({ headers, body: Buffer.concat(chunks) }));
    });
    stream.on('error', reject);
    stream.end();
  });
}

async function main() {
  const site = http2.connect('https://stage.focusima.space', { rejectUnauthorized: false });
  const api = http2.connect('https://stage-api.focusima.space', { rejectUnauthorized: false });
  try {
    await Promise.all([site, api].map((session) => new Promise((resolve, reject) => {
      session.once('connect', resolve);
      session.once('error', reject);
    })));
    assert.equal(site.socket.alpnProtocol, 'h2', `web edge negotiated ${site.socket.alpnProtocol}`);
    assert.equal(api.socket.alpnProtocol, 'h2', `API edge negotiated ${api.socket.alpnProtocol}`);

    for (const path of ['/', '/assets/check.js', '/assets/check.css', '/assets/check.svg', '/assets/check.json']) {
      const response = await request(site, 'stage.focusima.space', path);
      assert.equal(response.headers[':status'], 200, `${path} status`);
      assert.equal(response.headers['content-encoding'], 'gzip', `${path} Content-Encoding`);
      assert.match(response.headers.vary ?? '', /Accept-Encoding/i, `${path} Vary`);
      if (path.startsWith('/assets/')) assert.match(response.headers['cache-control'] ?? '', /immutable/);
    }

    const raster = await request(site, 'stage.focusima.space', '/assets/check.png');
    assert.equal(raster.headers[':status'], 200);
    assert.equal(raster.headers['content-encoding'], undefined, 'already-compressed image must not be gzip encoded');
    assert.match(raster.headers['cache-control'] ?? '', /immutable/);

    const apiResponse = await request(api, 'stage-api.focusima.space', '/api/health');
    assert.equal(apiResponse.headers[':status'], 200, '/api/health status');
    assert.equal(apiResponse.headers['content-encoding'], 'gzip', '/api/health JSON compression');
    assert.match(gunzipSync(apiResponse.body).toString(), /edge-api-fixture/);

    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'stage-api.focusima.space',
        port: 443,
        path: '/ws',
        method: 'GET',
        rejectUnauthorized: false,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
          Origin: 'https://stage.focusima.space',
        },
      });
      req.on('upgrade', (response, socket) => {
        try {
          assert.equal(response.statusCode, 101, '/ws upgrade status');
          socket.destroy();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      req.on('response', (response) => reject(new Error(`/ws returned ${response.statusCode}`)));
      req.on('error', reject);
      req.end();
    });
  } finally {
    site.close();
    api.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
