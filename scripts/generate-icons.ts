// One-time script: generates PNG icons for PWA manifest
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

function crc32(buf: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const t = Buffer.from(type, "ascii");
  const crcVal = crc32(new Uint8Array(Buffer.concat([t, data])));
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, t, data, crc]);
}

function makePNG(size: number): Buffer {
  const rowSize = 1 + size * 3;
  const raw = Buffer.alloc(rowSize * size);
  const cx = size / 2, cy = size / 2;

  for (let y = 0; y < size; y++) {
    const row = y * rowSize;
    raw[row] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const px = row + 1 + x * 3;
      if (dist < size * 0.15) {
        // White center hole
        raw[px] = 0xff; raw[px + 1] = 0xff; raw[px + 2] = 0xff;
      } else if (dist < size * 0.38) {
        // Dark groove ring
        raw[px] = 0x3a; raw[px + 1] = 0x7b; raw[px + 2] = 0x6c;
      } else {
        // Teal background
        raw[px] = 0x4a; raw[px + 1] = 0x9b; raw[px + 2] = 0x8c;
      }
    }
  }

  const compressed = deflateSync(raw);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = ihdr[11] = ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", Buffer.from(compressed)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = join(import.meta.dir, "../client/public/icons");
for (const size of [180, 192, 512]) {
  const path = join(out, `icon-${size}.png`);
  writeFileSync(path, makePNG(size));
  console.log("Generated", path);
}
