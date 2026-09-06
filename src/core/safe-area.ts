import { SAFE_AREAS } from './presets';
import { OverlayError, SafeAreaName } from './types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The safe rectangle, inset from each edge by the preset fraction. */
export function computeSafeArea(width: number, height: number, name: SafeAreaName): Rect {
  const inset = SAFE_AREAS[name];
  if (inset === undefined) {
    throw new OverlayError(
      'unknown-safe-area',
      `Unknown safe area: ${name}. Supported: ${Object.keys(SAFE_AREAS).join(', ')}.`,
    );
  }
  const dx = width * inset;
  const dy = height * inset;
  return { x: dx, y: dy, width: width - dx * 2, height: height - dy * 2 };
}
