import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { comparePngFiles } from '../visual.mjs';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}

function rgbaPng(red) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.from([0, red, 0, 0, 255]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function writePngPair() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mint-harness-visual-'));
  const actual = path.join(directory, 'actual.png');
  const baseline = path.join(directory, 'baseline.png');
  await Promise.all([fs.writeFile(actual, rgbaPng(255)), fs.writeFile(baseline, rgbaPng(255))]);
  return { directory, actual, baseline };
}

test('passes identical PNG screenshots and reports pixel differences', async () => {
  const files = await writePngPair();
  assert.deepEqual(await comparePngFiles(files.actual, files.baseline), {
    passed: true,
    width: 1,
    height: 1,
    diffPixels: 0,
    diffRatio: 0,
  });

  await fs.writeFile(files.baseline, rgbaPng(0));
  const result = await comparePngFiles(files.actual, files.baseline);
  assert.equal(result.passed, false);
  assert.equal(result.diffPixels, 1);
  assert.equal(result.diffRatio, 1);
});

test('accepts configured pixel tolerance and rejects dimension changes', async () => {
  const files = await writePngPair();
  await fs.writeFile(files.baseline, rgbaPng(254));
  assert.equal(
    (await comparePngFiles(files.actual, files.baseline, { pixelThreshold: 1 })).passed,
    true,
  );
  assert.equal(
    (await comparePngFiles(files.actual, files.baseline, { pixelThreshold: 0, maxDiffPixels: 0 }))
      .passed,
    false,
  );

  await fs.writeFile(files.baseline, Buffer.from('not png'));
  await assert.rejects(() => comparePngFiles(files.actual, files.baseline), /PNG/);
});
