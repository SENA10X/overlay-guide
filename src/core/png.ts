/**
 * A minimal RGBA (color type 6) PNG encoder. No dependencies, so the exact
 * same bytes come out in Node and in the browser; only the deflate
 * implementation is injected.
 */

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Compresses raw bytes into a zlib stream (PNG IDAT format). */
export type Deflate = (data: Uint8Array) => Promise<Uint8Array> | Uint8Array;

/**
 * Encodes 8-bit RGBA samples as a PNG with an alpha channel.
 *
 * Rows use the Up filter: an overlay is mostly long stretches of identical
 * rows, which the filter turns into zeros and deflate then collapses.
 */
export async function encodeRgbaPng(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  deflate: Deflate,
): Promise<Uint8Array> {
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`Expected ${expected} bytes of RGBA data, got ${rgba.length}.`);
  }

  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const out = y * (stride + 1);
    raw[out] = 2; // filter type: Up
    const row = y * stride;
    const prior = row - stride;
    for (let i = 0; i < stride; i++) {
      const above = y === 0 ? 0 : rgba[prior + i];
      raw[out + 1 + i] = (rgba[row + i] - above) & 0xff;
    }
  }

  const idat = await deflate(raw);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor with alpha
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const chunks = [chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = 8 + chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  out.set(PNG_SIGNATURE, 0);
  let offset = 8;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
