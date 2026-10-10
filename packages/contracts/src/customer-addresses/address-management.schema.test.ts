import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  addressManagementCommandSchema,
  addressManagementResolutionSchema,
  addressManagementQuerySchema,
  addressManagementResultSchema,
  addressManagementCommandResponseSchema,
  addressManagementListResponseSchema,
} from './address-management.schema';
import type { AddressManagementResult } from './address-management.types';

function identity() {
  return { locationId: randomUUID(), requestKey: randomUUID(), version: 1 };
}
function result(): AddressManagementResult {
  return {
    customerId: randomUUID(),
    addressId: randomUUID(),
    requestKey: randomUUID(),
    action: 'UPDATE',
    expectedVersion: 1,
    version: 2,
    status: 'ACTIVE',
    expectedPreferenceVersion: 1,
    preferenceVersion: 1,
    defaultAddressId: null,
    occurredAt: '2026-10-04T00:00:00.000Z',
  };
}
it('editarea cere profil complet, păstrează spațierea internă și normalizează opționalele goale', () => {
  const body = {
    ...identity(),
    action: 'UPDATE',
    profile: { label: ' Acasă ', address: ' Strada A  1 ', instructions: '  ' },
  };
  expect(addressManagementCommandSchema.parse(body)).toMatchObject({
    profile: { label: 'Acasă', address: 'Strada A  1', instructions: null },
  });
  for (const profile of [
    { ...body.profile, address: '' },
    { ...body.profile, address: 'a'.repeat(501) },
    { ...body.profile, label: 'a'.repeat(81) },
    { ...body.profile, instructions: 'a'.repeat(501) },
    { address: 'A' },
    { ...body.profile, isDefault: true },
  ])
    expect(addressManagementCommandSchema.safeParse({ ...body, profile }).success).toBe(false);
  expect(addressManagementCommandSchema.safeParse({ ...body, version: 2147483647 }).success).toBe(
    false,
  );
});
it('preferința are versiune obligatorie separată, iar arhivarea nu acceptă conținut', () => {
  const base = identity();
  for (const action of ['SET_DEFAULT', 'CLEAR_DEFAULT']) {
    expect(addressManagementCommandSchema.safeParse({ ...base, action }).success).toBe(false);
    expect(
      addressManagementCommandSchema.safeParse({ ...base, action, preferenceVersion: 1 }).success,
    ).toBe(true);
    for (const preferenceVersion of [0, 1.2, 2147483647])
      expect(
        addressManagementCommandSchema.safeParse({ ...base, action, preferenceVersion }).success,
      ).toBe(false);
    expect(
      addressManagementCommandSchema.safeParse({
        ...base,
        action,
        preferenceVersion: 1,
        profile: { address: 'A' },
      }).success,
    ).toBe(false);
  }
  expect(addressManagementCommandSchema.safeParse({ ...base, action: 'ARCHIVE' }).success).toBe(
    true,
  );
  expect(
    addressManagementCommandSchema.safeParse({ ...base, action: 'ARCHIVE', preferenceVersion: 2 })
      .success,
  ).toBe(false);
});
it('recuperarea conține numai identitatea, iar filtrul implicit păstrează adresele active', () => {
  const { locationId, requestKey } = identity();
  expect(
    addressManagementResolutionSchema.parse({ locationId, requestKey, action: 'UPDATE' }),
  ).toEqual({ locationId, requestKey, action: 'UPDATE' });
  for (const extra of [{ version: 1 }, { profile: { address: 'A' } }, { preferenceVersion: 1 }])
    expect(
      addressManagementResolutionSchema.safeParse({
        locationId,
        requestKey,
        action: 'UPDATE',
        ...extra,
      }).success,
    ).toBe(false);
  expect(addressManagementQuerySchema.parse({ locationId })).toEqual({
    locationId,
    status: 'ACTIVE',
    limit: 50,
  });
  for (const query of [{ status: 'DELETED' }, { cursor: '' }, { limit: 101 }, { address: 'A' }])
    expect(addressManagementQuerySchema.safeParse({ locationId, ...query }).success).toBe(false);
});
it('rezultatul probează separat schimbarea conținutului, preferinței și arhivarea implicitului', () => {
  const value = result();
  const valid: AddressManagementResult[] = [
    value,
    {
      ...value,
      action: 'SET_DEFAULT',
      version: 1,
      preferenceVersion: 2,
      defaultAddressId: value.addressId,
    },
    { ...value, action: 'CLEAR_DEFAULT', version: 1, preferenceVersion: 2 },
    { ...value, action: 'ARCHIVE', status: 'ARCHIVED' },
    { ...value, action: 'ARCHIVE', status: 'ARCHIVED', preferenceVersion: 2 },
  ];
  for (const row of valid) expect(addressManagementResultSchema.safeParse(row).success).toBe(true);
  for (const row of [
    { ...value, version: 1 },
    { ...value, preferenceVersion: 2 },
    { ...valid[1], defaultAddressId: randomUUID() },
    { ...valid[1], preferenceVersion: 1 },
    { ...valid[2], defaultAddressId: value.addressId },
    { ...valid[3], defaultAddressId: value.addressId },
    { ...valid[4], defaultAddressId: randomUUID() },
    { ...valid[3], preferenceVersion: 3 },
  ])
    expect(addressManagementResultSchema.safeParse(row).success).toBe(false);
});
it('rezultatul istoric acceptă starea curentă ulterioară, dar refuză identități sau versiuni incompatibile', () => {
  const value = result();
  const body = {
    status: 'SUCCEEDED',
    result: value,
    command: {
      addressId: value.addressId,
      requestKey: value.requestKey,
      locationId: randomUUID(),
      action: value.action,
    },
    address: {
      id: value.addressId,
      customerId: value.customerId,
      version: 3,
      status: 'ARCHIVED',
      label: null,
      address: 'Strada sintetică 1',
      instructions: null,
      createdAt: value.occurredAt,
      updatedAt: value.occurredAt,
    },
    preference: { customerId: value.customerId, version: 3, defaultAddressId: randomUUID() },
  };
  expect(addressManagementCommandResponseSchema.safeParse(body).success).toBe(true);
  expect(
    addressManagementCommandResponseSchema.safeParse({ ...body, status: 'RETIRED', result: null })
      .success,
  ).toBe(true);
  for (const patch of [
    { command: { ...body.command, requestKey: randomUUID() } },
    { preference: { ...body.preference, customerId: randomUUID() } },
    { preference: { ...body.preference, version: 1 } },
    { address: { ...body.address, version: 2 } },
    { address: { ...body.address, id: randomUUID() } },
  ])
    expect(addressManagementCommandResponseSchema.safeParse({ ...body, ...patch }).success).toBe(
      false,
    );
  expect(
    addressManagementListResponseSchema.safeParse({
      addresses: [body.address],
      preference: { ...body.preference, customerId: randomUUID() },
      nextCursor: null,
    }).success,
  ).toBe(false);
});
