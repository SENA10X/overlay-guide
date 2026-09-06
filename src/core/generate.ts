import { computeCinemaCrop } from './cinema';
import { resolveDeflate } from './deflate';
import { buildGuides, formatPercent, Guide, validateSize } from './guides';
import { Deflate, encodeRgbaPng } from './png';
import { DEFAULT_STYLE, PRESETS, SAFE_AREAS } from './presets';
import {
  BLACK,
  drawText,
  labelScale,
  lineSpan,
  parseColor,
  Raster,
  Rgba,
  strokeHorizontal,
  strokeRect,
  strokeVertical,
  textHeight,
  textWidth,
  TRANSPARENT,
  WHITE,
  withOpacity,
} from './renderer';
import { computeSafeArea } from './safe-area';
import {
  BackgroundName,
  CinemaMode,
  GuideStyle,
  LineStyle,
  OverlayError,
  OverlayImage,
  OverlayOptions,
  OverlayPreset,
  OverlayResult,
  SafeAreaName,
} from './types';

const BACKGROUNDS: Record<BackgroundName, Rgba> = {
  transparent: TRANSPARENT,
  black: BLACK,
  white: WHITE,
};

const LINE_STYLES: LineStyle[] = ['solid', 'dashed'];
const CINEMA_MODES: CinemaMode[] = ['lines', 'mask'];

interface ResolvedStyle {
  color: Rgba;
  thickness: number;
  dashed: boolean;
}

function resolveStyle(style: GuideStyle | undefined): ResolvedStyle {
  const opacity = style?.opacity ?? DEFAULT_STYLE.opacity;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) {
    throw new OverlayError('invalid-style', `Opacity must be between 0 and 100, got ${String(opacity)}.`);
  }
  const width = style?.width ?? DEFAULT_STYLE.width;
  if (!Number.isFinite(width) || width < 1) {
    throw new OverlayError('invalid-style', `Line width must be at least 1, got ${String(width)}.`);
  }
  const lineStyle = style?.lineStyle ?? DEFAULT_STYLE.lineStyle;
  if (!LINE_STYLES.includes(lineStyle)) {
    throw new OverlayError('invalid-style', `Unknown line style: ${lineStyle}. Supported: ${LINE_STYLES.join(', ')}.`);
  }
  return {
    color: withOpacity(parseColor(style?.color ?? DEFAULT_STYLE.color), opacity),
    thickness: width,
    dashed: lineStyle === 'dashed',
  };
}

function presetGuides(presets: OverlayPreset[] | undefined): Guide[] {
  if (!presets) return [];
  const guides: Guide[] = [];
  for (const name of presets) {
    const preset = PRESETS[name];
    if (!preset) {
      throw new OverlayError(
        'unknown-preset',
        `Unknown preset: ${name}. Supported: ${Object.keys(PRESETS).join(', ')}.`,
      );
    }
    for (const position of preset.horizontal) {
      guides.push({ axis: 'horizontal', position, label: formatPercent(position) });
    }
    for (const position of preset.vertical) {
      guides.push({ axis: 'vertical', position, label: formatPercent(position) });
    }
  }
  return guides;
}

function checkSafeAreas(names: SafeAreaName[] | undefined): SafeAreaName[] {
  if (!names) return [];
  for (const name of names) {
    if (SAFE_AREAS[name] === undefined) {
      throw new OverlayError(
        'unknown-safe-area',
        `Unknown safe area: ${name}. Supported: ${Object.keys(SAFE_AREAS).join(', ')}.`,
      );
    }
  }
  return names;
}

/**
 * Renders the overlay into an RGBA buffer. Synchronous, so the web preview can
 * call it on every keystroke; `generateOverlay` adds PNG encoding on top.
 */
