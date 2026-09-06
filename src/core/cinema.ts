import { CINEMA_RATIOS } from './presets';
import { CinemaRatio, OverlayError } from './types';

export interface CinemaCrop {
  /** The area that survives the crop, in pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Which pair of edges gets cropped for this canvas. */
  orientation: 'top-bottom' | 'left-right';
  /** Crop amount on each of the two cropped edges. */
  crop: number;
}

export function assertCinemaRatio(ratio: number): asserts ratio is CinemaRatio {
  if (!CINEMA_RATIOS.includes(ratio as CinemaRatio)) {
    throw new OverlayError(
      'unknown-cinema-ratio',
      `Unsupported cinema ratio: ${ratio}. Supported: ${CINEMA_RATIOS.join(', ')}.`,
    );
  }
}

/**
 * Fits `ratio` inside the canvas and returns the surviving rectangle.
 *
 * The crop is derived from the canvas, never from fixed pixel values. When the
 * target frame is taller than the canvas allows (a portrait canvas, or any
 * canvas wider than the ratio) the crop switches to the left and right edges,
 * so the result stays inside the canvas at every aspect ratio.
 */
export function computeCinemaCrop(width: number, height: number, ratio: CinemaRatio): CinemaCrop {
  assertCinemaRatio(ratio);
  const cinemaHeight = width / ratio;
  if (cinemaHeight <= height) {
    const crop = (height - cinemaHeight) / 2;
    return { x: 0, y: crop, width, height: cinemaHeight, orientation: 'top-bottom', crop };
  }
  const cinemaWidth = height * ratio;
  const crop = (width - cinemaWidth) / 2;
  return { x: crop, y: 0, width: cinemaWidth, height, orientation: 'left-right', crop };
}
