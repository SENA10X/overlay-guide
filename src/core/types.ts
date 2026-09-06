/** Composition presets. Values live in `presets.ts`. */
export type OverlayPreset = 'center' | 'thirds' | 'quarters';

/** Cinema aspect ratios supported in v1. */
export type CinemaRatio = 1.85 | 2.35 | 2.39;

/** `lines` draws the crop boundary, `mask` dims the cropped-away area. */
export type CinemaMode = 'lines' | 'mask';

export type SafeAreaName = 'action' | 'title';

export type LineStyle = 'solid' | 'dashed';

export type BackgroundName = 'transparent' | 'black' | 'white';

/**
 * A guide position: `'50%'`, `'540px'`, or a normalized number in 0-1.
 * Bare numeric strings are rejected so `'50'` can never mean two things.
 */
export type GuidePosition = string | number;

export interface GuideStyle {
  /** Hex color, e.g. `#00e5ff`. */
  color?: string;
  /** 0-100. */
  opacity?: number;
  /** Line thickness in pixels, >= 1. */
  width?: number;
  lineStyle?: LineStyle;
}

export interface CinemaOptions {
  ratio: CinemaRatio;
  mode?: CinemaMode;
}

export interface OverlayOptions {
  width: number;
  height: number;
  presets?: OverlayPreset[];
  horizontalGuides?: GuidePosition[];
  verticalGuides?: GuidePosition[];
  cinema?: CinemaOptions;
  safeAreas?: SafeAreaName[];
  style?: GuideStyle;
  /** Draw the position of every guide next to it. Default: false. */
  labels?: boolean;
  background?: BackgroundName;
}

/** Straight (non-premultiplied) RGBA samples, 4 bytes per pixel. */
export interface OverlayImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface OverlayResult extends OverlayImage {
  png: Uint8Array;
  /** Suggested file name, e.g. `overlay-guide-1920x1080.png`. */
  fileName: string;
}

export type OverlayErrorCode =
  | 'invalid-size'
  | 'size-too-large'
  | 'invalid-position'
  | 'position-out-of-range'
  | 'invalid-color'
  | 'invalid-style'
  | 'unknown-preset'
  | 'unknown-cinema-ratio'
  | 'unknown-safe-area'
  | 'unknown-background';

/** Every rejection from the core carries a stable machine-readable code. */
export class OverlayError extends Error {
  readonly code: OverlayErrorCode;

  constructor(code: OverlayErrorCode, message: string) {
    super(message);
    this.name = 'OverlayError';
    this.code = code;
  }
}
