import { describe, expect, it } from 'vitest';
import { computeCinemaCrop } from '../src/core/cinema';
import { encodeOverlay, generateOverlay, overlayFileName, renderOverlay } from '../src/core/generate';
import { formatPercent, parseGuidePosition } from '../src/core/guides';
import { PRESETS, SAFE_AREAS } from '../src/core/presets';
import { lineSpan, parseColor } from '../src/core/renderer';
import { computeSafeArea } from '../src/core/safe-area';
import { OverlayError, OverlayOptions } from '../src/core/types';
import { decodePng, paintedColumns, paintedColumnsAt, paintedRows, paintedRowsAt, pixelAt } from './fixtures';

const base: OverlayOptions = { width: 1920, height: 1080, style: { color: '#ff0000', opacity: 100, width: 2 } };

describe('resolution', () => {
  it.each([
    [1920, 1080],
    [3840, 2160],
    [1080, 1920],
    [777, 333],
  ])('renders %i x %i', (width, height) => {
    const image = renderOverlay({ ...base, width, height, presets: ['center'] });
    expect(image.width).toBe(width);
    expect(image.height).toBe(height);
    expect(image.data.length).toBe(width * height * 4);
  });

  it.each([
    [0, 1080],
    [1920, 0],
    [-4, 1080],
    [1920.5, 1080],
  ])('rejects %s x %s', (width, height) => {
    expect(() => renderOverlay({ ...base, width, height })).toThrow(OverlayError);
  });

  it('rejects a canvas beyond the pixel limit', () => {
    expect(() => renderOverlay({ ...base, width: 16000, height: 16000 })).toThrow(/pixel limit/);
  });
});

describe('guide positions', () => {
  it('normalizes percentages', () => {
    expect(parseGuidePosition('50%', 1080)).toBe(0.5);
    expect(parseGuidePosition('25%', 1080)).toBe(0.25);
    expect(parseGuidePosition('33.333%', 1080)).toBeCloseTo(0.33333, 6);
  });

  it('normalizes pixels against the axis size', () => {
    expect(parseGuidePosition('540px', 1080)).toBe(0.5);
    expect(parseGuidePosition('0px', 1080)).toBe(0);
  });

  it('accepts a bare number as a normalized position', () => {
    expect(parseGuidePosition(0.5, 1080)).toBe(0.5);
  });

  it('rejects positions without a unit', () => {
    expect(() => parseGuidePosition('50', 1080)).toThrow(/needs a unit/);
  });

  it.each(['-1%', '101%', '2000px'])('rejects out of range position %s', (position) => {
    expect(() => parseGuidePosition(position, 1080)).toThrow(/outside/);
  });

  it('rejects a normalized number outside 0-1', () => {
    expect(() => parseGuidePosition(1.5, 1080)).toThrow(OverlayError);
  });

  it('formats percentages without trailing zeros', () => {
    expect(formatPercent(0.5)).toBe('50%');
    expect(formatPercent(1 / 3)).toBe('33.333%');
  });
});

describe('guides', () => {
  it('draws a horizontal guide at 50%', () => {
    const image = renderOverlay({ ...base, horizontalGuides: ['50%'] });
    expect(paintedRows(image)).toEqual([539, 540]);
    expect(paintedColumns(image).length).toBe(1920);
  });

  it('places a px guide at the same place as the equivalent percentage', () => {
    const percent = renderOverlay({ ...base, horizontalGuides: ['50%'] });
    const pixels = renderOverlay({ ...base, horizontalGuides: ['540px'] });
    expect(Array.from(pixels.data)).toEqual(Array.from(percent.data));
  });

  it('draws a vertical guide at 50%', () => {
    const image = renderOverlay({ ...base, verticalGuides: ['50%'] });
    expect(paintedColumns(image)).toEqual([959, 960]);
  });

  it('keeps edge guides inside the canvas', () => {
    expect(paintedRows(renderOverlay({ ...base, horizontalGuides: ['0%'] }))).toEqual([0, 1]);
    expect(paintedRows(renderOverlay({ ...base, horizontalGuides: ['100%'] }))).toEqual([1078, 1079]);
  });

  it('combines multiple guides', () => {
    const image = renderOverlay({ ...base, horizontalGuides: ['25%', '75%'], verticalGuides: ['50%'] });
    expect(paintedRows(image).length).toBeGreaterThan(2);
    expect(pixelAt(image, 100, 270)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(image, 100, 810)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(image, 960, 100)).toEqual([255, 0, 0, 255]);
  });

  it('centers the line on the position for odd widths', () => {
    expect(lineSpan(540, 1, 1080)).toEqual({ start: 540, length: 1 });
    expect(lineSpan(540, 3, 1080)).toEqual({ start: 539, length: 3 });
  });

  it('draws dashed lines as gapped runs', () => {
    const solid = renderOverlay({ ...base, horizontalGuides: ['50%'] });
    const dashed = renderOverlay({ ...base, horizontalGuides: ['50%'], style: { ...base.style, lineStyle: 'dashed' } });
    expect(paintedColumns(dashed).length).toBeLessThan(paintedColumns(solid).length);
    expect(paintedRows(dashed)).toEqual(paintedRows(solid));
  });
});

