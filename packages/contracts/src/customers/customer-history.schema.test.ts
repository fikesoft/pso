import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { customerHistoryQuerySchema } from './customer-history.schema';

it('istoricul cere locație explicită, limitează paginarea și refuză scope sau filtre inventate', () => {
  const locationId = randomUUID();
  expect(customerHistoryQuerySchema.parse({ locationId })).toEqual({ locationId, limit: 20 });
  expect(
    customerHistoryQuerySchema.parse({ locationId, limit: '50', status: 'COMPLETED' }).limit,
  ).toBe(50);
  for (const change of [
    { locationId: '' },
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { status: 'PAID' },
    { cursor: '' },
    { cursor: 'x'.repeat(2049) },
    { organizationId: randomUUID() },
    { customerPhone: '060123456' },
  ])
    expect(customerHistoryQuerySchema.safeParse({ locationId, ...change }).success).toBe(false);
});
