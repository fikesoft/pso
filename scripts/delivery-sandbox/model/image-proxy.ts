import { idSchema } from '../../../packages/contracts/src';
import { sandboxImageLimit } from '../config/server.constants';
import type { StorefrontConfig } from './storefront.types';

const integrationImagePath = /^\/api\/integrations\/website\/products\/([^/]+)\/image$/;
const storefrontImagePath = /^\/api\/catalog\/products\/([^/]+)\/image$/;

function imageIds(url: URL, pattern: RegExp) {
  const match = pattern.exec(url.pathname);
  const productId = match?.[1];
  const assetId = url.searchParams.get('assetId');
  if (
    !productId ||
    !assetId ||
    url.searchParams.size !== 1 ||
    !idSchema.safeParse(productId).success ||
    !idSchema.safeParse(assetId).success
  )
    return null;
  return { productId, assetId };
}

export function storefrontImageUrl(imageUrl: string | null, productId: string) {
  if (typeof imageUrl !== 'string' || !imageUrl.startsWith('/') || imageUrl.startsWith('//'))
    return null;
  const ids = imageIds(new URL(imageUrl, 'http://127.0.0.1'), integrationImagePath);
  if (!ids || ids.productId !== productId) return null;
  return `/api/catalog/products/${ids.productId}/image?assetId=${ids.assetId}`;
}

export function storefrontImageRequest(url: URL) {
  return imageIds(url, storefrontImagePath);
}

export async function readProductImage(
  config: StorefrontConfig,
  productId: string,
  assetId: string,
) {
  if (!config.apiKey) return { status: 503, code: 'WEBSITE_NOT_CONFIGURED' } as const;
  try {
    const response = await fetch(
      `${config.posOrigin}/api/integrations/website/products/${productId}/image?assetId=${assetId}`,
      {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      if (response.status === 401) return { status: 401, code: 'INVALID_API_KEY' } as const;
      if (response.status === 404) return { status: 404, code: 'NOT_FOUND' } as const;
      if (response.status === 429) return { status: 429, code: 'RATE_LIMITED' } as const;
      return { status: 502, code: 'POS_UNAVAILABLE' } as const;
    }
    if (
      response.headers.get('content-type')?.split(';')[0] !== 'image/webp' ||
      Number(response.headers.get('content-length') ?? 0) > sandboxImageLimit ||
      !response.body
    )
      return { status: 502, code: 'POS_UNAVAILABLE' } as const;
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > sandboxImageLimit) {
        await reader.cancel();
        return { status: 502, code: 'POS_UNAVAILABLE' } as const;
      }
      chunks.push(value);
    }
    return { status: 200, bytes: Buffer.concat(chunks, total) } as const;
  } catch {
    return { status: 502, code: 'POS_UNAVAILABLE' } as const;
  }
}
