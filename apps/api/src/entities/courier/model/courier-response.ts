import { courierSchema, courierResultSchema } from '@pos/contracts';
import type { CourierRow, CourierCommandRow } from './courier.types';
export function courierResponse(
  row: CourierRow,
  displayName: string,
  eligible: boolean,
  activeDeliveries: number,
) {
  const effectiveStatus =
    row.status === 'ARCHIVED'
      ? 'ARCHIVED'
      : !eligible
        ? 'UNAVAILABLE'
        : activeDeliveries > 0
          ? 'IN_DELIVERY'
          : row.availability;
  return courierSchema.parse({
    id: row.id,
    locationId: row.locationId,
    userId: row.userId,
    displayName,
    profile: row.profile,
    version: row.version,
    status: row.status,
    availability: row.availability,
    effectiveStatus,
    activeDeliveries,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export function courierCommandResult(command: CourierCommandRow) {
  return courierResultSchema.parse({
    requestKey: command.requestKey,
    action: command.action,
    courierId: command.courierId,
    locationId: command.locationId,
    userId: command.userId,
    version: command.resultVersion,
    status: command.resultStatus,
    availability: command.availability,
    occurredAt: command.createdAt.toISOString(),
  });
}
