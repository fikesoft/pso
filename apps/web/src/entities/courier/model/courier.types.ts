import type { CourierCommand, CourierResolution } from '@pos/contracts';
export interface CourierAttempt {
  courierId: string;
  body: CourierCommand;
}
export interface CourierRecovery {
  courierId: string;
  body: CourierResolution;
}