export function renderOverlay(options: OverlayOptions): OverlayImage {
  const { width, height } = options;
  validateSize(width, height);

  const background = options.background ?? 'transparent';
  if (!(background in BACKGROUNDS)) {
    throw new OverlayError(
      'unknown-background',
      `Unknown background: ${background}. Supported: ${Object.keys(BACKGROUNDS).join(', ')}.`,
    );
  }

  const style = resolveStyle(options.style);
  const guides = [
    ...presetGuides(options.presets),
    ...buildGuides('horizontal', options.horizontalGuides, height),
    ...buildGuides('vertical', options.verticalGuides, width),
  ];
  const safeAreas = checkSafeAreas(options.safeAreas);

  const raster = new Raster(width, height, BACKGROUNDS[background]);
  const stroke = { thickness: style.thickness, color: style.color, dashed: style.dashed };

  if (options.cinema) {
    const mode = options.cinema.mode ?? 'lines';
    if (!CINEMA_MODES.includes(mode)) {
      throw new OverlayError(
        'invalid-style',
        `Unknown cinema mode: ${mode}. Supported: ${CINEMA_MODES.join(', ')}.`,
      );
    }
    const crop = computeCinemaCrop(width, height, options.cinema.ratio);
    if (mode === 'mask') {
      // The cropped-away area is dimmed rather than drawn in the guide color,
      // so it reads as "this is gone" at any guide color.
      const mask = { ...BLACK, a: style.color.a };
      if (crop.orientation === 'top-bottom') {
        raster.fillRect(0, 0, width, Math.round(crop.y), mask);
        raster.fillRect(0, Math.round(crop.y + crop.height), width, height, mask);
      } else {
        raster.fillRect(0, 0, Math.round(crop.x), height, mask);
        raster.fillRect(Math.round(crop.x + crop.width), 0, width, height, mask);
      }
    } else if (crop.orientation === 'top-bottom') {
      strokeHorizontal(raster, crop.y, stroke);
      strokeHorizontal(raster, crop.y + crop.height, stroke);
    } else {
      strokeVertical(raster, crop.x, stroke);
      strokeVertical(raster, crop.x + crop.width, stroke);
    }
  }

  for (const name of safeAreas) {
    strokeRect(raster, computeSafeArea(width, height, name), stroke);
  }

  for (const guide of guides) {
    if (guide.axis === 'horizontal') strokeHorizontal(raster, guide.position * height, stroke);
    else strokeVertical(raster, guide.position * width, stroke);
  }

  if (options.labels) drawLabels(raster, guides, style);

  return { width, height, data: raster.data };
}

function drawLabels(raster: Raster, guides: Guide[], style: ResolvedStyle): void {
  const scale = labelScale(raster.width, raster.height);
  const pad = scale * 2;
  const size = textHeight(scale);
  for (const guide of guides) {
    if (guide.axis === 'horizontal') {
      const span = lineSpan(guide.position * raster.height, style.thickness, raster.height);
      const above = span.start - size - pad;
      const y = above >= 0 ? above : span.start + span.length + pad;
      drawText(raster, pad, y, guide.label, scale, style.color);
    } else {
      const span = lineSpan(guide.position * raster.width, style.thickness, raster.width);
      const right = span.start + span.length + pad;
      const x = right + textWidth(guide.label, scale) <= raster.width ? right : span.start - textWidth(guide.label, scale) - pad;
      drawText(raster, Math.max(0, x), pad, guide.label, scale, style.color);
    }
  }
}

export function overlayFileName(width: number, height: number): string {
  return `overlay-guide-${width}x${height}.png`;
}

/** Encodes an already rendered overlay. Exposed for callers with their own deflate. */
export function encodeOverlay(image: OverlayImage, deflate: Deflate): Promise<Uint8Array> {
  return encodeRgbaPng(image.data, image.width, image.height, deflate);
}

/**
 * Renders an overlay and encodes it as a transparent-capable PNG.
 * This is the single entry point behind the web UI, the CLI and the npm API.
 */
export async function generateOverlay(options: OverlayOptions): Promise<OverlayResult> {
  const image = renderOverlay(options);
  const png = await encodeOverlay(image, await resolveDeflate());
  return { ...image, png, fileName: overlayFileName(image.width, image.height) };
}
