import { describe, expect, it } from 'vitest';
import { orderCustomerSchema } from './order-customer.schema';
import { orderSearchSchema } from './order-search.schema';

const locationId = 'abcdef00-0000-4000-8000-000000000001';
describe('filtrele comenzilor', () => {
  it('validează zile calendaristice reale și intervalul inclusiv', () => {
    for (const createdFrom of ['0000-01-01', '2026-02-29', '2026-13-01', '2026-01-32', '26-01-01'])
      expect(orderSearchSchema.safeParse({ locationId, createdFrom }).success).toBe(false);
    expect(
      orderSearchSchema.safeParse({
        locationId,
        createdFrom: '2024-02-29',
        createdTo: '2024-02-29',
      }).success,
    ).toBe(true);
    expect(
      orderSearchSchema.safeParse({
        locationId,
        createdFrom: '2026-02-02',
        createdTo: '2026-02-01',
      }).success,
    ).toBe(false);
  });
  it('acceptă telefonul întreg, nu extensii sau termeni parțiali ambigui', () => {
    expect(orderCustomerSchema.parse({ name: ' Ana ', phone: ' +373 (60) 000-001 ' })).toEqual({
      name: 'Ana',
      phone: '+373 (60) 000-001',
    });
    for (const phone of ['abc', '+', '()-', '123 ext45', '++123', '123+45'])
      expect(orderCustomerSchema.safeParse({ phone }).success).toBe(false);
    expect(
      orderSearchSchema.parse({ locationId, customerPhone: ' ' }).customerPhone,
    ).toBeUndefined();
    expect(orderCustomerSchema.parse({ name: null })).toEqual({ name: null });
  });
  it('respinge depășirea Int PostgreSQL, limite și câmpuri necunoscute', () => {
    expect(orderSearchSchema.safeParse({ locationId, number: 2_147_483_647 }).success).toBe(true);
    for (const value of [
      { number: 2_147_483_648 },
      { number: 0 },
      { limit: 201 },
      { customerId: locationId },
      { customerName: '' },
    ])
      expect(orderSearchSchema.safeParse({ locationId, ...value }).success).toBe(false);
  });
});
