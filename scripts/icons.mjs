// Draws the Daysplit icon (a three-part donut: work / entertainment / waste) as
// PNGs with no dependencies. Run: node scripts/icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const OUT = new URL('../src/icons/', import.meta.url);

// Slices clockwise from 12 o'clock: [color, fraction of the ring]
const SLICES = [
  [[0x2a, 0x78, 0xd6], 0.58],
  [[0xed, 0xa1, 0x00], 0.25],
  [[0xe8, 0x7b, 0xa4], 0.17],
];
const OUTER = 0.48;
const INNER = 0.24;
const GAP = 0.045; // transparent gap between slices, in icon units

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Slice boundaries as angles (radians, clockwise from 12 o'clock).
const bounds = [];
let acc = 0;
for (const [, f] of SLICES) {
  bounds.push(acc * 2 * Math.PI);
  acc += f;
}

function sample(x, y) {
  // x, y in [-0.5, 0.5], y down
  const r = Math.hypot(x, y);
  if (r > OUTER || r < INNER) return null;
  let a = Math.atan2(x, -y);
  if (a < 0) a += 2 * Math.PI;
  // Inside a gap if close to any boundary ray.
  for (const b of bounds) {
    const bx = Math.sin(b);
    const by = -Math.cos(b);
    const along = x * bx + y * by;
    const across = Math.abs(x * by - y * bx);
    if (along > 0 && across < GAP / 2) return null;
  }
  let i = bounds.length - 1;
  while (i > 0 && a < bounds[i]) i--;
  return SLICES[i][0];
}

const SS = 6; // supersampling per axis

// `art` is the share of the canvas the donut fills; the rest stays transparent.
function render(size, art = 1) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size - 0.5) / art;
          const y = ((py + (sy + 0.5) / SS) / size - 0.5) / art;
          const c = sample(x, y);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            hits++;
          }
        }
      }
      const o = (py * size + px) * 4;
      if (hits) {
        rgba[o] = Math.round(r / hits);
        rgba[o + 1] = Math.round(g / hits);
        rgba[o + 2] = Math.round(b / hits);
        rgba[o + 3] = Math.round((hits / (SS * SS)) * 255);
      }
    }
  }
  return png(size, rgba);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) writeFileSync(new URL(`icon-${size}.png`, OUT), render(size));
console.log(`Wrote ${SIZES.map((s) => `icon-${s}.png`).join(', ')}`);

// Chrome Web Store icon: 96x96 artwork centered in a 128x128 canvas.
const STORE = new URL('../store/assets/', import.meta.url);
mkdirSync(STORE, { recursive: true });
writeFileSync(new URL('store-icon-128.png', STORE), render(128, 96 / 128));
console.log('Wrote store/assets/store-icon-128.png');
