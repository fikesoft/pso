import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createOrderSchema, updateOrderSchema } from '../orders';
import { customerAddressCreateSchema } from './customer-address.schema';
import { PERMISSIONS } from '@pos/authz';
it('adresa este opțională pentru DELIVERY, incompatibilă cu alte servicii și cu ref simultan', () => {
  const body = {
    serviceType: 'DELIVERY',
    locationId: randomUUID(),
    requestKey: randomUUID(),
    items: [{ productId: randomUUID(), quantity: '1' }],
  };
  expect(createOrderSchema.safeParse(body).success).toBe(true);
  const addressRef = { id: randomUUID(), version: 1 };
  for (const deliveryAddress of [null, { address: 'Sintetic' }])
    expect(createOrderSchema.safeParse({ ...body, addressRef, deliveryAddress }).success).toBe(
      false,
    );
  expect(
    createOrderSchema.safeParse({
      ...body,
      serviceType: 'TAKEAWAY',
      deliveryAddress: { address: 'Sintetic' },
    }).success,
  ).toBe(false);
  expect(
    createOrderSchema.safeParse({
      ...body,
      serviceType: 'TAKEAWAY',
      deliveryAddress: null,
      addressRef: null,
    }).success,
  ).toBe(true);
  expect(
    updateOrderSchema.safeParse({
      version: 1,
      serviceType: 'DELIVERY',
      items: body.items,
      addressRef,
      deliveryAddress: null,
    }).success,
  ).toBe(false);
});
it('permisiunea de gestionare este explicit organizațională; schema are limite și nu inventează normalizare geografică', () => {
  expect(
    PERMISSIONS.find((permission) => permission.key === 'customers.addresses.manage')?.scopeTypes,
  ).toEqual(['ORGANIZATION']);
  const body = { locationId: randomUUID(), requestKey: randomUUID(), address: ' Strada A  1 ' };
  expect(customerAddressCreateSchema.parse(body).address).toBe('Strada A  1');
  for (const address of [' ', 'a'.repeat(501)])
    expect(customerAddressCreateSchema.safeParse({ ...body, address }).success).toBe(false);
});
