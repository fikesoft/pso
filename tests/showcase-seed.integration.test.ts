import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it, vi } from 'vitest';
import { BrowserSession, bases, db } from './api/support/harness';
import { createSeedRecord } from '../scripts/showcase-seed/model/record';
import { runShowcaseSeed } from '../scripts/showcase-seed/model/run';
import { verifyShowcaseSeed } from '../scripts/showcase-seed/model/verify';
import { SeedHttpClient } from '../scripts/showcase-seed/model/http-client';
import { provisionCompanies } from '../scripts/showcase-seed/model/provision';
import { hashPassword, verifyPassword } from '../apps/api/src/entities/session';
import { loadAuthorization } from '../apps/api/src/entities/tenant-access';
import type { SeedRecord } from '../scripts/showcase-seed/model/seed.types';

let record: SeedRecord;
let result: Awaited<ReturnType<typeof runShowcaseSeed>>;
const clients = () => ({ runtime: db.runtime, platform: db.platformDb, auth: db.bootstrapDb });
beforeAll(async () => {
  record = createSeedRecord({
    hostname: '127.0.0.1',
    port: '55432',
    database: '/pos_test',
    origin: process.env.TENANT_ORIGIN!,
    mode: 'local',
  });
  record.platform.login = `showcase-${randomUUID()}`;
  record.companies[0]!.slug = `full-${randomUUID()}`;
  record.companies[1]!.slug = `empty-${randomUUID()}`;
  // Simulate a process interruption after sending an order; recovery must retain it.
  const original = SeedHttpClient.prototype.call;
  let interrupted = false;
  const failure = vi.spyOn(SeedHttpClient.prototype, 'call').mockImplementation(async function (
    this: SeedHttpClient,
    path,
    method,
    body,
  ) {
    const value = await original.call(this, path, method, body);
    if (!interrupted && path.endsWith('/send')) {
      interrupted = true;
      throw new Error('Interruption after committed send');
    }
    return value;
  });
  await expect(runShowcaseSeed(clients(), record, bases.TENANT)).rejects.toThrow('Interruption');
  failure.mockRestore();
  result = await runShowcaseSeed(clients(), record, bases.TENANT);
  await verifyShowcaseSeed(clients(), record);
}, 180_000);

it('creates rich operational data and an empty company with only its primary admin', async () => {
  const { references, empty } = result;
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: references.organizationId },
    async (tx) => {
      expect(await tx.companyUser.count()).toBe(25);
      expect(await tx.location.count()).toBe(3);
      expect(await tx.brand.count()).toBe(1);
      expect(await tx.product.count()).toBe(42);
      expect(await tx.recipeVersion.count()).toBe(42);
      expect(await tx.locationProduct.count()).toBe(126);
      expect(await tx.customer.count()).toBe(36);
      expect(await tx.customerAddress.count()).toBe(72);
      expect(await tx.diningTable.count()).toBe(24);
      expect(await tx.order.count()).toBe(156);
      expect(await tx.checkout.count()).toBe(36);
      expect(await tx.payment.count()).toBe(60);
      expect(await tx.paymentRefund.count()).toBe(12);
      expect(await tx.cashShift.count()).toBe(3);
      expect(await tx.courier.count()).toBe(3);
      expect(await tx.kitchenStation.count()).toBe(6);
      expect(await tx.workShift.count()).toBe(15);
      expect(await tx.order.count({ where: { deliveryStatus: 'DELIVERED' } })).toBe(15);
      expect(await tx.deliveryProof.count()).toBe(15);
      expect(await tx.order.count({ where: { status: 'COMPLETED' } })).toBe(72);
      expect(await tx.order.count({ where: { status: 'CANCELLED' } })).toBe(12);
      expect(await tx.inventoryReservation.count({ where: { status: 'CONSUMED' } })).toBe(72);
      expect(await tx.inventoryReservation.count({ where: { status: 'RELEASED' } })).toBe(12);
      const clients = await tx.customer.findMany();
      expect(clients.every((c) => !c.privateDataEncrypted.includes('Client DEMO'))).toBe(true);
      const docs = await tx.inventoryDocument.count({ where: { kind: 'CONSUMPTION' } });
      expect(docs).toBe(72);
      expect(await tx.product.count({ where: { organizationId: empty.organization.id } })).toBe(0);
    },
  );
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: empty.organization.id },
    async (tx) => {
      expect(await tx.companyUser.count()).toBe(1);
      for (const count of [
        await tx.location.count(),
        await tx.product.count(),
        await tx.customer.count(),
        await tx.order.count(),
        await tx.role.count(),
        await tx.inventoryItem.count(),
      ])
        expect(count).toBe(0);
      expect(await tx.order.count({ where: { organizationId: references.organizationId } })).toBe(
        0,
      );
    },
  );
  expect(await db.runtime.order.count()).toBe(0);
  const crossTenant = db.withTenantTransaction(
    db.runtime,
    { organizationId: result.empty.organization.id, userId: result.empty.user.id },
    (tx) =>
      tx.userLocationAccess.create({
        data: {
          organizationId: result.empty.organization.id,
          userId: result.empty.user.id,
          locationId: references.locationIds[0]!,
        },
      }),
  );
  await expect(crossTenant).rejects.toThrow();
});

