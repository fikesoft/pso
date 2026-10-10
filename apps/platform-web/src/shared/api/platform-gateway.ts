import {
  PLATFORM_API_ORIGIN,
  GATEWAY_TIMEOUT_MS,
  FORWARDED_REQUEST_HEADERS,
  BODYLESS_METHODS,
} from '../config/gateway.constants';
import type { GatewayContext } from '../model/gateway.types';
import { roMessages } from '@pos/ui/locales';
import type { NextRequest } from 'next/server';
// Only this plane is exposed. Upstream is configured server-side at runtime.
export async function proxyPlatformRequest(request: NextRequest, { params }: GatewayContext) {
  const { path } = await params;
  const origin = process.env.PLATFORM_API_URL || PLATFORM_API_ORIGIN;
  const target = new URL('/api/platform/' + path.map(encodeURIComponent).join('/'), origin);
  target.search = request.nextUrl.search;
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: BODYLESS_METHODS.some((method) => method === request.method)
        ? undefined
        : await request.arrayBuffer(),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    const requestId = upstream.headers.get('x-request-id');
    if (requestId) responseHeaders.set('X-Request-Id', requestId);
    const contentType = upstream.headers.get('content-type');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append('Set-Cookie', cookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return Response.json(
      { error: roMessages.serverUnavailable },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
