/**
 * Google Analytics 4 wrapper.
 *
 * Every SENA GitHub Pages tool sends the same four events, so this file is
 * meant to be copied as-is: only TOOL_NAME and TOOL_VERSION change.
 *
 * Nothing a user could be identified by ever reaches this module — callers
 * pass canvas dimensions, counts and fixed enum strings, never free text.
 */
import { OverlayError } from '../../src/core/types';

const TOOL_NAME = 'overlay-guide';
const TOOL_VERSION = '1.0.0';

/** The only event names this tool reports. */
export type ToolEvent = 'tool_input' | 'tool_run' | 'tool_download' | 'tool_error';

/** Params are counts and fixed enum strings only — never user-supplied text. */
export type EventParams = Record<string, string | number | boolean>;

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    dataLayer?: unknown[];
  }
}

/** Local development must not pollute production metrics. */
function isDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Sends one event, with the tool identity attached.
 *
 * Analytics is best-effort: a missing gtag, a blocked script or a throwing
 * transport must never surface to the caller.
 */
export function track(event: ToolEvent, params: EventParams = {}): void {
  try {
    if (typeof window === 'undefined') return;
    if (isDevHost(window.location.hostname)) return;
    const gtag = window.gtag;
    if (typeof gtag !== 'function') return;
    gtag('event', event, {
      ...params,
      tool_name: TOOL_NAME,
      tool_version: TOOL_VERSION,
    });
  } catch {
    // Never let measurement break the tool.
  }
}

/** Fixed error categories; raw messages are never reported. */
export type ErrorType = 'invalid_size' | 'invalid_position' | 'invalid_style' | 'unsupported_option' | 'unknown';

const ERROR_TYPES: Record<string, ErrorType> = {
  'invalid-size': 'invalid_size',
  'size-too-large': 'invalid_size',
  'invalid-position': 'invalid_position',
  'position-out-of-range': 'invalid_position',
  'invalid-color': 'invalid_style',
  'invalid-style': 'invalid_style',
  'unknown-preset': 'unsupported_option',
  'unknown-cinema-ratio': 'unsupported_option',
  'unknown-safe-area': 'unsupported_option',
  'unknown-background': 'unsupported_option',
};

/**
 * Maps an internal error onto a safe, fixed category.
 *
 * Only the core's own error codes are translated — they are a closed set. Any
 * other failure falls back, so an unexpected message is dropped rather than
 * forwarded.
 */
export function errorType(error: unknown, fallback: ErrorType = 'unknown'): ErrorType {
  if (error instanceof OverlayError) return ERROR_TYPES[error.code] ?? fallback;
  return fallback;
}
