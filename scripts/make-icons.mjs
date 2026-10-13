// Generates the PWA icons as PNGs with no dependencies (pure zlib PNG encoder).
// Design: sage rounded mark — a ring with a rising arc, on a warm dark background.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BG = [14, 15, 15];
const FG = [127, 181, 163];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function icon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const c = size / 2;
  const scale = maskable ? 0.62 : 0.78; // maskable keeps the mark inside the safe zone
  const rOuter = (size / 2) * scale;
  const ring = rOuter * 0.16;
  const corner = size * 0.22;
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // Supersample 4x4 for smooth edges.
      let cover = 0;
      let bgCover = 0;
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const fx = x + (sx + 0.5) / 4;
          const fy = y + (sy + 0.5) / 4;
          // Background: full square for maskable, rounded square otherwise.
          let inBg = true;
          if (!maskable) {
            const qx = Math.max(corner - fx, 0, fx - (size - corner));
            const qy = Math.max(corner - fy, 0, fy - (size - corner));
            inBg = qx * qx + qy * qy <= corner * corner;
          }
          if (inBg) bgCover++;
          const d = Math.hypot(fx - c, fy - c);
          const ang = Math.atan2(fy - c, fx - c);
          const onRing = Math.abs(d - (rOuter - ring)) <= ring / 2 && !(ang > 0.35 && ang < 1.25);
          const dot = Math.hypot(fx - c, fy - (c - rOuter * 0.05)) <= rOuter * 0.2;
          if (inBg && (onRing || dot)) cover++;
        }
      const a = cover / 16;
      const i = y * (size * 4 + 1) + 1 + x * 4;
      for (let k = 0; k < 3; k++) px[i + k] = Math.round(BG[k] * (1 - a) + FG[k] * a);
      px[i + 3] = Math.round((bgCover / 16) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(px)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192));
writeFileSync("public/icons/icon-512.png", icon(512));
writeFileSync("public/icons/icon-maskable-512.png", icon(512, { maskable: true }));
// Apple ignores transparency; use the full-bleed variant.
writeFileSync("public/icons/apple-touch-icon.png", icon(180, { maskable: true }));
console.log("icons written to public/icons");