it('retains MFA gates, location isolation and explicit delegation provenance', async () => {
  const primary = new BrowserSession('TENANT');
  expect(
    (await primary.login('admin', record.companies[0]!.admin.password, record.companies[0]!.slug))
      .stage,
  ).toBe('password');
  expect((await primary.call('/context')).status).toBe(403);
  const manager = new BrowserSession('TENANT');
  expect(
    (
      await manager.login(
        record.users[0]!.login,
        record.users[0]!.secret,
        record.companies[0]!.slug,
      )
    ).stage,
  ).toBe('password');
  expect((await manager.call('/context')).status).toBe(403);
  const operator = new BrowserSession('TENANT');
  await operator.expect('/auth/session');
  expect(
    (
      await operator.expect('/auth/pin', 'POST', {
        companySlug: record.companies[0]!.slug,
        pin: record.users[1]!.secret,
      })
    ).stage,
  ).toBe('ready');
  expect(
    (await operator.call(`/orders?locationId=${result.references.locationIds[1]}`)).status,
  ).toBe(403);
  expect(
    (
      await operator.call('/staff', 'POST', {
        login: 'escalated',
        displayName: 'Escalated',
        authenticationMethod: 'PIN',
        locationIds: [result.references.locationIds[0]],
        assignments: [],
      })
    ).status,
  ).toBe(403);
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: result.references.organizationId },
    async (tx) => {
      const policy = await loadAuthorization(tx, result.references.organizationId);
      const locationId = result.references.locationIds[0]!;
      const scope = {
        organizationId: result.references.organizationId,
        scopeType: 'LOCATION' as const,
        locationId,
      };
      const waiter = record.users[5]!;
      expect(policy.service.canUse(waiter.id, 'orders.create', scope)).toBe(true);
      expect(policy.service.canGrant(record.users[0]!.id, waiter.id, 'orders.create', scope)).toBe(
        true,
      );
      expect(
        policy.service.canGrant(record.users[0]!.id, waiter.id, 'payments.refund', scope),
      ).toBe(false);
      const assignment = await tx.userRoleAssignment.findFirstOrThrow({
        where: { userId: waiter.id },
      });
      expect(assignment.delegationGrantId).not.toBeNull();
      await tx.delegationGrant.update({
        where: { id: assignment.delegationGrantId! },
        data: { status: 'REVOKED', revokedAt: new Date(), version: { increment: 1 } },
      });
      const revoked = await loadAuthorization(tx, result.references.organizationId);
      expect(revoked.service.canUse(waiter.id, 'orders.create', scope)).toBe(false);
    },
  );
});

it('verifies a finished seed without resetting credentials or operator changes, and refuses collisions', async () => {
  const context = {
    organizationId: result.references.organizationId,
    userId: result.references.adminId,
  };
  const changed = await hashPassword(`Changed-${randomUUID()}`);
  await db.withTenantTransaction(db.runtime, context, async (tx) => {
    await tx.companyUser.update({ where: { id: context.userId }, data: { passwordHash: changed } });
    await tx.product.update({
      where: { id: result.references.products[0]!.id },
      data: { description: 'Descriere editată de operator', version: { increment: 1 } },
    });
  });
  await verifyShowcaseSeed(clients(), record);
  await provisionCompanies(clients(), record);
  const login = vi
    .spyOn(SeedHttpClient.prototype, 'login')
    .mockRejectedValue(new Error('Finished locations must not open new sessions'));
  try {
    await runShowcaseSeed(clients(), record, bases.TENANT);
  } finally {
    login.mockRestore();
  }
  await db.withTenantTransaction(db.runtime, context, async (tx) => {
    const admin = await tx.companyUser.findUniqueOrThrow({ where: { id: context.userId } });
    expect(await verifyPassword(admin.passwordHash, record.companies[0]!.admin.password)).toBe(
      false,
    );
    expect(
      await tx.product.findUnique({ where: { id: result.references.products[0]!.id } }),
    ).toMatchObject({ description: 'Descriere editată de operator' });
    expect(await tx.order.count()).toBe(156);
  });
  const conflict = structuredClone(record);
  conflict.platform.id = randomUUID();
  await expect(provisionCompanies(clients(), conflict)).rejects.toThrow();
});
