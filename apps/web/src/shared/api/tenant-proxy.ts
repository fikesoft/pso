import { roMessages } from '@pos/ui/locales';
import type { NextRequest } from 'next/server';
import type { TenantProxyContext } from './proxy.types';
import { tenantApiFallback, tenantProxyTimeoutMs, forwardedTenantHeaders } from './proxy.constants';
import { ProxyBodyTooLarge, readProxyBody } from './proxy-body';
import { assertVercelEnvironment } from '../config';
// Only this plane is exposed. Upstream is configured server-side at runtime.
export async function proxyTenantRequest(request: NextRequest, { params }: TenantProxyContext) {
  const { path } = await params;
  const headers = new Headers();
  for (const name of forwardedTenantHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    if (process.env.VERCEL === '1') assertVercelEnvironment(process.env);
    if (process.env.VERCEL === '1' && !process.env.TENANT_API_URL)
      throw new Error('Bindingul către serviciul API lipsește.');
    const origin = process.env.TENANT_API_URL || tenantApiFallback;
    const target = new URL(
      'api/tenant/' + path.map(encodeURIComponent).join('/'),
      origin.endsWith('/') ? origin : origin + '/',
    );
    target.search = request.nextUrl.search;
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: await readProxyBody(request, path),
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(tenantProxyTimeoutMs),
    });
    const responseHeaders = new Headers({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    const requestId = upstream.headers.get('x-request-id');
    if (requestId) responseHeaders.set('X-Request-Id', requestId);
    const contentType = upstream.headers.get('content-type');
    if (contentType) responseHeaders.set('Content-Type', contentType);
    for (const cookie of upstream.headers.getSetCookie())
      responseHeaders.append('Set-Cookie', cookie);
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    if (error instanceof ProxyBodyTooLarge)
      return Response.json(
        { error: roMessages.requestTooLarge, code: 'BODY_TOO_LARGE' },
        { status: 413, headers: { 'Cache-Control': 'no-store' } },
      );
    return Response.json(
      { error: roMessages.serverUnavailable },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
