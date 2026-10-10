import 'dotenv/config';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import type { LoadTestProvisionResult } from './load-test.types';
if (process.env.NODE_ENV === 'production')
  throw new Error('Testul de capacitate este local, nepermis în producție.');
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL necesar');
const testUrl = new URL(process.env.TEST_DATABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(testUrl.hostname) || !testUrl.pathname.endsWith('_test'))
  throw new Error('Numai DB locală de test');
for (const key of ['DATABASE_URL', 'AUTH_DATABASE_URL', 'PLATFORM_DATABASE_URL']) {
  const url = new URL(process.env[key]!);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Testul de capacitate necesită exclusiv baze locale.');
  url.pathname = testUrl.pathname;
  process.env[key] = url.toString();
}
const { runtime, platformDb, bootstrapDb, withTenantTransaction } = await import(
  '../apps/api/src/db'
);
const { hashPassword } = await import('../apps/api/src/crypto');
const { createApp } = await import('../apps/api/src/server');
const suffix = randomUUID().slice(0, 8);
const hash = await hashPassword(randomBytes(24).toString('hex'));
const owner = await platformDb.platformAdmin.create({
  data: {
    loginNormalized: `load-${suffix}`,
    displayName: 'Capacitate sintetică',
    passwordHash: hash,
  },
});
const provision = await platformDb.$queryRaw<
  LoadTestProvisionResult[]
>`SELECT pos_control.provision_organization(${`load-${suffix}`},${'Capacitate · TEST'},${null},${'admin'},${'TEST'},${hash},${new Date(Date.now() + 3600000)},${owner.id}::uuid) AS data`;
const { organization, user } = provision[0].data;
const tokens: string[] = [];
await withTenantTransaction(
  runtime,
  { organizationId: organization.id, userId: user.id },
  async (tx) => {
    const location = await tx.location.create({
      data: { organizationId: organization.id, name: 'Capacitate TEST', code: 'A' },
    });
    for (let i = 0; i < 100; i++) {
      const worker = await tx.companyUser.create({
        data: {
          organizationId: organization.id,
          loginNormalized: `worker-${i}`,
          displayName: `Lucrător TEST ${i}`,
          passwordHash: hash,
          mustChangePassword: false,
          createdByUserId: user.id,
          managedByUserId: user.id,
        },
      });
      await tx.userLocationAccess.create({
        data: {
          organizationId: organization.id,
          userId: worker.id,
          locationId: location.id,
          isDefault: true,
        },
      });
      const raw = randomBytes(32).toString('base64url');
      tokens.push(raw);
      await tx.tenantSession.create({
        data: {
          organizationId: organization.id,
          userId: worker.id,
          tokenHash: createHash('sha256').update(raw).digest('hex'),
          authVersion: 1,
          policyVersion: 1,
          expiresAt: new Date(Date.now() + 3600000),
          idleExpiresAt: new Date(Date.now() + 3600000),
        },
      });
    }
  },
);
const server = await new Promise<ReturnType<ReturnType<typeof createApp>['listen']>>((resolve) => {
  const s = createApp('TENANT').listen(0, '127.0.0.1', () => resolve(s));
});
const port = (server.address() as AddressInfo).port;
const results = [];
try {
  for (const concurrency of [10, 100]) {
    const samples: number[] = [];
    const statuses: Record<string, number> = {};
    let next = 0;
    const start = performance.now();
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        for (;;) {
          const index = next++;
          if (index >= 100) return;
          const then = performance.now();
          const response = await fetch(`http://127.0.0.1:${port}/api/tenant/context`, {
            headers: { Cookie: `pos_tenant=${tokens[index]}` },
          });
          await response.arrayBuffer();
          samples.push(performance.now() - then);
          statuses[response.status] = (statuses[response.status] ?? 0) + 1;
        }
      }),
    );
    samples.sort((a, b) => a - b);
    results.push({
      configuredUsers: 100,
      concurrency,
      requests: 100,
      statuses,
      totalMs: Math.round(performance.now() - start),
      p50Ms: Math.round(samples[49]!),
      p95Ms: Math.round(samples[94]!),
      maxMs: Math.round(samples[99]!),
    });
  }
  const report = {
    measuredAt: new Date().toISOString(),
    runtime: process.version,
    note: 'Mașină locală, PostgreSQL real, fixture100 sesiuni autentificate; exclude costul login Argon2 și nu dovedește capacitate VPS.',
    results,
  };
  writeFileSync('docs/load-measurement.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.all([runtime.$disconnect(), platformDb.$disconnect(), bootstrapDb.$disconnect()]);
}
