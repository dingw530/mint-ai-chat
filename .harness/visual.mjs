import fs from 'node:fs/promises';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readPng(buffer) {
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('截图不是有效的 PNG 文件');
  }

  let offset = PNG_SIGNATURE.length;
  let header;
  const imageData = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === 'IHDR') header = data;
    if (type === 'IDAT') imageData.push(data);
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }

  if (!header || imageData.length === 0) throw new Error('PNG 缺少图像数据');
  const bitDepth = header[8];
  const colorType = header[9];
  const interlace = header[12];
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error('只支持非隔行、8-bit PNG 截图');
  }

  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bytesPerRow = width * channels;
  const decoded = zlib.inflateSync(Buffer.concat(imageData));
  const pixels = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previousRow = Buffer.alloc(bytesPerRow);

  for (let y = 0; y < height; y += 1) {
    const filter = decoded[sourceOffset++];
    const row = Buffer.from(decoded.subarray(sourceOffset, sourceOffset + bytesPerRow));
    sourceOffset += bytesPerRow;
    unfilterRow(row, previousRow, filter, channels);
    writeRgbaRow(pixels, y * width * 4, row, width, colorType);
    previousRow = row;
  }
  return { width, height, pixels };
}

function unfilterRow(row, previousRow, filter, bytesPerPixel) {
  if (filter === 0) return;
  for (let index = 0; index < row.length; index += 1) {
    const left = index >= bytesPerPixel ? row[index - bytesPerPixel] : 0;
    const above = previousRow[index] || 0;
    const upperLeft = index >= bytesPerPixel ? previousRow[index - bytesPerPixel] || 0 : 0;
    if (filter === 1) row[index] = (row[index] + left) & 0xff;
    else if (filter === 2) row[index] = (row[index] + above) & 0xff;
    else if (filter === 3) row[index] = (row[index] + Math.floor((left + above) / 2)) & 0xff;
    else if (filter === 4) row[index] = (row[index] + paeth(left, above, upperLeft)) & 0xff;
    else throw new Error(`PNG 使用了不支持的过滤器：${filter}`);
  }
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function writeRgbaRow(output, offset, row, width, colorType) {
  for (let x = 0; x < width; x += 1) {
    const source = x * { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
    const target = offset + x * 4;
    if (colorType === 0) {
      output[target] = row[source];
      output[target + 1] = row[source];
      output[target + 2] = row[source];
      output[target + 3] = 255;
    } else if (colorType === 2) {
      output[target] = row[source];
      output[target + 1] = row[source + 1];
      output[target + 2] = row[source + 2];
      output[target + 3] = 255;
    } else if (colorType === 4) {
      output[target] = row[source];
      output[target + 1] = row[source];
      output[target + 2] = row[source];
      output[target + 3] = row[source + 1];
    } else {
      output[target] = row[source];
      output[target + 1] = row[source + 1];
      output[target + 2] = row[source + 2];
      output[target + 3] = row[source + 3];
    }
  }
}

/**
 * Compare two PNG screenshots without adding a browser or image-test dependency.
 * @param {string} actualPath
 * @param {string} baselinePath
 * @param {{pixelThreshold?: number, maxDiffPixels?: number}} [options]
 * @returns {Promise<{passed: boolean, width: number, height: number, diffPixels: number, diffRatio: number}>}
 */
export async function comparePngFiles(actualPath, baselinePath, options = {}) {
  const [actualBuffer, baselineBuffer] = await Promise.all([
    fs.readFile(actualPath),
    fs.readFile(baselinePath),
  ]);
  const actual = readPng(actualBuffer);
  const baseline = readPng(baselineBuffer);
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    return {
      passed: false,
      width: actual.width,
      height: actual.height,
      diffPixels: actual.width * actual.height,
      diffRatio: 1,
    };
  }

  const threshold = options.pixelThreshold || 0;
  let diffPixels = 0;
  for (let index = 0; index < actual.pixels.length; index += 4) {
    const difference = Math.max(
      Math.abs(actual.pixels[index] - baseline.pixels[index]),
      Math.abs(actual.pixels[index + 1] - baseline.pixels[index + 1]),
      Math.abs(actual.pixels[index + 2] - baseline.pixels[index + 2]),
      Math.abs(actual.pixels[index + 3] - baseline.pixels[index + 3]),
    );
    if (difference > threshold) diffPixels += 1;
  }
  const totalPixels = actual.width * actual.height;
  return {
    passed: diffPixels <= (options.maxDiffPixels || 0),
    width: actual.width,
    height: actual.height,
    diffPixels,
    diffRatio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
  };
}
