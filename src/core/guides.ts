import { MAX_DIMENSION, MAX_PIXELS } from './presets';
import { GuidePosition, OverlayError } from './types';

/** A guide reduced to what the renderer needs. */
export interface Guide {
  axis: 'horizontal' | 'vertical';
  /** Normalized 0-1 position along the axis. */
  position: number;
  /** Text drawn when labels are on, e.g. `50%` or `540px`. */
  label: string;
}

export function validateSize(width: number, height: number): void {
  for (const [name, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new OverlayError('invalid-size', `${name} must be an integer, got ${String(value)}.`);
    }
    if (value <= 0) {
      throw new OverlayError('invalid-size', `${name} must be greater than 0, got ${value}.`);
    }
    if (value > MAX_DIMENSION) {
      throw new OverlayError('size-too-large', `${name} must be at most ${MAX_DIMENSION}, got ${value}.`);
    }
  }
  if (width * height > MAX_PIXELS) {
    throw new OverlayError(
      'size-too-large',
      `${width} × ${height} is ${width * height} pixels, above the ${MAX_PIXELS} pixel limit.`,
    );
  }
}

/**
 * Converts a guide position to a normalized 0-1 coordinate.
 *
 * Percentages and pixels both end up normalized, so the renderer has a single
 * rounding rule and the web and CLI cannot drift apart. `size` is the canvas
 * extent along the guide's axis.
 */
export function parseGuidePosition(input: GuidePosition, size: number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new OverlayError('invalid-position', `Invalid guide position: ${String(input)}.`);
    }
    if (input < 0 || input > 1) {
      throw new OverlayError(
        'position-out-of-range',
        `A numeric guide position is normalized and must be between 0 and 1, got ${input}.`,
      );
    }
    return input;
  }

  const text = input.trim().toLowerCase();
  if (text.endsWith('%')) {
    const value = toNumber(text.slice(0, -1), input);
    if (value < 0 || value > 100) {
      throw new OverlayError('position-out-of-range', `Guide position ${input} is outside 0% - 100%.`);
    }
    return value / 100;
  }
  if (text.endsWith('px')) {
    const value = toNumber(text.slice(0, -2), input);
    if (value < 0 || value > size) {
      throw new OverlayError('position-out-of-range', `Guide position ${input} is outside 0px - ${size}px.`);
    }
    return value / size;
  }
  throw new OverlayError(
    'invalid-position',
    `Guide position ${input} needs a unit: use a percentage like 50% or pixels like 540px.`,
  );
}

function toNumber(text: string, original: string): number {
  const value = Number(text.trim());
  if (text.trim() === '' || !Number.isFinite(value)) {
    throw new OverlayError('invalid-position', `Invalid guide position: ${original}.`);
  }
  return value;
}

/** The label a user typed, or a formatted percentage for generated guides. */
export function guideLabel(input: GuidePosition, position: number): string {
  if (typeof input === 'string') return input.trim().toLowerCase();
  return formatPercent(position);
}

/** `0.5` -> `50%`, `1/3` -> `33.333%`. At most three decimals, no trailing zeros. */
export function formatPercent(position: number): string {
  const percent = position * 100;
  const rounded = Math.round(percent * 1000) / 1000;
  return `${String(rounded)}%`;
}

export function buildGuides(
  axis: Guide['axis'],
  positions: GuidePosition[] | undefined,
  size: number,
): Guide[] {
  if (!positions) return [];
  return positions.map((input) => {
    const position = parseGuidePosition(input, size);
    return { axis, position, label: guideLabel(input, position) };
  });
}
