import { tenantImageBodyLimit, tenantJsonBodyLimit } from './proxy.constants';

export class ProxyBodyTooLarge extends Error {}

function isImageUpload(method: string, path: readonly string[]) {
  return (
    method === 'PUT' &&
    ((path.length === 3 && path[0] === 'staff' && path[2] === 'avatar') ||
      (path.length === 4 && path[0] === 'catalog' && path[1] === 'products' && path[3] === 'image'))
  );
}

/** Bound memory before buffering an upstream request, including chunked/forged-length bodies. */
export async function readProxyBody(
  request: Request,
  path: readonly string[],
): Promise<ArrayBuffer | undefined> {
  if (['GET', 'HEAD'].includes(request.method) || !request.body) return undefined;
  const limit = isImageUpload(request.method, path) ? tenantImageBodyLimit : tenantJsonBodyLimit;
  if (Number(request.headers.get('content-length')) > limit) {
    await request.body.cancel().catch(() => undefined);
    throw new ProxyBodyTooLarge();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new ProxyBodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}
