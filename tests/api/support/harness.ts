import 'dotenv/config';
import { beforeAll, afterAll, expect, vi } from 'vitest';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type * as Database from '../../../apps/api/src/db';

// Entire suite uses a dedicated local synthetic DB. Never silently target pos_dev.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || new URL(databaseUrl).pathname !== '/pos_test')
  throw new Error('TEST_DATABASE_URL trebuie să indice baza locală /pos_test.');
for (const name of ['DATABASE_URL', 'AUTH_DATABASE_URL', 'PLATFORM_DATABASE_URL']) {
  const value = name === 'DATABASE_URL' ? databaseUrl : process.env[name];
  if (!value) throw new Error(`${name} lipsește`);
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Testele HTTP necesită exclusiv baze locale.');
  url.pathname = '/pos_test';
  process.env[name] = url.toString();
}
process.env.NODE_ENV = 'test';
// Partition synthetic suites while preserving one shared PostgreSQL limiter
// for both API principals and every server/client inside each suite.
process.env.CSRF_SECRET = randomBytes(48).toString('hex');
export const origins = {
  TENANT: process.env.TENANT_ORIGIN!,
  PLATFORM: process.env.PLATFORM_ORIGIN!,
};
type Kind = keyof typeof origins;
export const servers: Server[] = [];
export let bases: Record<Kind, string>;
export let db: typeof Database;
export let passwordHash: (value: string) => Promise<string>;
export let errorLog: ReturnType<typeof vi.spyOn>;
export const fixturePasswords = new Set<string>();

// Independent RFC 6238 authenticator, used only to drive the real enrollment API.
export function totp(secret: string, offset = 0): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, ''))
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const start = digest[19]! & 15;
  return String((digest.readUInt32BE(start) & 0x7fffffff) % 1000000).padStart(6, '0');
}
export class BrowserSession {
  cookies = new Map<string, string>();
  csrf = '';
  lastSetCookies: string[] = [];
  lastEnrollmentCode = '';
  constructor(readonly kind: Kind) {}
  async call(
    path: string,
    method = 'GET',
    body?: unknown,
    extra: Record<string, string> = {},
    csrf = true,
  ) {
    const headers: Record<string, string> = {
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '),
      ...extra,
    };
    if (method !== 'GET') {
      headers['content-type'] = 'application/json';
      if (!('origin' in extra)) headers.origin = origins[this.kind];
      if (csrf) headers['x-csrf-token'] = this.csrf;
    }
    const response = await fetch(`${bases[this.kind]}/api/${this.kind.toLowerCase()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.lastSetCookies = response.headers.getSetCookie();
    for (const value of this.lastSetCookies) {
      const first = value.split(';')[0]!;
      const i = first.indexOf('=');
      this.cookies.set(first.slice(0, i), first.slice(i + 1));
    }
    const data = (await response.json()) as any;
    if (data.csrfToken) this.csrf = data.csrfToken;
    return { status: response.status, data, headers: response.headers };
  }
  async expect(path: string, method = 'GET', body?: unknown, status = 200) {
    const response = await this.call(path, method, body);
    expect(response.status, `${method} ${path}: ${JSON.stringify(response.data)}`).toBe(status);
    return response.data;
  }
  async login(login: string, password: string, companySlug?: string) {
    await this.expect('/auth/session');
    return this.expect('/auth/login', 'POST', {
      login,
      password,
      ...(companySlug ? { companySlug } : {}),
    });
  }
  async enroll() {
    const enrollment = await this.expect('/auth/mfa/enroll', 'POST', {});
    expect(enrollment.secret).toMatch(/^[A-Z2-7]+$/);
    const step = Math.floor(Date.now() / 30000);
    let code = totp(enrollment.secret, -1);
    let response = await this.call('/auth/mfa/verify', 'POST', { code });
    // The previous-step token expires if the HTTP request crosses a TOTP boundary.
    // Keep the current step unused for subsequent login/replay checks in the suite.
    if (response.status === 401 && Math.floor(Date.now() / 30000) > step) {
      code = totp(enrollment.secret, -1);
      response = await this.call('/auth/mfa/verify', 'POST', { code });
    }
    expect(response.status, 'MFA enrollment verification').toBe(200);
    expect(response.data.stage).toBe('ready');
    this.lastEnrollmentCode = code;
    return enrollment.secret as string;
  }
  clone() {
    const copy = new BrowserSession(this.kind);
    copy.cookies = new Map(this.cookies);
    copy.csrf = this.csrf;
    return copy;
  }
}
export function noSecrets(data: unknown) {
  const text = JSON.stringify(data);
  expect(text).not.toMatch(
    /passwordHash|pinHash|pinLookup|tokenHash|encryptedSecret|lastUsedStep|\$argon2id\$/,
  );
  for (const password of fixturePasswords) expect(text).not.toContain(password);
}
export async function activate(
  session: BrowserSession,
  login: string,
  temporary: string,
  slug: string,
) {
  fixturePasswords.add(temporary);
  const initial = await session.login(login, temporary, slug);
  expect(initial.stage).toBe('password');
  expect((await session.call('/context')).status).toBe(403);
  expect((await session.call('/auth/mfa/enroll', 'POST', {})).status).toBe(403);
  const permanent = `Permanent-${randomUUID()}`;
  fixturePasswords.add(permanent);
  const old = session.clone();
  const changed = await session.expect('/auth/password', 'POST', {
    currentPassword: temporary,
    newPassword: permanent,
  });
  expect((await old.expect('/auth/session')).user).toBeNull();
  return { permanent, state: changed };
}

beforeAll(async () => {
  const { createApp } = await import('../../../apps/api/src/server');
  db = await import('../../../apps/api/src/db');
  passwordHash = (await import('../../../apps/api/src/crypto')).hashPassword;
  bases = {} as Record<Kind, string>;
  for (const kind of ['TENANT', 'PLATFORM'] as const) {
    const server = await new Promise<Server>((resolve) => {
      const running = createApp(kind).listen(0, '127.0.0.1', () => resolve(running));
    });
    servers.push(server);
    bases[kind] = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
  errorLog = vi.spyOn(console, 'error');
});
afterAll(async () => {
  if (errorLog) {
    noSecrets(errorLog.mock.calls);
    errorLog.mockRestore();
  }
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  );
  if (db)
    await Promise.all([
      db.runtime.$disconnect(),
      db.bootstrapDb.$disconnect(),
      db.platformDb.$disconnect(),
    ]);
});
