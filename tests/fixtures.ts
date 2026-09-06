import { inflateSync } from 'zlib';

export interface DecodedPng {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  /** Straight RGBA samples. */
  rgba: Uint8Array;
}

/**
 * Decodes the PNGs this project writes: 8-bit RGBA, single IDAT, no interlace.
 * Deliberately independent of the encoder's filter choice.
 */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (colorType !== 6 || bitDepth !== 8) throw new Error(`Unsupported PNG: type ${colorType}, depth ${bitDepth}.`);

  const idat: Uint8Array[] = [];
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }

  const merged = new Uint8Array(idat.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of idat) {
    merged.set(part, cursor);
    cursor += part.length;
  }

  const raw = new Uint8Array(inflateSync(merged));
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= 4 ? rgba[y * stride + i - 4] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + i] : 0;
      let value: number;
      if (filter === 0) value = row[i];
      else if (filter === 1) value = row[i] + left;
      else if (filter === 2) value = row[i] + up;
      else throw new Error(`Unsupported filter: ${filter}`);
      rgba[y * stride + i] = value & 0xff;
    }
  }
  return { width, height, colorType, bitDepth, rgba };
}

/** RGBA of one pixel, from either a rendered image or a decoded PNG. */
export function pixelAt(
  image: { width: number; data: Uint8ClampedArray } | { width: number; rgba: Uint8Array },
  x: number,
  y: number,
): number[] {
  const data = 'data' in image ? image.data : image.rgba;
  const index = (y * image.width + x) * 4;
  return Array.from(data.slice(index, index + 4));
}

/** Row indices that contain at least one non-transparent pixel. */
export function paintedRows(image: { width: number; height: number; data: Uint8ClampedArray }): number[] {
  const rows: number[] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] > 0) {
        rows.push(y);
        break;
      }
    }
  }
  return rows;
}

/** Column indices that contain at least one non-transparent pixel. */
export function paintedColumns(image: { width: number; height: number; data: Uint8ClampedArray }): number[] {
  const columns: number[] = [];
  for (let x = 0; x < image.width; x++) {
    for (let y = 0; y < image.height; y++) {
      if (image.data[(y * image.width + x) * 4 + 3] > 0) {
        columns.push(x);
        break;
      }
    }
  }
  return columns;
}

/** Rows painted in a single column. Isolates horizontal lines from vertical ones. */
export function paintedRowsAt(
  image: { width: number; height: number; data: Uint8ClampedArray },
  x: number,
): number[] {
  const rows: number[] = [];
  for (let y = 0; y < image.height; y++) {
    if (image.data[(y * image.width + x) * 4 + 3] > 0) rows.push(y);
  }
  return rows;
}

/** Columns painted in a single row. Isolates vertical lines from horizontal ones. */
export function paintedColumnsAt(
  image: { width: number; height: number; data: Uint8ClampedArray },
  y: number,
): number[] {
  const columns: number[] = [];
  for (let x = 0; x < image.width; x++) {
    if (image.data[(y * image.width + x) * 4 + 3] > 0) columns.push(x);
  }
  return columns;
}