describe('presets', () => {
  it('center draws one line per axis', () => {
    const image = renderOverlay({ ...base, presets: ['center'] });
    expect(paintedRowsAt(image, 5)).toEqual([539, 540]);
    expect(paintedColumnsAt(image, 5)).toEqual([959, 960]);
  });

  it('thirds draws two lines per axis', () => {
    const image = renderOverlay({ ...base, presets: ['thirds'] });
    expect(paintedRowsAt(image, 5)).toEqual([359, 360, 719, 720]);
    expect(paintedColumnsAt(image, 5)).toEqual([639, 640, 1279, 1280]);
  });

  it('quarters draws three lines per axis', () => {
    const image = renderOverlay({ ...base, presets: ['quarters'] });
    expect(paintedRowsAt(image, 5)).toEqual([269, 270, 539, 540, 809, 810]);
    expect(paintedColumnsAt(image, 5)).toEqual([479, 480, 959, 960, 1439, 1440]);
  });

  it('presets are not exclusive', () => {
    const image = renderOverlay({ ...base, presets: ['thirds', 'center'] });
    expect(paintedRowsAt(image, 5)).toEqual([359, 360, 539, 540, 719, 720]);
    expect(paintedColumnsAt(image, 5)).toEqual([639, 640, 959, 960, 1279, 1280]);
  });

  it('keeps preset values in one place', () => {
    expect(PRESETS.thirds.horizontal).toEqual([1 / 3, 2 / 3]);
    expect(PRESETS.quarters.vertical).toEqual([0.25, 0.5, 0.75]);
  });

  it('rejects an unknown preset', () => {
    expect(() => renderOverlay({ ...base, presets: ['golden' as never] })).toThrow(/Unknown preset/);
  });
});

