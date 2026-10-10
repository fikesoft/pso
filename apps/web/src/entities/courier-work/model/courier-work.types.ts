import type { CourierAcceptance, CourierAcceptanceResolution } from '@pos/contracts';
import type { DeliveryCommand, DeliveryResolution } from '@pos/contracts';
export interface TransitionAttempt {
  orderId: string;
  locationId: string;
  body: DeliveryCommand;
}
export interface TransitionRecovery {
  orderId: string;
  body: DeliveryResolution;
}
export interface AcceptanceAttempt {
  orderId: string;
  body: CourierAcceptance;
}
export interface AcceptanceRecovery {
  orderId: string;
  body: CourierAcceptanceResolution;
}
