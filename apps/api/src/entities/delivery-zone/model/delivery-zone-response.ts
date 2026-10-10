import { deliveryZoneSchema, deliveryZoneResultSchema } from '@pos/contracts';
import type { DeliveryZoneRow, DeliveryZoneCommandRow } from './delivery-zone.types';
export function deliveryZoneResponse(zone: DeliveryZoneRow) {
  return deliveryZoneSchema.parse({
    id: zone.id,
    locationId: zone.locationId,
    version: zone.version,
    status: zone.status,
    profile: zone.profile,
    createdAt: zone.createdAt.toISOString(),
    updatedAt: zone.updatedAt.toISOString(),
  });
}
export function deliveryZoneCommandResult(command: DeliveryZoneCommandRow) {
  return deliveryZoneResultSchema.parse({
    requestKey: command.requestKey,
    action: command.action,
    zoneId: command.zoneId,
    locationId: command.locationId,
    version: command.resultVersion,
    status: command.resultStatus,
    occurredAt: command.createdAt.toISOString(),
  });
}
