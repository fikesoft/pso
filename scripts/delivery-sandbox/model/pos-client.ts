import type { StorefrontConfig, UpstreamResult } from './storefront.types';

export function validateStorefrontConfig(config: StorefrontConfig) {
  const url = new URL(config.posOrigin);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Website-ul demonstrativ poate contacta numai API-ul local pe 127.0.0.1.');
  }
  if (config.apiKey.length > 256 || /[\r\n]/.test(config.apiKey))
    throw new Error('Configurația cheii website este invalidă.');
}

export async function requestPos(
  config: StorefrontConfig,
  path: string,
  body?: unknown,
  requestKey?: string,
): Promise<UpstreamResult> {
  if (!config.apiKey) return { status: 503, data: { code: 'WEBSITE_NOT_CONFIGURED' } };
  try {
    const response = await fetch(`${config.posOrigin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(requestKey ? { 'Idempotency-Key': requestKey } : {}),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('INVALID_RESPONSE');
    return { status: response.status, data: data as Record<string, unknown> };
  } catch {
    // A timeout may follow a committed order. The caller must retain its idempotency key.
    return { status: 502, data: { code: 'POS_UNAVAILABLE' } };
  }
}
