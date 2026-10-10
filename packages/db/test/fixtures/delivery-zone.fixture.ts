import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src';
import { createSecurityFixture } from './security.fixture';

export const createDeliveryZoneFixture = createSecurityFixture;
export function deliveryZoneProfile() {
  return {
    name: 'Centru sintetic',
    shape: { type: 'RADIUS', center: { latitude: 47.02, longitude: 28.83 }, radiusMeters: 3000 },
    minimumOrder: '100.00',
    deliveryFee: '25.00',
    freeDeliveryFrom: '300.00',
    estimatedMinutes: 45,
    activeHours: [],
    priority: 10,
  };
}
export function deliveryZoneCommandData(
  f: Awaited<ReturnType<typeof createDeliveryZoneFixture>>,
  overrides: Partial<Prisma.DeliveryZoneCommandUncheckedCreateInput> = {},
): Prisma.DeliveryZoneCommandUncheckedCreateInput {
  return {
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    zoneId: randomUUID(),
    actorUserId: f.a.user.id,
    requestKey: randomUUID(),
    action: 'CREATE',
    status: 'SUCCEEDED',
    requestHash: 'a'.repeat(64),
    profile: deliveryZoneProfile(),
    ...overrides,
  };
}
