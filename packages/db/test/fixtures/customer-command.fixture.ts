import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src';
import type { OperationsFixture } from './operations.types';

export function customerCommandData(
  f: OperationsFixture,
  customerId: string,
  overrides: Partial<Prisma.CustomerCommandUncheckedCreateInput> = {},
): Prisma.CustomerCommandUncheckedCreateInput {
  return {
    organizationId: f.a.organization.id,
    customerId,
    locationId: f.locationA.id,
    actorUserId: f.a.user.id,
    requestKey: randomUUID(),
    action: 'ARCHIVE',
    status: 'SUCCEEDED',
    requestHash: 'a'.repeat(64),
    expectedVersion: 1,
    ...overrides,
  };
}