describe('cinema', () => {
  it.each([1.85, 2.35, 2.39] as const)('fits %s inside a 1920x1080 canvas', (ratio) => {
    const cinemaHeight = 1920 / ratio;
    const crop = computeCinemaCrop(1920, 1080, ratio);
    expect(crop.orientation).toBe('top-bottom');
    expect(crop.height).toBeCloseTo(cinemaHeight, 6);
    expect(crop.crop).toBeCloseTo((1080 - cinemaHeight) / 2, 6);
    expect(crop.y + crop.height).toBeCloseTo(1080 - crop.crop, 6);
  });

  it('scales with the canvas instead of using fixed pixels', () => {
    const hd = computeCinemaCrop(1920, 1080, 2.39);
    const uhd = computeCinemaCrop(3840, 2160, 2.39);
    expect(uhd.crop).toBeCloseTo(hd.crop * 2, 6);
  });

  it('crops the sides when the frame cannot get any shorter', () => {
    const crop = computeCinemaCrop(3840, 1000, 1.85);
    expect(crop.orientation).toBe('left-right');
    expect(crop.width).toBeCloseTo(1850, 6);
    expect(crop.height).toBe(1000);
    expect(crop.x).toBeCloseTo((3840 - 1850) / 2, 6);
  });

  it('stays inside a portrait canvas', () => {
    const crop = computeCinemaCrop(1080, 1920, 2.39);
    expect(crop.orientation).toBe('top-bottom');
    expect(crop.y).toBeGreaterThan(0);
    expect(crop.y + crop.height).toBeLessThanOrEqual(1920);
  });

  it('draws two lines in lines mode', () => {
    const image = renderOverlay({ ...base, cinema: { ratio: 2.39 } });
    expect(paintedRowsAt(image, 5)).toEqual([137, 138, 941, 942]);
  });

  it('dims the cropped area in mask mode', () => {
    const image = renderOverlay({ ...base, cinema: { ratio: 2.39, mode: 'mask' } });
    expect(pixelAt(image, 960, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(image, 960, 540)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(image, 960, 1079)).toEqual([0, 0, 0, 255]);
  });

  it('rejects an unsupported ratio', () => {
    expect(() => renderOverlay({ ...base, cinema: { ratio: 3 as 2.39 } })).toThrow(/Unsupported cinema ratio/);
  });
});

describe('safe area', () => {
  it('insets action safe by 10% of each dimension', () => {
    expect(computeSafeArea(1920, 1080, 'action')).toEqual({ x: 192, y: 108, width: 1536, height: 864 });
    expect(SAFE_AREAS.action).toBe(0.1);
  });

  it('insets title safe by 20% of each dimension', () => {
    expect(computeSafeArea(1920, 1080, 'title')).toEqual({ x: 384, y: 216, width: 1152, height: 648 });
  });

  it('draws a rectangle', () => {
    const image = renderOverlay({ ...base, safeAreas: ['action'] });
    expect(paintedRowsAt(image, 960)).toEqual([107, 108, 971, 972]);
    expect(paintedColumnsAt(image, 540)).toEqual([191, 192, 1727, 1728]);
    // Corners are joined, the middle of the frame is untouched.
    expect(pixelAt(image, 192, 108)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(image, 960, 540)).toEqual([0, 0, 0, 0]);
  });

  it('rejects an unknown safe area', () => {
    expect(() => renderOverlay({ ...base, safeAreas: ['tiktok' as never] })).toThrow(/Unknown safe area/);
  });
});

describe('style', () => {
  it('parses hex colors', () => {
    expect(parseColor('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(parseColor('0f8')).toEqual({ r: 0, g: 255, b: 136, a: 255 });
    expect(parseColor('#00e5ff80')).toEqual({ r: 0, g: 229, b: 255, a: 128 });
  });

  it.each(['red', '#12345', '', '#gggggg'])('rejects invalid color %s', (color) => {
    expect(() => parseColor(color)).toThrow(/Invalid color/);
  });

  it('applies opacity to the guide color', () => {
    const image = renderOverlay({ ...base, horizontalGuides: ['50%'], style: { color: '#ff0000', opacity: 50 } });
    expect(pixelAt(image, 0, 540)).toEqual([255, 0, 0, 128]);
  });

  it('honours line width', () => {
    const image = renderOverlay({ ...base, horizontalGuides: ['50%'], style: { width: 8 } });
    expect(paintedRows(image).length).toBe(8);
  });

  it.each([{ opacity: 101 }, { opacity: -1 }, { width: 0 }, { lineStyle: 'dotted' as never }])(
    'rejects invalid style %o',
    (style) => {
      expect(() => renderOverlay({ ...base, style })).toThrow(OverlayError);
    },
  );
});

describe('labels', () => {
  it('is off by default', () => {
    const plain = renderOverlay({ ...base, horizontalGuides: ['50%'] });
    const labelled = renderOverlay({ ...base, horizontalGuides: ['50%'], labels: true });
    expect(paintedRows(plain).length).toBeLessThan(paintedRows(labelled).length);
  });

  it('keeps the text the user typed', () => {
    const image = renderOverlay({ ...base, horizontalGuides: ['540px'], labels: true });
    expect(paintedRows(image).length).toBeGreaterThan(2);
  });
});

describe('background', () => {
  it('is transparent by default', () => {
    expect(pixelAt(renderOverlay({ ...base, presets: ['center'] }), 10, 10)).toEqual([0, 0, 0, 0]);
  });

  it('fills black and white', () => {
    expect(pixelAt(renderOverlay({ ...base, background: 'black' }), 10, 10)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(renderOverlay({ ...base, background: 'white' }), 10, 10)).toEqual([255, 255, 255, 255]);
  });

  it('rejects an unknown background', () => {
    expect(() => renderOverlay({ ...base, background: 'grey' as never })).toThrow(/Unknown background/);
  });
});

describe('png export', () => {
  it('writes an RGBA PNG of the requested size', async () => {
    const result = await generateOverlay({ width: 640, height: 360, presets: ['thirds'] });
    const png = decodePng(result.png);
    expect(png.width).toBe(640);
    expect(png.height).toBe(360);
    expect(png.colorType).toBe(6);
    expect(png.bitDepth).toBe(8);
  });

  it('keeps the alpha channel for transparent output', async () => {
    const result = await generateOverlay({ width: 64, height: 64, presets: ['center'] });
    const png = decodePng(result.png);
    expect(pixelAt(png, 0, 0)[3]).toBe(0);
    expect(pixelAt(png, 32, 10)[3]).toBeGreaterThan(0);
  });

  it('exports exactly the pixels the preview renders', async () => {
    const options: OverlayOptions = {
      width: 320,
      height: 180,
      presets: ['thirds'],
      cinema: { ratio: 2.39, mode: 'mask' },
      safeAreas: ['title'],
      horizontalGuides: ['12.5%'],
      labels: true,
    };
    const image = renderOverlay(options);
    const png = decodePng((await generateOverlay(options)).png);
    expect(Array.from(png.rgba)).toEqual(Array.from(image.data));
  });

  it('suggests a file name from the size', () => {
    expect(overlayFileName(3840, 2160)).toBe('overlay-guide-3840x2160.png');
  });

  it('reports a mismatched buffer instead of writing a broken PNG', async () => {
    const image = renderOverlay({ width: 8, height: 8 });
    await expect(encodeOverlay({ ...image, width: 9 }, (data) => data)).rejects.toThrow(/RGBA data/);
  });
});
