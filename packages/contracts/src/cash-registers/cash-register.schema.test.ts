import { describe, expect, it } from 'vitest';
import {
  cashRegisterCreateSchema,
  cashRegisterRenameSchema,
  cashRegisterArchiveSchema,
  cashRegisterResolutionSchema,
  cashRegisterQuerySchema,
} from './cash-register.schema';
describe('contractul caselor', () => {
  const locationId = '00000000-0000-4000-8000-000000000001';
  const requestKey = '00000000-0000-4000-8000-000000000002';
  it('normalizează codul și numele și refuză identitățile/controalele furnizate de client', () => {
    const body = { locationId, requestKey, code: ' casa_1 ', name: ' Casa principală ' };
    expect(cashRegisterCreateSchema.parse(body)).toMatchObject({
      code: 'CASA_1',
      name: 'Casa principală',
    });
    for (const change of [
      { code: ' ' },
      { code: 'a'.repeat(33) },
      { code: 'casa.' },
      { name: ' ' },
      { actorUserId: requestKey },
      { organizationId: requestKey },
      { status: 'ACTIVE' },
      { locationId: 'invalid' },
    ])
      expect(cashRegisterCreateSchema.safeParse({ ...body, ...change }).success).toBe(false);
  });
  it('versionează rename/archive și separă resolverul CREATE de țintele existente', () => {
    expect(
      cashRegisterRenameSchema.safeParse({ locationId, requestKey, version: 0, name: 'Casa' })
        .success,
    ).toBe(false);
    expect(
      cashRegisterArchiveSchema.safeParse({ locationId, requestKey, version: 1, name: 'Interzis' })
        .success,
    ).toBe(false);
    expect(
      cashRegisterResolutionSchema.safeParse({ locationId, requestKey, kind: 'CREATE' }).success,
    ).toBe(true);
    expect(
      cashRegisterResolutionSchema.safeParse({
        locationId,
        requestKey,
        kind: 'CREATE',
        registerId: requestKey,
      }).success,
    ).toBe(false);
    expect(
      cashRegisterResolutionSchema.safeParse({ locationId, requestKey, kind: 'RENAME' }).success,
    ).toBe(false);
    expect(cashRegisterQuerySchema.parse({ locationId })).toMatchObject({
      status: 'ACTIVE',
      limit: 50,
    });
    expect(cashRegisterQuerySchema.safeParse({ locationId, limit: 101 }).success).toBe(false);
  });
});
