import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Prisma, withTenantTransaction } from '../src';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { prepareCheckoutOrder, writeCheckout } from './fixtures/checkout.fixture';
import { loadAuthorization } from '../../../apps/api/src/entities/tenant-access';
import { activeOrderPage } from '../../../apps/api/src/features/orders/model/order-active-page';
import { activeOrderCandidatesSql } from '../../../apps/api/src/features/orders/model/order-active-sql';
import { decodeActiveOrderCursor } from '../../../apps/api/src/features/orders/model/order-active-cursor';
import type { ActiveOrderCandidate } from '../../../apps/api/src/features/orders/model/order-active.types';

test('PostgreSQL: filtre active înaintea bugetului, pagini rare autorizate și planuri runtime RLS', async () => {
  const f = await createOperationsFixture();
  try {
    const low = await f.createDraft();
    await f.txA(async (tx) => {
      await tx.orderItem.delete({ where: { id: low.item.id } });
      await tx.orderItem.create({
        data: { ...low.item, id: randomUUID(), baseUnitPrice: '1', unitPrice: '1', lineTotal: '1' },
      });
      await tx.order.update({
        where: { id: low.order.id },
        data: { total: '1', version: { increment: 1 } },
      });
    });
    for (let i = 0; i < 260; i++) await writeCheckout(f, await prepareCheckoutOrder(f));
    const context = {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      userId: f.a.user.id,
    };
    const read = async (userId = context.userId, cursor?: string, limit = 50) => {
      const bound = { ...context, userId };
      return withTenantTransaction(
        f.runtime,
        bound,
        async (tx) => {
          const authorization = await loadAuthorization(tx, context.organizationId);
          return activeOrderPage(
            tx,
            { ...authorization, currentUser: authorization.users.find((u) => u.id === userId)! },
            bound,
            limit,
            cursor ? decodeActiveOrderCursor(bound, cursor) : undefined,
          );
        },
        { readOnlySnapshot: true },
      );
    };
    const rare = await read();
    assert.deepEqual(
      rare.orders.map((o) => o.id),
      [low.order.id],
    );
    assert.equal(rare.nextCursor, null); // 260 newer inactive rows do not consume the 200-active-candidate budget.
    const plans: Record<string, unknown> = {};
    const explain = async (name: string) =>
      f.txA(async (tx) => {
        const [role] = await tx.$queryRaw<
          Array<{ rolname: string; rolbypassrls: boolean; owner: boolean }>
        >`
        SELECT r.rolname,r.rolbypassrls, r.oid=c.relowner AS owner
        FROM pg_roles r JOIN pg_class c ON c.relname='Order' AND c.relnamespace='public'::regnamespace
        WHERE r.rolname=current_user`;
        assert.equal(role!.rolbypassrls, false);
        assert.equal(role!.owner, false);
        const plan = await tx.$queryRaw(
          Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${activeOrderCandidatesSql(context, 51)}`,
        );
        plans[name] = { role, plan };
      });
    await explain('rareActive261Orders');
    for (let i = 0; i < 201; i++) await f.createDraft();
    const viewer = await f.txA(async (tx) => {
      const user = await tx.companyUser.create({
        data: {
          organizationId: context.organizationId,
          loginNormalized: `active-${randomUUID()}`,
          displayName: 'Cititor sintetic',
          passwordHash: 'unused',
          createdByUserId: context.userId,
          managedByUserId: context.userId,
        },
      });
      await tx.userLocationAccess.create({
        data: {
          organizationId: context.organizationId,
          locationId: context.locationId,
          userId: user.id,
        },
      });
      await tx.userPermissionOverride.create({
        data: {
          organizationId: context.organizationId,
          locationId: context.locationId,
          userId: user.id,
          permissionKey: 'orders.read',
          scopeType: 'LOCATION',
          effect: 'ALLOW',
          maxAmount: '5',
          issuedByUserId: context.userId,
        },
      });
      return user;
    });
    const sparse = await read(viewer.id);
    assert.deepEqual(sparse.orders, []);
    assert.ok(sparse.nextCursor);
    const end = await read(viewer.id, sparse.nextCursor);
    assert.deepEqual(
      end.orders.map((o) => o.id),
      [low.order.id],
    );
    assert.equal(end.nextCursor, null);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await read(context.userId, cursor);
      seen.push(...page.orders.map((o) => o.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    assert.equal(seen.length, 202);
    assert.equal(new Set(seen).size, 202);
    await f.txA((tx) =>
      tx.userPermissionOverride.create({
        data: {
          organizationId: context.organizationId,
          locationId: context.locationId,
          userId: viewer.id,
          permissionKey: 'orders.read',
          scopeType: 'LOCATION',
          effect: 'DENY',
          issuedByUserId: context.userId,
        },
      }),
    );
    assert.deepEqual((await read(viewer.id, sparse.nextCursor)).orders, []);
    assert.deepEqual(
      await f.txB((tx) =>
        tx.$queryRaw<ActiveOrderCandidate[]>(activeOrderCandidatesSql(context, 51)),
      ),
      [],
    );
    await explain('denseActive462Orders');
    await f.txA(async (tx) => {
      plans.continuation = await tx.$queryRaw(
        Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${activeOrderCandidatesSql(context, 51, decodeActiveOrderCursor({ ...context, userId: viewer.id }, sparse.nextCursor!))}`,
      );
    });
    const directory = '.local/horeca-active-orders-verification';
    await mkdir(directory, { recursive: true });
    await writeFile(
      `${directory}/runtime-query-plans.json`,
      JSON.stringify(
        { capturedAt: new Date().toISOString(), totalOrders: 462, activeOrders: 202, plans },
        null,
        2,
      ),
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
