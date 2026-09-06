import { Deflate } from './png';

/**
 * Picks a deflate implementation for the current runtime: CompressionStream in
 * the browser, `node:zlib` everywhere else. Both emit the zlib container PNG
 * expects, so the resulting files are interchangeable.
 */
export async function resolveDeflate(): Promise<Deflate> {
  if (typeof CompressionStream !== 'undefined') {
    return async (data: Uint8Array) => {
      const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    };
  }
  const { deflateSync } = await import('node:zlib');
  return (data: Uint8Array) => new Uint8Array(deflateSync(data));
}
