import type { TenantTransaction } from '@pos/db';
export async function courierHasAcceptedAssignment(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  orderId: string,
  userId: string | null,
) {
  if (!userId) return false;
  const profile = await tx.courier.findFirst({ where: { organizationId, locationId, userId } });
  if (!profile) return true; // Historical compatibility is removed with DEV-144 enrollment.
  const assignment = await tx.deliveryOperation.findFirst({
    where: { organizationId, locationId, orderId, toStatus: 'ASSIGNED' },
    orderBy: { orderVersion: 'desc' },
  });
  return (
    !!assignment &&
    !!(await tx.courierAcceptanceCommand.findFirst({
      where: {
        organizationId,
        assignmentId: assignment.id,
        actorUserId: userId,
        status: 'SUCCEEDED',
      },
    }))
  );
}
