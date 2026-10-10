import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { proxyTenantRequest } from './tenant-proxy';

function request(path: string, init?: RequestInit) {
  const input = new Request(`https://pos.example.com/api/tenant/${path}`, init);
  return Object.assign(input, { nextUrl: new URL(input.url) }) as NextRequest;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('gatewayul tenant Vercel', () => {
  it('păstrează prefixul din URL-ul bindingului intern și ruta tenant', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('TENANT_ORIGIN', 'https://pos.example.com');
    vi.stubEnv('TENANT_API_URL', 'https://internal.example.com/service-base/');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (
        await proxyTenantRequest(request('context'), {
          params: Promise.resolve({ path: ['context'] }),
        })
      ).status,
    ).toBe(200);
    expect(fetchMock.mock.calls[0][0].toString()).toBe(
      'https://internal.example.com/service-base/api/tenant/context',
    );
  });
  it('păstrează cookie/Origin/CSRF, răspunsurile și elimină headerele forwarded', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('TENANT_ORIGIN', 'https://pos.example.com');
    vi.stubEnv('TENANT_API_URL', 'https://pos.example.com');
    const upstreamHeaders = new Headers({ 'Content-Type': 'application/json' });
    upstreamHeaders.append('Set-Cookie', 'tenant=synthetic; HttpOnly; Secure; SameSite=Strict');
    upstreamHeaders.append('Set-Cookie', 'csrf=synthetic; Secure; SameSite=Strict');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('{"status":"ok"}', { headers: upstreamHeaders }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await proxyTenantRequest(
      request('auth/login?mode=staff', {
        method: 'POST',
        headers: {
          Cookie: 'tenant=synthetic',
          Origin: 'https://pos.example.com',
          'Content-Type': 'application/json',
          'X-Csrf-Token': 'synthetic',
          'Idempotency-Key': 'synthetic-key',
          'X-Forwarded-For': '1.2.3.4',
          'X-Forwarded-Host': 'private.example.com',
          Authorization: 'Bearer synthetic',
        },
        body: '{}',
      }),
      { params: Promise.resolve({ path: ['auth', 'login'] }) },
    );
    const [target, options] = fetchMock.mock.calls[0];
    expect(target.toString()).toBe('https://pos.example.com/api/tenant/auth/login?mode=staff');
    expect(options.headers.get('cookie')).toBe('tenant=synthetic');
    expect(options.headers.get('origin')).toBe('https://pos.example.com');
    expect(options.headers.get('x-csrf-token')).toBe('synthetic');
    expect(options.headers.get('idempotency-key')).toBe('synthetic-key');
    expect(options.headers.has('x-forwarded-for')).toBe(false);
    expect(options.headers.has('x-forwarded-host')).toBe(false);
    expect(options.headers.has('authorization')).toBe(false);
    expect(options.redirect).toBe('manual');
    expect(options.cache).toBe('no-store');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('refuză configurația Vercel absentă înainte de orice trafic', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('TENANT_API_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await proxyTenantRequest(request('context'), {
      params: Promise.resolve({ path: ['context'] }),
    });
    expect(response.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
