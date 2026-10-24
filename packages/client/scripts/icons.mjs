// Generates icon-192.png and icon-512.png in public/ from a 16x16 pixel grid (no native deps).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../public');

// 16x16 carrot on grass, same as icon.svg
const G = '#5c9e3a', L = '#3f8a2e', O = '#f08a2a', D = '#e07a1e', K = '#c96a14';
const rows = [
  'GGGGGGGGGGGGGGGG',
  'GGGGGGGGLLGGGGGG',
  'GGGGGLLGLLGGGGGG',
  'GGGGGLLGLLGLLGGG',
  'GGGGGLLGLLGLLGGG',
  'GGGGGGOOOOOOGGGG',
  'GGGGGGOOOOOOGGGG',
  'GGGGGGOOOOOGGGGG',
  'GGGGGGOOOOOGGGGG',
  'GGGGGGGDDDDGGGGG',
  'GGGGGGGDDDDGGGGG',
  'GGGGGGGDDDGGGGGG',
  'GGGGGGGDDDGGGGGG',
  'GGGGGGGGKGGGGGGG',
  'GGGGGGGGKGGGGGGG',
  'GGGGGGGGGGGGGGGG',
];
const pal = { G, L, O, D, K };

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const scale = size / 16;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter none
    const row = rows[Math.floor(y / scale)];
    for (let x = 0; x < size; x++) {
      const hex = pal[row[Math.floor(x / scale)]];
      const n = parseInt(hex.slice(1), 16);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = (n >> 16) & 255;
      raw[o + 1] = (n >> 8) & 255;
      raw[o + 2] = n & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

mkdirSync(out, { recursive: true });
for (const size of [192, 512]) writeFileSync(path.join(out, `icon-${size}.png`), png(size));
console.log('icons written to', out);
