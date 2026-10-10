import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { BrowserSession, db, passwordHash, fixturePasswords, bases } from './support/harness';

export function registerSecurityTests() {
  it('CSRF, Origin exact și cookie-uri host-only HttpOnly/SameSite; headers spoofed nu autorizează', async () => {
    const session = new BrowserSession('TENANT');
    const initial = await session.expect('/auth/session');
    expect(initial.user).toBeNull();
    const cookie = session.lastSetCookies.find((value) => value.startsWith('pos_tenant_csrf='))!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/tenant');
    expect(cookie).not.toContain('Domain=');
    expect(
      (
        await session.call(
          '/auth/login',
          'POST',
          { login: 'missing', password: 'invalid' },
          {},
          false,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await session.call(
          '/auth/login',
          'POST',
          { login: 'missing', password: 'invalid' },
          { origin: 'https://evil.invalid' },
        )
      ).status,
    ).toBe(403);
    const spoofed = await session.call('/staff', 'GET', undefined, {
      'x-forwarded-for': '127.0.0.1',
      'x-is-admin': 'true',
    });
    expect(spoofed.status).toBe(401);
    expect(
      (
        await session.call('/auth/login', 'POST', {
          companySlug: 'missing-one',
          login: 'missing',
          password: 'invalid',
        })
      ).data.error,
    ).toBe('Date de autentificare invalide');
    expect(
      (
        await session.call('/auth/login', 'POST', {
          companySlug: 'missing-two',
          login: 'missing',
          password: 'invalid',
        })
      ).data.error,
    ).toBe('Date de autentificare invalide');
  });

  it('routerele platformei lipsesc din public și identitățile/sesiunile sunt incompatibile', async () => {
    expect(
      (
        await fetch(`${bases.TENANT}/api/platform/organizations`, {
          headers: { 'x-is-admin': 'true', 'x-forwarded-for': '127.0.0.1' },
        })
      ).status,
    ).toBe(404);
    expect((await fetch(`${bases.PLATFORM}/api/tenant/staff`)).status).toBe(404);
    const suffix = randomUUID().slice(0, 8);
    const password = `CrossSession-${randomUUID()}`;
    fixturePasswords.add(password);
    const admin = await db.platformDb.platformAdmin.create({
      data: {
        loginNormalized: `cross-${suffix}`,
        displayName: 'Sesiune sintetică',
        passwordHash: await passwordHash(password),
      },
    });
    const platform = new BrowserSession('PLATFORM');
    await platform.login(admin.loginNormalized, password);
    const tenant = new BrowserSession('TENANT');
    tenant.cookies.set('pos_tenant', platform.cookies.get('pos_platform')!);
    expect((await tenant.expect('/auth/session')).user).toBeNull();
    expect((await tenant.call('/context')).status).toBe(401);
    platform.cookies.set('pos_platform', randomUUID());
    expect((await platform.expect('/auth/session')).user).toBeNull();
  });

  it('rate limit pe IP real nu poate fi ocolit prin X-Forwarded-For', async () => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    let limited = false;
    for (let i = 0; i < 35; i++) {
      const response = await session.call(
        '/auth/login',
        'POST',
        { companySlug: `rate-${i}`, login: `missing-${i}`, password: 'invalid' },
        { 'x-forwarded-for': `198.51.100.${i + 1}` },
      );
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
}
