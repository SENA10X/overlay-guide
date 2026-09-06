import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { generateOverlay, overlayFileName } from '../core/generate';
import { CINEMA_RATIOS, DEFAULT_STYLE, PRESET_NAMES, SAFE_AREA_NAMES, SIZE_PRESETS } from '../core/presets';
import {
  BackgroundName,
  CinemaMode,
  CinemaRatio,
  GuidePosition,
  LineStyle,
  OverlayError,
  OverlayOptions,
  OverlayPreset,
  SafeAreaName,
} from '../core/types';

const USAGE = `overlay-guide - Generate transparent guide overlays for video editing.

Usage:
  overlay-guide [options]

Options:
  -s, --size <WxH>          Canvas size (default: 1920x1080)
  -p, --preset <name>       ${PRESET_NAMES.join(' | ')} (repeatable)
  -c, --cinema <ratio>      ${CINEMA_RATIOS.join(' | ')}
      --cinema-mode <mode>  lines | mask (default: lines)
  -H, --horizontal <pos>    Horizontal guide, e.g. 50% or 540px (repeatable)
  -V, --vertical <pos>      Vertical guide, e.g. 50% or 960px (repeatable)
      --safe <name>         ${SAFE_AREA_NAMES.join(' | ')} (repeatable)
      --color <hex>         Guide color (default: ${DEFAULT_STYLE.color})
      --opacity <0-100>     Guide opacity (default: ${DEFAULT_STYLE.opacity})
      --line-width <px>     Line width (default: ${DEFAULT_STYLE.width})
      --line-style <style>  solid | dashed (default: ${DEFAULT_STYLE.lineStyle})
      --labels              Draw the position next to each guide
  -b, --background <name>   transparent | black | white (default: transparent)
  -o, --output <path>       Output file (default: overlay-guide-{width}x{height}.png)
  -h, --help                Show this help
  -v, --version             Show version

Size presets:
  ${SIZE_PRESETS.map((size) => `${size.width}x${size.height}`).join(', ')}

Examples:
  overlay-guide --preset thirds --size 1920x1080
  overlay-guide --size 3840x2160 --cinema 2.39 --safe title
  overlay-guide --horizontal 50% --vertical 960px --output guide.png
`;

export interface CliOptions {
  overlay: OverlayOptions;
  output?: string;
}

/** Reads a required value for `flag`, or fails with a message that names it. */
function value(argv: string[], index: number, flag: string): string {
  const next = argv[index];
  if (next === undefined) throw new Error(`Missing value for ${flag}.`);
  return next;
}

function parseSize(text: string): { width: number; height: number } {
  const match = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(text.trim());
  if (!match) throw new Error(`Invalid size: ${text}. Use WIDTHxHEIGHT, e.g. 1920x1080.`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseNumber(text: string, flag: string): number {
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid value for ${flag}: ${text}.`);
  return parsed;
}

function oneOf<T extends string>(text: string, allowed: readonly T[], flag: string): T {
  if (!(allowed as readonly string[]).includes(text)) {
    throw new Error(`Invalid value for ${flag}: ${text}. Supported: ${allowed.join(', ')}.`);
  }
  return text as T;
}

export function parseArgs(argv: string[]): CliOptions {
  let size = { width: 1920, height: 1080 };
  const presets: OverlayPreset[] = [];
  const horizontalGuides: GuidePosition[] = [];
  const verticalGuides: GuidePosition[] = [];
  const safeAreas: SafeAreaName[] = [];
  const style: OverlayOptions['style'] = {};
  let cinemaRatio: CinemaRatio | undefined;
  let cinemaMode: CinemaMode | undefined;
  let background: BackgroundName | undefined;
  let labels = false;
  let output: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-s':
      case '--size':
        size = parseSize(value(argv, ++i, arg));
        break;
      case '-p':
      case '--preset':
        presets.push(oneOf(value(argv, ++i, arg), PRESET_NAMES, arg));
        break;
      case '-c':
      case '--cinema': {
        const ratio = parseNumber(value(argv, ++i, arg), arg);
        if (!CINEMA_RATIOS.includes(ratio as CinemaRatio)) {
          throw new Error(`Invalid value for ${arg}: ${ratio}. Supported: ${CINEMA_RATIOS.join(', ')}.`);
        }
        cinemaRatio = ratio as CinemaRatio;
        break;
      }
      case '--cinema-mode':
        cinemaMode = oneOf(value(argv, ++i, arg), ['lines', 'mask'] as const, arg);
        break;
      case '-H':
      case '--horizontal':
        horizontalGuides.push(value(argv, ++i, arg));
        break;
      case '-V':
      case '--vertical':
        verticalGuides.push(value(argv, ++i, arg));
        break;
      case '--safe':
        safeAreas.push(oneOf(value(argv, ++i, arg), SAFE_AREA_NAMES, arg));
        break;
      case '--color':
        style.color = value(argv, ++i, arg);
        break;
      case '--opacity':
        style.opacity = parseNumber(value(argv, ++i, arg), arg);
        break;
      case '--line-width':
        style.width = parseNumber(value(argv, ++i, arg), arg);
        break;
      case '--line-style':
        style.lineStyle = oneOf(value(argv, ++i, arg), ['solid', 'dashed'] as const satisfies readonly LineStyle[], arg);
        break;
      case '--labels':
        labels = true;
        break;
      case '-b':
      case '--background':
        background = oneOf(value(argv, ++i, arg), ['transparent', 'black', 'white'] as const, arg);
        break;
      case '-o':
      case '--output':
        output = value(argv, ++i, arg);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  const overlay: OverlayOptions = {
    width: size.width,
    height: size.height,
    labels,
    ...(presets.length > 0 ? { presets } : {}),
    ...(horizontalGuides.length > 0 ? { horizontalGuides } : {}),
    ...(verticalGuides.length > 0 ? { verticalGuides } : {}),
    ...(safeAreas.length > 0 ? { safeAreas } : {}),
    ...(cinemaRatio !== undefined ? { cinema: { ratio: cinemaRatio, mode: cinemaMode } } : {}),
    ...(background !== undefined ? { background } : {}),
    ...(Object.keys(style).length > 0 ? { style } : {}),
  };
  return { overlay, ...(output !== undefined ? { output } : {}) };
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    console.log(USAGE);
    return 0;
  }
  if (argv.includes('-v') || argv.includes('--version')) {
    const { readFileSync } = await import('fs');
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { version: string };
    console.log(pkg.version);
    return 0;
  }

  try {
    const { overlay, output } = parseArgs(argv);
    const result = await generateOverlay(overlay);
    const target = resolve(output ?? overlayFileName(result.width, result.height));
    // Nothing is written until the PNG is complete, so a failure never leaves
    // a truncated file behind.
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, result.png);
    console.log(`${target} (${result.width} × ${result.height})`);
    return 0;
  } catch (error) {
    const message = error instanceof OverlayError || error instanceof Error ? error.message : String(error);
    console.error(`overlay-guide: ${message}`);
    return 1;
  }
}

/* istanbul ignore next -- entry point */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
