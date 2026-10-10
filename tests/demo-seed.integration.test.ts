import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import { db } from './api/support/harness';
import type { OperationsFixture } from './api/operations.types';
import { seedDemoCatalog } from '../apps/api/src/app/model/demo-catalog';
import { DEMO_MENU } from '../apps/api/src/app/config/demo-menu.constants';

let fixture: OperationsFixture;
beforeAll(async () => {
  fixture = await prepareOperations();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('seed: catalog vizibil în ambele locații, rețete izolate și reluare fără suprascriere', async () => {
  const { a, b, worker } = fixture;
  const context = {
    organizationId: a.company.organization.id,
    userId: a.company.organization.primaryAdminUserId,
  };
  // The authenticated identity is taken from the actual tenant session, not a guessed actor.
  const session = await a.primary.expect('/auth/session');
  context.userId = session.user.id;
  const run = () =>
    db.withTenantTransaction(db.runtime, context, (tx) =>
      seedDemoCatalog(tx, context.organizationId, context.userId),
    );
  const first = await run();
  expect(first.created).toBe(DEMO_MENU.length);
  expect(first.locations).toBe(2);
  const snapshot = await db.withTenantTransaction(db.runtime, context, async (tx) => {
    const products = await tx.product.findMany({
      where: { sku: { in: DEMO_MENU.map((p) => p.sku) } },
      orderBy: { sku: 'asc' },
    });
    const ids = products.map((p) => p.id);
    expect(products).toHaveLength(14);
    expect(await tx.locationProduct.count({ where: { productId: { in: ids } } })).toBe(28);
    expect(await tx.recipeVersion.count({ where: { productId: { in: ids } } })).toBe(14);
    expect(products.find((p) => p.sku === 'DEMO-NORI-ENJOY-3')?.description).toContain(
      '1200 g · 32 bucăți',
    );
    expect(products.find((p) => p.sku === 'DEMO-NORI-ENJOY-6')?.description).toContain(
      '1850 g · 48 bucăți',
    );
    const target = products[0]!;
    await tx.product.update({
      where: { id: target.id },
      data: { description: 'Descriere personalizată', version: { increment: 1 } },
    });
    await tx.locationProduct.updateMany({
      where: { productId: target.id },
      data: { price: '12.34', enabled: false, version: { increment: 1 } },
    });
    return {
      target,
      ids,
      user: await tx.companyUser.findUniqueOrThrow({ where: { id: context.userId } }),
      recipeCount: await tx.recipeVersion.count(),
    };
  });
  expect((await run()).created).toBe(0);
  await db.withTenantTransaction(db.runtime, context, async (tx) => {
    expect(await tx.product.findUnique({ where: { id: snapshot.target.id } })).toMatchObject({
      description: 'Descriere personalizată',
    });
    const local = await tx.locationProduct.findMany({ where: { productId: snapshot.target.id } });
    expect(local.every((p) => p.price.toString() === '12.34' && !p.enabled)).toBe(true);
    expect(await tx.recipeVersion.count()).toBe(snapshot.recipeCount);
    expect(await tx.companyUser.findUnique({ where: { id: context.userId } })).toEqual(
      snapshot.user,
    );
  });
  const productId = await db.withTenantTransaction(
    db.runtime,
    context,
    async (tx) =>
      (
        await tx.product.findUniqueOrThrow({
          where: {
            organizationId_sku: {
              organizationId: context.organizationId,
              sku: 'DEMO-NORI-ENJOY-3',
            },
          },
        })
      ).id,
  );
  const visible = await worker.expect(`/catalog/products/${productId}?locationId=${a.location.id}`);
  expect(visible.product.description).toContain('32 bucăți');
  expect(visible.product.price).toMatch(/^616\.0+$/);
  expect(
    (await b.primary.call(`/catalog/products/${productId}?locationId=${b.location.id}`)).status,
  ).toBe(404);
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: b.company.organization.id },
    async (tx) => {
      expect(await tx.product.count({ where: { id: { in: snapshot.ids } } })).toBe(0);
      expect(await tx.recipeVersion.count({ where: { productId: { in: snapshot.ids } } })).toBe(0);
    },
  );
});
