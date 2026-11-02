// Small code-drawn sigma icon; no network or image dependencies required.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([size, tag, data, crc]);
}
const dir = path.resolve(__dirname, '../extension/icons');
fs.mkdirSync(dir, { recursive: true });
for (const n of [16, 32, 48, 128]) {
  const data = Buffer.alloc((n * 4 + 1) * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + .5) / n, v = (y + .5) / n;
    const white = u > .25 && u < .76 && ((v > .22 && v < .31) || (v > .69 && v < .78) || (v >= .31 && v <= .69 && Math.abs(u - (.3 + (.5 - Math.abs(v - .5)) * .65)) < .055));
    const i = y * (n * 4 + 1) + 1 + x * 4;
    data.set(white ? [255,255,255,255] : [53,86,224,255], i);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(n); header.writeUInt32BE(n,4); header[8]=8; header[9]=6;
  fs.writeFileSync(path.join(dir, `icon${n}.png`), Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'), chunk('IHDR',header), chunk('IDAT',zlib.deflateSync(data)), chunk('IEND',Buffer.alloc(0))]));
}
