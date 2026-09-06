import { CinemaRatio, OverlayPreset, SafeAreaName } from './types';

/**
 * Composition presets as normalized 0-1 positions. Web, CLI and the API all
 * read these values from here; nothing redefines them.
 */
export const PRESETS: Record<OverlayPreset, { vertical: number[]; horizontal: number[] }> = {
  center: { vertical: [1 / 2], horizontal: [1 / 2] },
  thirds: { vertical: [1 / 3, 2 / 3], horizontal: [1 / 3, 2 / 3] },
  quarters: { vertical: [1 / 4, 2 / 4, 3 / 4], horizontal: [1 / 4, 2 / 4, 3 / 4] },
};

export const PRESET_NAMES = Object.keys(PRESETS) as OverlayPreset[];

export const CINEMA_RATIOS: CinemaRatio[] = [1.85, 2.35, 2.39];

/** Inset from each edge, as a fraction of the matching canvas dimension. */
export const SAFE_AREAS: Record<SafeAreaName, number> = {
  action: 0.1,
  title: 0.2,
};

export const SAFE_AREA_NAMES = Object.keys(SAFE_AREAS) as SafeAreaName[];

/** Size presets offered by the web UI and listed in `--help`. */
export const SIZE_PRESETS: Array<{ width: number; height: number; label: string }> = [
  { width: 1920, height: 1080, label: '1920 × 1080' },
  { width: 3840, height: 2160, label: '3840 × 2160' },
  { width: 1280, height: 720, label: '1280 × 720' },
  { width: 1080, height: 1920, label: '1080 × 1920' },
  { width: 2160, height: 3840, label: '2160 × 3840' },
  { width: 1080, height: 1080, label: '1080 × 1080' },
  { width: 1080, height: 1350, label: '1080 × 1350' },
];

export const DEFAULT_STYLE = {
  color: '#00e5ff',
  opacity: 80,
  width: 2,
  lineStyle: 'solid' as const,
};

/** Hard limits. Beyond these the buffer allocation is the real problem. */
export const MAX_DIMENSION = 16384;
export const MAX_PIXELS = 80_000_000;
/** The web UI warns (but still allows) above this pixel count. */
export const LARGE_PIXELS = 20_000_000;
