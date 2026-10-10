import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createCustomerSchema, customerLookupSchema } from './customers.schema';
import { createOrderSchema, updateOrderSchema } from '../orders';
import { PERMISSIONS } from '@pos/authz';
it('cere telefon explicit și păstrează autoritatea CRM exclusiv organizațională', () => {
  const locationId = randomUUID();
  expect(customerLookupSchema.parse({ locationId, phone: ' +373 (60) 000-001 ' }).phone).toBe(
    '+373 (60) 000-001',
  );
  for (const phone of ['', ' ', '+', 'abc', '+373 +60'])
    expect(customerLookupSchema.safeParse({ locationId, phone }).success).toBe(false);
  expect(
    createCustomerSchema.safeParse({ locationId, phone: '123', requestKey: randomUUID() }).success,
  ).toBe(true);
  for (const key of ['customers.read', 'customers.create', 'customers.update', 'customers.archive'])
    expect(PERMISSIONS.find((permission) => permission.key === key)?.scopeTypes).toEqual([
      'ORGANIZATION',
    ]);
});
it('distinge omiterea, ștergerea și selectarea fără a permite contact simultan cu ref', () => {
  const base = {
    locationId: randomUUID(),
    requestKey: randomUUID(),
    serviceType: 'TAKEAWAY',
    items: [{ productId: randomUUID(), quantity: '1' }],
  };
  const customerRef = { id: randomUUID(), version: 1 };
  expect(createOrderSchema.parse(base).customerRef).toBeUndefined();
  expect(createOrderSchema.parse({ ...base, customerRef: null }).customerRef).toBeNull();
  expect(createOrderSchema.parse({ ...base, customerRef }).customerRef).toEqual(customerRef);
  for (const customer of [null, {}, { name: 'Sintetic' }])
    expect(createOrderSchema.safeParse({ ...base, customerRef, customer }).success).toBe(false);
  const patch = { version: 1, serviceType: 'TAKEAWAY', items: base.items };
  expect(updateOrderSchema.safeParse({ ...patch, customerRef, customer: null }).success).toBe(
    false,
  );
  expect(
    updateOrderSchema.safeParse({ ...patch, customerRef: null, customer: { phone: '123' } })
      .success,
  ).toBe(true);
});
