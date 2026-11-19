const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { deflateSync } = require('node:zlib');
const { assertNonBlankImage, analyzePng } = require('./image-stats.cjs');

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function png(width, height, pixelAt) {
  const rows = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rows[offset++] = 0;
    for (let x = 0; x < width; x++) {
      rows[offset++] = pixelAt(x, y)[0];
      rows[offset++] = pixelAt(x, y)[1];
      rows[offset++] = pixelAt(x, y)[2];
      rows[offset++] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  result.write(type, 4, 4, 'ascii');
  data.copy(result, 8);
  return result;
}

test('white and single-colour PNGs fail the blank-image guard', () => {
  const white = png(40, 30, () => [255, 255, 255]);
  const solid = png(40, 30, () => [37, 91, 143]);
  assert.throws(() => assertNonBlankImage(white, 'white fixture'), /blank or near-uniform/);
  assert.throws(() => assertNonBlankImage(solid, 'solid fixture'), /blank or near-uniform/);
  assert.equal(analyzePng(white).distinctColors, 1);
});

test('all 18 recaptured design frames pass the blank-image guard', { skip: !process.env['DESIGN_FRAME_DIR'] }, () => {
  const directory = process.env['DESIGN_FRAME_DIR'];
  const index = JSON.parse(readFileSync(path.join(directory, 'frames.json'), 'utf8'));
  const frames = index.map(frame => frame.file);
  assert.equal(frames.length, 18, 'expected 18 design frames');
  assert.equal(new Set(frames).size, 18, 'expected unique frame filenames');
  const pngFiles = readdirSync(directory).filter(file => file.endsWith('.png')).sort();
  assert.deepEqual([...frames].sort(), pngFiles, 'frame index should match captured PNGs');
  for (const file of frames) {
    const stats = assertNonBlankImage(readFileSync(path.join(directory, file)), file);
    assert.ok(stats.luminanceStdDev >= 3, `${file} luminance σ was ${stats.luminanceStdDev}`);
    assert.ok(stats.distinctColors >= 16, `${file} had ${stats.distinctColors} colors`);
  }
});
