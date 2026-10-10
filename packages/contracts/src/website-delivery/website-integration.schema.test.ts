import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  createWebsiteKeySchema,
  websiteIntegrationOrderSchema,
} from './website-integration.schema';

it('primirea website cere total confirmat, fără prețuri sau identități alese de client', () => {
  const body = {
    schemaVersion: 1,
    externalOrderId: randomUUID(),
    externalLocationCode: 'CENTRU',
    customer: { name: 'Client', phone: '+373000000' },
    delivery: { address: 'Adresă sintetică' },
    paymentMethod: 'CASH_ON_DELIVERY',
    expectedTotal: '12.5',
    items: [{ externalProductId: 'SKU', quantity: '1' }],
  };
  expect(websiteIntegrationOrderSchema.parse(body).expectedTotal).toBe('12.50');
  for (const change of [
    { expectedTotal: undefined },
    { expectedTotal: '-1' },
    { expectedTotal: '1.001' },
    { organizationId: randomUUID() },
    { items: [{ externalProductId: 'SKU', quantity: '1', price: '0.01' }] },
    { paid: true },
  ])
    expect(websiteIntegrationOrderSchema.safeParse({ ...body, ...change }).success).toBe(false);
});
it('cheile au o expirare limitată și nu acceptă un secret furnizat de client', () => {
  expect(createWebsiteKeySchema.parse({ name: 'Backend' }).expiresInDays).toBe(30);
  for (const expiresInDays of [0, 91, -1, 1.5])
    expect(createWebsiteKeySchema.safeParse({ name: 'Backend', expiresInDays }).success).toBe(
      false,
    );
  expect(createWebsiteKeySchema.safeParse({ name: 'Backend', apiKey: 'secret' }).success).toBe(
    false,
  );
});
