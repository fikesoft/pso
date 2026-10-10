import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db } from './support/harness';
import type { WebsiteFixture } from './website.types';

export async function verifyWebsiteLiveAccess(f: WebsiteFixture) {
  const issued = await f.issue();
  let response: ReturnType<typeof f.inbound> | undefined;
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${f.a.company.organization.id},0))`;
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      response = f.inbound('/orders', 'POST', f.order(), randomUUID(), issued.apiKey);
      let blocked = false;
      for (let attempt = 0; attempt < 150 && !blocked; attempt++) {
        const rows = await db.runtime.$queryRaw<
          { waiting: boolean }[]
        >`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND ${pid!}::int=ANY(pg_blocking_pids(pid))) AS waiting`;
        blocked = rows[0]!.waiting;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await tx.websiteApiKey.update({
        where: { id: issued.key.id },
        data: { revokedAt: new Date() },
      });
    },
  );
  expect((await response!).status).toBe(401);
  const persisted = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    (tx) => tx.websiteOrder.count({ where: { createdWithKeyId: issued.key.id } }),
  );
  expect(persisted).toBe(0);
  const operator = await f.login('operator');
  const receipt = (await f.inbound('/orders', 'POST', f.order())).data.receipt;
  await operator.expect(`/website/orders/${receipt.id}/accept`, 'POST', { version: 1 });
  await f.a.primary.expect(`/staff/${f.actors.operator.user.id}/overrides`, 'POST', {
    permission: 'orders.create',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  expect(
    (await operator.call(`/website/orders/${receipt.id}/accept`, 'POST', { version: 1 })).status,
  ).toBe(401);
  const fresh = await f.login('operator');
  expect(
    (await fresh.call(`/website/orders/${receipt.id}/accept`, 'POST', { version: 1 })).status,
  ).toBe(403);
}
