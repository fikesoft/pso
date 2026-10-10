import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { customerData, linkedContact } from './fixtures/customer.fixture';
import { prepareCheckoutOrder, writeCheckout } from './fixtures/checkout.fixture';
import { loadAuthorization } from '../../../apps/api/src/entities/tenant-access';
import { scanReadableOrders } from '../../../apps/api/src/features/orders/model/order-scan';
import {
  decodeOrderCursor,
  orderFilterFingerprint,
} from '../../../apps/api/src/features/orders/model/order-search-cursor';
import type { OrderCursorContext } from '../../../apps/api/src/features/orders/model/order-search.types';

test('PostgreSQL real: ultima comandă finalizată trece201candidați ascunși fără inferență după telefon', async () => {
  const f = await createOperationsFixture();
  try {
    const customer = await f.txA((tx) => tx.customer.create({ data: customerData(f) }));
    const viewer = await f.txA(async (tx) => {
      const user = await tx.companyUser.create({
        data: {
          organizationId: f.a.organization.id,
          loginNormalized: `repeat-${randomUUID()}`,
          displayName: 'Cititor sintetic',
          passwordHash: 'unused',
          createdByUserId: f.a.user.id,
          managedByUserId: f.a.user.id,
        },
      });
      await tx.userLocationAccess.create({
        data: { organizationId: f.a.organization.id, userId: user.id, locationId: f.locationA.id },
      });
      await tx.userPermissionOverride.create({
        data: {
          organizationId: f.a.organization.id,
          userId: user.id,
          permissionKey: 'orders.read',
          effect: 'ALLOW',
          scopeType: 'LOCATION',
          locationId: f.locationA.id,
          maxAmount: '5',
          issuedByUserId: f.a.user.id,
        },
      });
      return user;
    });
    const linked = {
      ...f,
      createDraft: async () => {
        const draft = await f.createDraft();
        const order = await f.txA((tx) =>
          tx.order.update({
            where: { id: draft.order.id },
            data: { ...linkedContact(customer.id), version: { increment: 1 } },
          }),
        );
        return { ...draft, order };
      },
    };
    const low = await prepareCheckoutOrder(linked, true);
    await writeCheckout(linked, low);
    for (let index = 0; index < 201; index++) {
      const high = await prepareCheckoutOrder(linked);
      await writeCheckout(linked, high);
    }
    const manualState = {
      ...f,
      createDraft: async () => {
        const draft = await f.createDraft();
        const contact = linkedContact(customer.id);
        const order = await f.txA((tx) =>
          tx.order.update({
            where: { id: draft.order.id },
            data: {
              customerDataEncrypted: contact.customerDataEncrypted,
              customerNameLookupHash: contact.customerNameLookupHash,
              customerPhoneLookupHash: contact.customerPhoneLookupHash,
              version: { increment: 1 },
            },
          }),
        );
        assert.equal(order.customerId, null);
        return { ...draft, order };
      },
    };
    const manual = await prepareCheckoutOrder(manualState, true);
    await writeCheckout(manualState, manual);
    const context: OrderCursorContext = {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      userId: viewer.id,
      kind: 'CUSTOMER_LAST',
      fingerprint: orderFilterFingerprint({ customerId: customer.id, status: 'COMPLETED' }),
    };
    const page = async (cursor?: string) =>
      f.txA(async (tx) => {
        const authorization = await loadAuthorization(tx, f.a.organization.id);
        return scanReadableOrders(
          tx,
          { ...authorization, currentUser: viewer },
          {
            context,
            where: { locationId: f.locationA.id, customerId: customer.id, status: 'COMPLETED' },
            limit: 1,
            ...(cursor ? { before: decodeOrderCursor(context, cursor) } : {}),
          },
        );
      });
    const first = await page();
    assert.deepEqual(first.orders, []);
    assert.ok(first.nextCursor);
    const second = await page(first.nextCursor);
    assert.equal(second.orders.length, 1);
    assert.equal(second.orders[0]!.id, low.id);
    assert.notEqual(second.orders[0]!.id, manual.id);
    assert.equal(second.nextCursor, null);
    await f.txA((tx) =>
      tx.userPermissionOverride.create({
        data: {
          organizationId: f.a.organization.id,
          userId: viewer.id,
          permissionKey: 'orders.read',
          effect: 'DENY',
          scopeType: 'LOCATION',
          locationId: f.locationA.id,
          issuedByUserId: f.a.user.id,
        },
      }),
    );
    assert.deepEqual((await page(first.nextCursor)).orders, []);
    assert.equal(await f.txB((tx) => tx.order.count({ where: { customerId: customer.id } })), 0);
    assert.equal(
      await f.txA((tx) =>
        tx.order.count({ where: { customerId: customer.id, status: 'COMPLETED' } }),
      ),
      202,
    );
  } finally {
    await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  }
});
