const { inflateSync } = require('node:zlib');

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Decode the 8-bit RGB/RGBA PNGs emitted by Playwright and summarize their
 * visible pixels. Keeping decoding here avoids a runtime package dependency.
 */
function analyzePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('Image is not a valid PNG');
  }

  let width;
  let height;
  let bitDepth;
  let colorType;
  const imageData = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > buffer.length) throw new Error('Truncated PNG chunk');
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      bitDepth = buffer[start + 8];
      colorType = buffer[start + 9];
    } else if (type === 'IDAT') {
      imageData.push(buffer.subarray(start, end));
    } else if (type === 'IEND') {
      break;
    }
    offset = end + 4;
  }

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (!width || !height || bitDepth !== 8 || !channels) {
    throw new Error(`Unsupported PNG format (${width}x${height}, depth ${bitDepth}, color type ${colorType})`);
  }
  const bytesPerRow = width * channels;
  const raw = inflateSync(Buffer.concat(imageData));
  if (raw.length !== height * (bytesPerRow + 1)) throw new Error('Unexpected PNG pixel data length');

  const pixels = Buffer.alloc(height * bytesPerRow);
  let sourceOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[sourceOffset++];
    const rowOffset = y * bytesPerRow;
    for (let x = 0; x < bytesPerRow; x++) {
      const value = raw[sourceOffset++];
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
      const above = y > 0 ? pixels[rowOffset + x - bytesPerRow] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[rowOffset + x - bytesPerRow - channels] : 0;
      let predictor;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = left; break;
        case 2: predictor = above; break;
        case 3: predictor = Math.floor((left + above) / 2); break;
        case 4: predictor = paeth(left, above, upperLeft); break;
        default: throw new Error(`Unsupported PNG filter ${filter}`);
      }
      pixels[rowOffset + x] = (value + predictor) & 0xff;
    }
  }

  let luminanceSum = 0;
  let luminanceSquaredSum = 0;
  const colors = new Set();
  const pixelCount = width * height;
  for (let i = 0; i < pixels.length; i += channels) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminanceSum += luminance;
    luminanceSquaredSum += luminance * luminance;
    if (colors.size < 256) colors.add((red << 16) | (green << 8) | blue);
  }
  const meanLuminance = luminanceSum / pixelCount;
  const luminanceStdDev = Math.sqrt(Math.max(0, luminanceSquaredSum / pixelCount - meanLuminance ** 2));
  return { width, height, pixelCount, meanLuminance, luminanceStdDev, distinctColors: colors.size };
}

function assertNonBlankImage(buffer, label = 'image') {
  const stats = analyzePng(buffer);
  if (stats.luminanceStdDev < 3 || stats.distinctColors < 16) {
    throw new Error(`${label} is blank or near-uniform (luminance σ=${stats.luminanceStdDev.toFixed(2)}, colors=${stats.distinctColors}; requires σ≥3 and ≥16 colors)`);
  }
  return stats;
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

module.exports = { analyzePng, assertNonBlankImage };
