import type { DeliveryZoneCommand, DeliveryZoneResolution } from '@pos/contracts';
export interface DeliveryZoneAttempt {
  zoneId: string;
  body: DeliveryZoneCommand;
}
export interface DeliveryZoneRecovery {
  zoneId: string;
  body: DeliveryZoneResolution;
}
