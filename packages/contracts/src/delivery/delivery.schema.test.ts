import { describe, expect, it } from 'vitest';
import { deliveryCommandSchema, deliveryQuerySchema } from './delivery.schema';

describe('comenzi de livrare', () => {
  const base = { version: 2, requestKey: '00000000-0000-4000-8000-000000000001' };
  it('cere curier exclusiv la atribuire', () => {
    expect(deliveryCommandSchema.safeParse({ ...base, status: 'ASSIGNED' }).success).toBe(false);
    expect(
      deliveryCommandSchema.safeParse({
        ...base,
        status: 'ASSIGNED',
        courierUserId: base.requestKey,
      }).success,
    ).toBe(true);
    for (const status of ['WAITING_COURIER', 'PICKED_UP', 'DELIVERING', 'DELIVERED', 'FAILED'])
      expect(
        deliveryCommandSchema.safeParse({
          ...base,
          status,
          courierUserId: base.requestKey,
          reason: 'Motiv sintetic',
        }).success,
      ).toBe(false);
  });
  it('cere motive reale pentru eșec și reluare', () => {
    for (const status of ['FAILED', 'WAITING_COURIER']) {
      for (const reason of [undefined, '', '   ', 'ab', 'x'.repeat(501)])
        expect(deliveryCommandSchema.safeParse({ ...base, status, reason }).success).toBe(false);
      expect(
        deliveryCommandSchema.parse({ ...base, status, reason: '  Client indisponibil  ' }).reason,
      ).toBe('Client indisponibil');
    }
  });
  it('respinge stări, versiuni, identificatori și câmpuri controlate de server', () => {
    for (const patch of [
      { status: 'NOT_REQUIRED' },
      { status: 'UNKNOWN' },
      { status: null },
      { version: 0 },
      { version: 1.5 },
      { requestKey: 'invalid' },
      { actorUserId: base.requestKey },
      { organizationId: base.requestKey },
      { locationId: base.requestKey },
      { courierName: 'Inventat' },
      { fromStatus: 'ASSIGNED' },
    ])
      expect(
        deliveryCommandSchema.safeParse({ ...base, status: 'PICKED_UP', ...patch }).success,
      ).toBe(false);
    expect(deliveryQuerySchema.safeParse({ cursor: 'invalid' }).success).toBe(false);
    expect(deliveryQuerySchema.safeParse({ locationId: base.requestKey }).success).toBe(false);
  });
});
