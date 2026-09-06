import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main, parseArgs } from '../src/cli/index';
import { generateOverlay } from '../src/core/generate';
import { decodePng } from './fixtures';

let dir: string;
let cwd: string;
let out: string[];
let errors: string[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'overlay-guide-'));
  cwd = process.cwd();
  process.chdir(dir);
  out = [];
  errors = [];
  vi.spyOn(console, 'log').mockImplementation((message?: unknown) => void out.push(String(message)));
  vi.spyOn(console, 'error').mockImplementation((message?: unknown) => void errors.push(String(message)));
});

afterEach(() => {
  process.chdir(cwd);
  vi.restoreAllMocks();
});

describe('parseArgs', () => {
  it('defaults to 1920x1080 with no guides', () => {
    expect(parseArgs(['--preset', 'thirds']).overlay).toMatchObject({ width: 1920, height: 1080, presets: ['thirds'] });
  });

  it('parses a size', () => {
    expect(parseArgs(['--size', '3840x2160']).overlay).toMatchObject({ width: 3840, height: 2160 });
  });

  it('collects repeated presets and guides', () => {
    const { overlay } = parseArgs([
      '--preset',
      'thirds',
      '--preset',
      'center',
      '--horizontal',
      '50%',
      '--horizontal',
      '540px',
      '--vertical',
      '25%',
    ]);
    expect(overlay.presets).toEqual(['thirds', 'center']);
    expect(overlay.horizontalGuides).toEqual(['50%', '540px']);
    expect(overlay.verticalGuides).toEqual(['25%']);
  });

  it('parses cinema, safe areas, style and background', () => {
    const { overlay, output } = parseArgs([
      '--cinema',
      '2.39',
      '--cinema-mode',
      'mask',
      '--safe',
      'title',
      '--color',
      '#ff0000',
      '--opacity',
      '50',
      '--line-width',
      '4',
      '--line-style',
      'dashed',
      '--labels',
      '--background',
      'black',
      '--output',
      'guide.png',
    ]);
    expect(overlay.cinema).toEqual({ ratio: 2.39, mode: 'mask' });
    expect(overlay.safeAreas).toEqual(['title']);
    expect(overlay.style).toEqual({ color: '#ff0000', opacity: 50, width: 4, lineStyle: 'dashed' });
    expect(overlay.labels).toBe(true);
    expect(overlay.background).toBe('black');
    expect(output).toBe('guide.png');
  });

  it.each([
    [['--size', '1920'], /Invalid size/],
    [['--size'], /Missing value/],
    [['--preset', 'golden'], /Invalid value for --preset/],
    [['--cinema', '3'], /Invalid value for --cinema/],
    [['--safe', 'tiktok'], /Invalid value for --safe/],
    [['--nope'], /Unknown option/],
  ])('rejects %s', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe('main', () => {
  it('prints help and exits 0', async () => {
    expect(await main(['--help'])).toBe(0);
    expect(out.join('\n')).toContain('Usage:');
  });

  it('prints help when called with no arguments', async () => {
    expect(await main([])).toBe(0);
    expect(out.join('\n')).toContain('overlay-guide');
  });

  it('prints the package version', async () => {
    expect(await main(['--version'])).toBe(0);
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { version: string };
    expect(out[0]).toBe(pkg.version);
  });

  it('writes a preset overlay to the default file name', async () => {
    expect(await main(['--preset', 'thirds', '--size', '1280x720'])).toBe(0);
    const png = decodePng(readFileSync(join(dir, 'overlay-guide-1280x720.png')));
    expect([png.width, png.height]).toEqual([1280, 720]);
  });

  it('writes custom guides to --output', async () => {
    expect(await main(['--horizontal', '50%', '--vertical', '960px', '--output', 'guide.png'])).toBe(0);
    expect(existsSync(join(dir, 'guide.png'))).toBe(true);
  });

  it('produces the same bytes as the API', async () => {
    await main(['--size', '640x360', '--preset', 'thirds', '--cinema', '2.39', '--safe', 'title', '--output', 'cli.png']);
    const api = await generateOverlay({
      width: 640,
      height: 360,
      presets: ['thirds'],
      cinema: { ratio: 2.39, mode: undefined },
      safeAreas: ['title'],
      labels: false,
    });
    expect(Array.from(readFileSync(join(dir, 'cli.png')))).toEqual(Array.from(api.png));
  });

  it('reports invalid arguments with a non-zero exit code', async () => {
    expect(await main(['--size', 'huge'])).toBe(1);
    expect(errors.join('\n')).toContain('overlay-guide:');
  });

  it('reports an invalid guide without writing a file', async () => {
    expect(await main(['--horizontal', '120%', '--output', 'broken.png'])).toBe(1);
    expect(existsSync(join(dir, 'broken.png'))).toBe(false);
  });

  it('reports a color the core rejects', async () => {
    expect(await main(['--color', 'red', '--preset', 'center'])).toBe(1);
    expect(errors.join('\n')).toContain('Invalid color');
  });
});
