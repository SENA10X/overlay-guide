import { GLYPH_HEIGHT, GLYPH_WIDTH, glyph } from './font';
import { OverlayError } from './types';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0-255. */
  a: number;
}

export const TRANSPARENT: Rgba = { r: 0, g: 0, b: 0, a: 0 };
export const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 255 };
export const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 255 };

/** Parses `#rgb`, `#rrggbb` or `#rrggbbaa`. The leading `#` is optional. */
export function parseColor(input: string): Rgba {
  const text = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(text) || ![3, 4, 6, 8].includes(text.length)) {
    throw new OverlayError('invalid-color', `Invalid color: ${input}. Use a hex color like #00e5ff.`);
  }
  const short = text.length <= 4;
  const part = (index: number): number => {
    const slice = short
      ? text.slice(index, index + 1).repeat(2)
      : text.slice(index * 2, index * 2 + 2);
    return parseInt(slice, 16);
  };
  const hasAlpha = text.length === 4 || text.length === 8;
  return { r: part(0), g: part(1), b: part(2), a: hasAlpha ? part(3) : 255 };
}

export function withOpacity(color: Rgba, opacity: number): Rgba {
  return { ...color, a: Math.round((color.a * opacity) / 100) };
}

/** An RGBA pixel buffer with the handful of primitives the guides need. */
export class Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, background: Rgba = TRANSPARENT) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    if (background.a > 0) {
      for (let i = 0; i < this.data.length; i += 4) {
        this.data[i] = background.r;
        this.data[i + 1] = background.g;
        this.data[i + 2] = background.b;
        this.data[i + 3] = background.a;
      }
    }
  }

  /** Source-over blend of one pixel. Coordinates outside the canvas are ignored. */
  blend(x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || color.a <= 0) return;
    const i = (y * this.width + x) * 4;
    const sa = color.a / 255;
    if (sa >= 1) {
      this.data[i] = color.r;
      this.data[i + 1] = color.g;
      this.data[i + 2] = color.b;
      this.data[i + 3] = 255;
      return;
    }
    const da = this.data[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    for (let c = 0; c < 3; c++) {
      this.data[i + c] = Math.round((color[(['r', 'g', 'b'] as const)[c]] * sa + this.data[i + c] * da * (1 - sa)) / outA);
    }
    this.data[i + 3] = Math.round(outA * 255);
  }

  /** Fills an axis-aligned rectangle given in integer pixels. Clipped to the canvas. */
  fillRect(x: number, y: number, width: number, height: number, color: Rgba): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(this.width, x + width);
    const y1 = Math.min(this.height, y + height);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) this.blend(px, py, color);
    }
  }
}

/**
 * Places a line of `thickness` pixels centered on `center`, then nudges it back
 * inside the canvas so guides at 0% and 100% stay visible. This is the single
 * rounding rule for every guide, in every interface.
 */
export function lineSpan(center: number, thickness: number, extent: number): { start: number; length: number } {
  const length = Math.max(1, Math.min(Math.round(thickness), extent));
  let start = Math.round(center - length / 2);
  if (start < 0) start = 0;
  if (start + length > extent) start = extent - length;
  return { start, length };
}

export interface StrokeOptions {
  thickness: number;
  color: Rgba;
  dashed?: boolean;
}

/** Dash period derived from the canvas, so it looks the same at any resolution. */
export function dashLength(width: number, height: number): number {
  return Math.max(4, Math.round(Math.min(width, height) / 45));
}

/** Draws a horizontal line across the full canvas width at pixel `y` (center). */
export function strokeHorizontal(raster: Raster, y: number, options: StrokeOptions): void {
  const { start, length } = lineSpan(y, options.thickness, raster.height);
  strokeRun(raster, 0, raster.width, options, (from, to) =>
    raster.fillRect(from, start, to - from, length, options.color),
  );
}

/** Draws a vertical line down the full canvas height at pixel `x` (center). */
export function strokeVertical(raster: Raster, x: number, options: StrokeOptions): void {
  const { start, length } = lineSpan(x, options.thickness, raster.width);
  strokeRun(raster, 0, raster.height, options, (from, to) =>
    raster.fillRect(start, from, length, to - from, options.color),
  );
}

/** Walks a run either in one piece (solid) or in dashes, calling `draw` per segment. */
function strokeRun(
  raster: Raster,
  from: number,
  to: number,
  options: StrokeOptions,
  draw: (start: number, end: number) => void,
): void {
  if (!options.dashed) {
    draw(from, to);
    return;
  }
  const dash = dashLength(raster.width, raster.height);
  for (let position = from; position < to; position += dash * 2) {
    draw(position, Math.min(position + dash, to));
  }
}

/** Draws the four edges of a rectangle given in float pixel coordinates. */
export function strokeRect(
  raster: Raster,
  rect: { x: number; y: number; width: number; height: number },
  options: StrokeOptions,
): void {
  const left = lineSpan(rect.x, options.thickness, raster.width);
  const right = lineSpan(rect.x + rect.width, options.thickness, raster.width);
  const top = lineSpan(rect.y, options.thickness, raster.height);
  const bottom = lineSpan(rect.y + rect.height, options.thickness, raster.height);
  const outerX = left.start;
  const outerWidth = right.start + right.length - left.start;
  const outerY = top.start;
  const outerHeight = bottom.start + bottom.length - top.start;

  const horizontal = (y: number, length: number) =>
    strokeRun(raster, outerX, outerX + outerWidth, options, (a, b) =>
      raster.fillRect(a, y, b - a, length, options.color),
    );
  const vertical = (x: number, width: number) =>
    strokeRun(raster, outerY, outerY + outerHeight, options, (a, b) =>
      raster.fillRect(x, a, width, b - a, options.color),
    );
  horizontal(top.start, top.length);
  horizontal(bottom.start, bottom.length);
  vertical(left.start, left.length);
  vertical(right.start, right.length);
}

/** Label size that stays readable from 720p up to 8K. */
export function labelScale(width: number, height: number): number {
  return Math.max(1, Math.round(Math.min(width, height) / 240));
}

export function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return (text.length * (GLYPH_WIDTH + 1) - 1) * scale;
}

export function textHeight(scale: number): number {
  return GLYPH_HEIGHT * scale;
}

/** Draws `text` with its top-left corner at (x, y). Unknown characters are skipped. */
export function drawText(raster: Raster, x: number, y: number, text: string, scale: number, color: Rgba): void {
  let cursor = x;
  for (const char of text) {
    const rows = glyph(char);
    if (rows) {
      for (let row = 0; row < rows.length; row++) {
        for (let column = 0; column < GLYPH_WIDTH; column++) {
          if (rows[row][column] === '1') {
            raster.fillRect(cursor + column * scale, y + row * scale, scale, scale, color);
          }
        }
      }
    }
    cursor += (GLYPH_WIDTH + 1) * scale;
  }
}
