import { randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src';
import { createOperationsFixture } from './operations.fixture';
import { customerData, linkedContact } from './customer.fixture';
export async function createCustomerAddressFixture() {
  const f = await createOperationsFixture();
  const customer = await f.txA((tx) => tx.customer.create({ data: customerData(f) }));
  const foreign = await f.txB((tx) =>
    tx.customer.create({
      data: customerData(f, {
        organizationId: f.b.organization.id,
        createdLocationId: f.locationB.id,
        createdByUserId: f.b.user.id,
      }),
    }),
  );
  return { ...f, customer, foreign };
}
export function addressData(
  f: Awaited<ReturnType<typeof createCustomerAddressFixture>>,
  overrides: Partial<Prisma.CustomerAddressUncheckedCreateInput> = {},
): Prisma.CustomerAddressUncheckedCreateInput {
  return {
    organizationId: f.a.organization.id,
    customerId: f.customer.id,
    createdLocationId: f.locationA.id,
    createdByUserId: f.a.user.id,
    privateDataEncrypted: Buffer.from(
      'synthetic-authenticated-address-ciphertext-for-db-test',
    ).toString('base64url'),
    snapshotHash: 'd'.repeat(64),
    creationRequestKey: randomUUID(),
    creationRequestHash: 'e'.repeat(64),
    ...overrides,
  };
}
export function addressOrderFields(customerId: string, addressId: string) {
  return {
    ...linkedContact(customerId),
    serviceType: 'DELIVERY',
    customerAddressId: addressId,
    customerAddressVersionSnapshot: 1,
    deliveryAddressEncrypted: 'a'.repeat(80),
    deliveryAddressHash: 'd'.repeat(64),
  };
}
export async function archiveAddress(
  tx: TenantTransaction,
  f: Awaited<ReturnType<typeof createCustomerAddressFixture>>,
  id: string,
) {
  const current = await tx.customerAddress.findUniqueOrThrow({ where: { id } });
  await tx.customerAddressCommand.create({
    data: {
      organizationId: f.a.organization.id,
      customerId: current.customerId,
      addressId: id,
      locationId: f.locationA.id,
      actorUserId: f.a.user.id,
      action: 'ARCHIVE',
      status: 'SUCCEEDED',
      expectedVersion: current.version,
      requestKey: randomUUID(),
      requestHash: 'f'.repeat(64),
    },
  });
  return tx.customerAddress.findUniqueOrThrow({ where: { id } });
}
export function retireAddress(
  tx: TenantTransaction,
  f: Awaited<ReturnType<typeof createCustomerAddressFixture>>,
  requestKey: string,
) {
  return tx.customerAddressCreationClaim.create({
    data: {
      organizationId: f.a.organization.id,
      customerId: f.customer.id,
      locationId: f.locationA.id,
      requestKey,
      actorUserId: f.a.user.id,
      status: 'RETIRED',
    },
  });
}
