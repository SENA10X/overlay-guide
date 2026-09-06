import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateOverlay, overlayFileName, renderOverlay } from '../../src/core/generate';
import {
  CINEMA_RATIOS,
  DEFAULT_STYLE,
  LARGE_PIXELS,
  PRESET_NAMES,
  SAFE_AREA_NAMES,
  SIZE_PRESETS,
} from '../../src/core/presets';
import { errorType, track } from './analytics';
import {
  BackgroundName,
  CinemaMode,
  CinemaRatio,
  LineStyle,
  OverlayImage,
  OverlayOptions,
  OverlayPreset,
  SafeAreaName,
} from '../../src/core/types';

/** How the user first touched the tool. Reported once per session. */
type InputMethod = 'custom_size' | 'size_preset' | 'preset' | 'cinema' | 'safe_area' | 'guide' | 'style' | 'background';

interface CustomGuide {
  id: string;
  axis: 'horizontal' | 'vertical';
  value: string;
}

const BACKGROUNDS: BackgroundName[] = ['transparent', 'black', 'white'];
const LINE_STYLES: LineStyle[] = ['solid', 'dashed'];

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The download starts asynchronously, so the URL must outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function App() {
  const [widthText, setWidthText] = useState('1920');
  const [heightText, setHeightText] = useState('1080');
  const [presets, setPresets] = useState<OverlayPreset[]>(['thirds']);
  const [cinema, setCinema] = useState<CinemaRatio | null>(null);
  const [cinemaMode, setCinemaMode] = useState<CinemaMode>('lines');
  const [safeAreas, setSafeAreas] = useState<SafeAreaName[]>([]);
  const [guides, setGuides] = useState<CustomGuide[]>([]);
  const [color, setColor] = useState(DEFAULT_STYLE.color);
  const [opacity, setOpacity] = useState(DEFAULT_STYLE.opacity);
  const [lineWidth, setLineWidth] = useState(DEFAULT_STYLE.width);
  const [lineStyle, setLineStyle] = useState<LineStyle>(DEFAULT_STYLE.lineStyle);
  const [labels, setLabels] = useState(false);
  const [background, setBackground] = useState<BackgroundName>('transparent');
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const configured = useRef(false);

  // One `tool_input` per session, tagged with whatever the user reached for
  // first. Every later change is already covered by `tool_run`.
  const configure = useCallback((method: InputMethod) => {
    if (configured.current) return;
    configured.current = true;
    track('tool_input', { input_method: method });
  }, []);

  const width = Number(widthText);
  const height = Number(heightText);

  const options = useMemo<OverlayOptions>(
    () => ({
      width,
      height,
      presets,
      horizontalGuides: guides.filter((g) => g.axis === 'horizontal').map((g) => g.value),
      verticalGuides: guides.filter((g) => g.axis === 'vertical').map((g) => g.value),
      ...(cinema !== null ? { cinema: { ratio: cinema, mode: cinemaMode } } : {}),
      safeAreas,
      style: { color, opacity, width: lineWidth, lineStyle },
      labels,
      background,
    }),
    [width, height, presets, guides, cinema, cinemaMode, safeAreas, color, opacity, lineWidth, lineStyle, labels, background],
  );

  const [image, setImage] = useState<OverlayImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Rendering a 4K overlay takes long enough to feel sticky while typing, so
  // the preview settles one frame after the last change.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setImage(renderOverlay(options));
        setError(null);
      } catch (e) {
        setImage(null);
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [options]);

  // The canvas is always the real output size; CSS scales it down to fit, so
  // what is on screen and what is exported are the same pixels.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Re-wrapped rather than copied: the view is already the right layout, this
    // only pins the buffer type ImageData asks for.
    const pixels = new Uint8ClampedArray(image.data.buffer as ArrayBuffer, image.data.byteOffset, image.data.length);
    ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
  }, [image]);

  const onExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await generateOverlay(options);
      track('tool_run', {
        width: result.width,
        height: result.height,
        preset_count: presets.length,
        guide_count: guides.length,
        safe_area_count: safeAreas.length,
        cinema_mode: cinema === null ? 'none' : cinemaMode,
        line_style: lineStyle,
        labels,
        background,
      });
      download(new Blob([result.png as BlobPart], { type: 'image/png' }), result.fileName);
      track('tool_download', { download_type: 'png', file_count: 1 });
      setError(null);
    } catch (e) {
      track('tool_error', { operation: 'export', error_type: errorType(e) });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [options, presets.length, guides.length, safeAreas.length, cinema, cinemaMode, lineStyle, labels, background]);

  const addGuide = (axis: CustomGuide['axis']) => {
    setGuides((current) => [...current, { id: `${Date.now()}-${current.length}`, axis, value: '50%' }]);
    configure('guide');
  };

  const sizeValid = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
  const large = sizeValid && width * height > LARGE_PIXELS;

  return (
    <main>
      <header>
        <h1>overlay-guide</h1>
        <p>Generate transparent guide overlays for video editing.</p>
        <p className="muted">Everything runs in your browser. No upload, no account.</p>
      </header>

      <section>
        <h2>Size</h2>
        <div className="row">
          <label htmlFor="width">Width</label>
          <input
            id="width"
            type="number"
            min={1}
            value={widthText}
            onChange={(e) => {
              setWidthText(e.target.value);
              configure('custom_size');
            }}
          />
          <span aria-hidden="true">×</span>
          <label htmlFor="height">Height</label>
          <input
            id="height"
            type="number"
            min={1}
            value={heightText}
            onChange={(e) => {
              setHeightText(e.target.value);
              configure('custom_size');
            }}
          />
        </div>
        <div className="chips">
          {SIZE_PRESETS.map((size) => (
            <button
              key={size.label}
              type="button"
              aria-pressed={width === size.width && height === size.height}
              onClick={() => {
                setWidthText(String(size.width));
                setHeightText(String(size.height));
                configure('size_preset');
              }}
            >
              {size.label}
            </button>
          ))}
        </div>
        {large && <p className="warning">That is a very large canvas. Rendering and export may take a while.</p>}
      </section>

      <section>
        <h2>Presets</h2>
        <div className="chips">
          {PRESET_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={presets.includes(name)}
              onClick={() => {
                setPresets((current) => toggle(current, name));
                configure('preset');
              }}
            >
              {presets.includes(name) ? '✓ ' : ''}
              {name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Cinema</h2>
        <div className="chips">
          {CINEMA_RATIOS.map((ratio) => (
            <button
              key={ratio}
              type="button"
              aria-pressed={cinema === ratio}
              onClick={() => {
                setCinema((current) => (current === ratio ? null : ratio));
                configure('cinema');
              }}
            >
              {cinema === ratio ? '✓ ' : ''}
              {ratio}:1
            </button>
          ))}
        </div>
        <div className="chips">
          {(['lines', 'mask'] as CinemaMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={cinema === null}
              aria-pressed={cinemaMode === mode}
              onClick={() => {
                setCinemaMode(mode);
                configure('cinema');
              }}
            >
              {cinemaMode === mode ? '✓ ' : ''}
              {mode}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Safe area</h2>
        <div className="chips">
          {SAFE_AREA_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={safeAreas.includes(name)}
              onClick={() => {
                setSafeAreas((current) => toggle(current, name));
                configure('safe_area');
              }}
            >
              {safeAreas.includes(name) ? '✓ ' : ''}
              {name} safe
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Custom guides</h2>
        {guides.length === 0 && <p className="muted">No custom guides.</p>}
        <ul className="guides">
          {guides.map((guide) => (
            <li key={guide.id}>
              <span className="axis" aria-hidden="true">
                {guide.axis === 'horizontal' ? 'H' : 'V'}
              </span>
              <label className="visually-hidden" htmlFor={`guide-${guide.id}`}>
                {guide.axis} guide position
              </label>
              <input
                id={`guide-${guide.id}`}
                type="text"
                value={guide.value}
                placeholder="50% or 540px"
                onChange={(e) => {
                  setGuides((current) =>
                    current.map((entry) => (entry.id === guide.id ? { ...entry, value: e.target.value } : entry)),
                  );
                  configure('guide');
                }}
              />
              <button
                type="button"
                aria-label={`Remove ${guide.axis} guide ${guide.value}`}
                onClick={() => setGuides((current) => current.filter((entry) => entry.id !== guide.id))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="chips">
          <button type="button" onClick={() => addGuide('horizontal')}>
            + Horizontal
          </button>
          <button type="button" onClick={() => addGuide('vertical')}>
            + Vertical
          </button>
        </div>
      </section>

      <section>
        <h2>Style</h2>
        <div className="row">
          <label htmlFor="color">Color</label>
          <input id="color" type="color" value={color} onChange={(e) => {
              setColor(e.target.value);
              configure('style');
            }} />
          <label htmlFor="line-width">Width</label>
          <input
            id="line-width"
            type="number"
            min={1}
            value={lineWidth}
            onChange={(e) => {
              setLineWidth(Number(e.target.value));
              configure('style');
            }}
          />
        </div>
        <div className="row">
          <label htmlFor="opacity">Opacity {opacity}%</label>
          <input
            id="opacity"
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => {
              setOpacity(Number(e.target.value));
              configure('style');
            }}
          />
        </div>
        <div className="chips">
          {LINE_STYLES.map((style) => (
            <button key={style} type="button" aria-pressed={lineStyle === style} onClick={() => {
                setLineStyle(style);
                configure('style');
              }}>
              {lineStyle === style ? '✓ ' : ''}
              {style}
            </button>
          ))}
          <button type="button" aria-pressed={labels} onClick={() => {
              setLabels((current) => !current);
              configure('style');
            }}>
            {labels ? '✓ ' : ''}labels
          </button>
        </div>
      </section>

      <section>
        <h2>Background</h2>
        <div className="chips">
          {BACKGROUNDS.map((name) => (
            <button key={name} type="button" aria-pressed={background === name} onClick={() => {
                setBackground(name);
                configure('background');
              }}>
              {background === name ? '✓ ' : ''}
              {name}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Preview</h2>
        {error && <p className="error">{error}</p>}
        <div className="preview">
          <canvas ref={canvasRef} aria-label={`Overlay preview, ${width} × ${height}`} role="img" />
        </div>
        <p className="muted">
          {sizeValid ? `Output: ${overlayFileName(width, height)}` : 'Enter a positive width and height.'}
        </p>
        <button type="button" className="primary" onClick={onExport} disabled={!!error || !sizeValid || exporting}>
          {exporting ? 'Exporting…' : 'Export PNG'}
        </button>
      </section>

      <footer>
        <p className="muted">
          MIT licensed. <a href="https://github.com/SENA10X/overlay-guide">Source on GitHub</a> · CLI:{' '}
          <code>npx overlay-guide --preset thirds</code>
        </p>
      </footer>
    </main>
  );
}
