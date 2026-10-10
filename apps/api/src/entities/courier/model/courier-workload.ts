import type { TenantTransaction } from '@pos/db';
import { courierProfileSchema } from '@pos/contracts';
export async function courierWorkload(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  userId: string,
) {
  return tx.order.count({
    where: {
      organizationId,
      locationId,
      deliveryCourierId: userId,
      deliveryStatus: { in: ['ASSIGNED', 'PICKED_UP', 'DELIVERING'] },
    },
  });
}
export async function courierProfileAllowsAssignment(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  userId: string,
) {
  const profile = await tx.courier.findFirst({ where: { organizationId, locationId, userId } });
  // Existing unregistered identities remain compatible until DEV-144 completes enrollment.
  if (!profile) return true;
  return (
    profile.status === 'ACTIVE' &&
    profile.availability === 'AVAILABLE' &&
    (await courierWorkload(tx, organizationId, locationId, userId)) <
      courierProfileSchema.parse(profile.profile).capacity
  );
}
