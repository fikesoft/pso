import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src';
import type { OperationsFixture } from './operations.types';
export const syntheticProfile = {
  privateDataEncrypted: Buffer.from('synthetic-authenticated-customer-profile-ciphertext').toString(
    'base64url',
  ),
  phoneLookupHash: 'b'.repeat(64),
  nameLookupHash: 'a'.repeat(64),
};
export function customerData(
  f: OperationsFixture,
  overrides: Partial<Prisma.CustomerUncheckedCreateInput> = {},
): Prisma.CustomerUncheckedCreateInput {
  return {
    organizationId: f.a.organization.id,
    createdLocationId: f.locationA.id,
    createdByUserId: f.a.user.id,
    ...syntheticProfile,
    creationRequestKey: randomUUID(),
    creationRequestHash: 'c'.repeat(64),
    ...overrides,
  };
}
export function linkedContact(id: string, version = 1) {
  return {
    customerId: id,
    customerVersionSnapshot: version,
    customerDataEncrypted: Buffer.from(
      'synthetic-authenticated-order-specific-contact-ciphertext',
    ).toString('base64url'),
    customerNameLookupHash: syntheticProfile.nameLookupHash,
    customerPhoneLookupHash: syntheticProfile.phoneLookupHash,
  };
}
