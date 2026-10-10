import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { createOrderSchema } from '@pos/contracts';
import { orderCreationHash } from './order-creation-hash';
import { requestHash } from '../../../shared/lib/idempotency';
vi.mock('../../../shared/config', () => ({ config: { MFA_ENCRYPTION_KEY: 'a'.repeat(64) } }));
it('menține identitatea exactă a creărilor vechi fără ref și leagă ref de versiunea capturată', () => {
  const organizationId = randomUUID();
  const input = {
    locationId: randomUUID(),
    requestKey: randomUUID(),
    serviceType: 'TAKEAWAY' as const,
    items: [{ productId: randomUUID(), quantity: '1' }],
  };
  const body = createOrderSchema.parse(input);
  const legacyHash = requestHash({
    serviceType: input.serviceType,
    locationId: input.locationId,
    items: input.items,
    requestKey: input.requestKey,
  });
  expect(orderCreationHash(organizationId, body)).toBe(legacyHash);
  expect(orderCreationHash(organizationId, { ...body, customer: null, customerRef: null })).toBe(
    legacyHash,
  );
  const customerRef = { id: randomUUID(), version: 1 };
  const selectedHash = orderCreationHash(organizationId, { ...body, customerRef });
  expect(selectedHash).not.toBe(legacyHash);
  expect(
    orderCreationHash(organizationId, { ...body, customerRef: { ...customerRef, version: 2 } }),
  ).not.toBe(selectedHash);
});

it('păstrează identitatea pre083 inclusiv customerRef; adresa/ref nouă contribuie separat', () => {
  const organizationId = randomUUID();
  const input = {
    serviceType: 'DELIVERY' as const,
    locationId: randomUUID(),
    items: [{ productId: randomUUID(), quantity: '1' }],
    requestKey: randomUUID(),
  };
  const customerRef = { id: randomUUID(), version: 1 };
  const body = createOrderSchema.parse({ ...input, customerRef });
  const previous = requestHash({ ...input, customerRef });
  expect(orderCreationHash(organizationId, body)).toBe(previous);
  expect(
    orderCreationHash(organizationId, { ...body, addressRef: null, deliveryAddress: null }),
  ).toBe(previous);
  expect(
    orderCreationHash(organizationId, {
      ...body,
      deliveryAddress: { address: 'Adresă sintetică' },
    }),
  ).not.toBe(previous);
  const addressRef = { id: randomUUID(), version: 1 };
  expect(orderCreationHash(organizationId, { ...body, addressRef })).not.toBe(previous);
  expect(
    orderCreationHash(organizationId, { ...body, addressRef: { ...addressRef, version: 2 } }),
  ).not.toBe(orderCreationHash(organizationId, { ...body, addressRef }));
});
