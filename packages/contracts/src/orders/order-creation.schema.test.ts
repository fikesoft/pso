import { describe, expect, it } from 'vitest';
import { orderCreationResolutionSchema } from './order-creation.schema';

describe('reconcilierea identității unei încercări de creare', () => {
  const input = {
    locationId: '00000000-0000-4000-8000-000000000001',
    requestKey: '00000000-0000-4000-8000-000000000002',
  };
  it('acceptă numai locația și cheia, fără conținutul ciornei sau context autoritar de client', () => {
    expect(orderCreationResolutionSchema.parse(input)).toEqual(input);
    for (const extra of [
      { actorUserId: input.requestKey },
      { organizationId: input.requestKey },
      { notes: 'Date personale' },
      { items: [] },
      { status: 'CREATED' },
      { requestHash: 'a'.repeat(64) },
    ])
      expect(orderCreationResolutionSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  it('refuză cheia sau locația lipsă, nulă ori nevalidă', () => {
    for (const field of ['locationId', 'requestKey'])
      for (const value of [undefined, null, '', 'invalid'])
        expect(orderCreationResolutionSchema.safeParse({ ...input, [field]: value }).success).toBe(
          false,
        );
  });
});
