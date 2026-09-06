/**
 * The analytics wrapper must be invisible to the tool: no gtag, a dev host or a
 * throwing transport all have to end as a silent no-op.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { errorType, track } from '../web/src/analytics';
import { OverlayError } from '../src/core/types';

interface Call {
  args: unknown[];
}

function stubWindow(hostname: string, gtag?: (...args: unknown[]) => void): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('window', {
    location: { hostname },
    gtag: gtag ?? ((...args: unknown[]) => calls.push({ args })),
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('track', () => {
  it('adds tool_name and tool_version to every event', () => {
    const calls = stubWindow('sena10x.github.io');
    track('tool_run');
    expect(calls).toHaveLength(1);
    expect(calls[0].args[0]).toBe('event');
    expect(calls[0].args[1]).toBe('tool_run');
    expect(calls[0].args[2]).toEqual({ tool_name: 'overlay-guide', tool_version: '1.0.0' });
  });

  it('passes params through alongside the tool identity', () => {
    const calls = stubWindow('sena10x.github.io');
    track('tool_run', { width: 1920, height: 1080, preset_count: 1 });
    expect(calls[0].args[2]).toEqual({
      width: 1920,
      height: 1080,
      preset_count: 1,
      tool_name: 'overlay-guide',
      tool_version: '1.0.0',
    });
  });

  it('does nothing when gtag is missing', () => {
    vi.stubGlobal('window', { location: { hostname: 'sena10x.github.io' } });
    expect(() => track('tool_run')).not.toThrow();
  });

  it('does nothing when there is no window at all', () => {
    vi.stubGlobal('window', undefined);
    expect(() => track('tool_run')).not.toThrow();
  });

  it('swallows a throwing gtag', () => {
    stubWindow('sena10x.github.io', () => {
      throw new Error('blocked by an extension');
    });
    expect(() => track('tool_download', { download_type: 'png', file_count: 1 })).not.toThrow();
  });

  it('sends nothing from localhost', () => {
    for (const hostname of ['localhost', '127.0.0.1']) {
      const calls = stubWindow(hostname);
      track('tool_run', { width: 1920, height: 1080 });
      expect(calls).toEqual([]);
    }
  });
});

describe('errorType', () => {
  it('maps core error codes to fixed categories', () => {
    expect(errorType(new OverlayError('invalid-size', 'width must be greater than 0, got 0.'))).toBe('invalid_size');
    expect(errorType(new OverlayError('size-too-large', 'above the pixel limit.'))).toBe('invalid_size');
    expect(errorType(new OverlayError('position-out-of-range', 'Guide position 120% is outside 0% - 100%.'))).toBe(
      'invalid_position',
    );
    expect(errorType(new OverlayError('invalid-color', 'Invalid color: red.'))).toBe('invalid_style');
    expect(errorType(new OverlayError('unknown-preset', 'Unknown preset: golden.'))).toBe('unsupported_option');
  });

  it('falls back instead of forwarding the raw message', () => {
    const error = new Error('Could not read /Users/sena/secret/board.png');
    expect(errorType(error, 'invalid_style')).toBe('invalid_style');
    expect(errorType(error)).toBe('unknown');
    expect(errorType('not an error')).toBe('unknown');
  });

  it('never reports an error message, only a category', () => {
    const categories = new Set<string>();
    for (const code of ['invalid-size', 'invalid-position', 'invalid-color', 'unknown-background'] as const) {
      categories.add(errorType(new OverlayError(code, 'a message that must not travel')));
    }
    expect([...categories].every((category) => /^[a-z_]+$/.test(category))).toBe(true);
  });
});
