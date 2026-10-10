import { randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src';
import type { OperationsFixture } from './operations.types';

export function creationOrderData(
  f: OperationsFixture,
  requestKey = randomUUID(),
  overrides: Partial<Prisma.OrderUncheckedCreateInput> = {},
): Prisma.OrderUncheckedCreateInput {
  return {
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    clientRequestId: requestKey,
    creationRequestHash: 'd'.repeat(64),
    number: 1,
    serviceType: 'TAKEAWAY',
    total: '0',
    createdByUserId: f.a.user.id,
    updatedByUserId: f.a.user.id,
    ...overrides,
  };
}

export function retireCreation(tx: TenantTransaction, f: OperationsFixture, requestKey: string) {
  return tx.orderCreationClaim.create({
    data: {
      organizationId: f.a.organization.id,
      locationId: f.locationA.id,
      requestKey,
      status: 'RETIRED',
      actorUserId: f.a.user.id,
    },
  });
}
