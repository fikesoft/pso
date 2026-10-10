import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src';
import type { createCustomerAddressFixture } from './customer-address.fixture';
export function addressCommandData(
  f: Awaited<ReturnType<typeof createCustomerAddressFixture>>,
  addressId: string,
  overrides: Partial<Prisma.CustomerAddressCommandUncheckedCreateInput> = {},
): Prisma.CustomerAddressCommandUncheckedCreateInput {
  return {
    organizationId: f.a.organization.id,
    customerId: f.customer.id,
    addressId,
    locationId: f.locationA.id,
    actorUserId: f.a.user.id,
    requestKey: randomUUID(),
    action: 'UPDATE',
    status: 'SUCCEEDED',
    requestHash: 'a'.repeat(64),
    expectedVersion: 1,
    privateDataEncrypted: Buffer.from(
      'synthetic-edited-authenticated-address-ciphertext-for-db-test',
    ).toString('base64url'),
    snapshotHash: 'b'.repeat(64),
    ...overrides,
  };
}
