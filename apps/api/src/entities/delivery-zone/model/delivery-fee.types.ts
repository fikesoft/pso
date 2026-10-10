import type { DeliveryCoordinate, DeliveryZone } from '@pos/contracts';
export interface DeliveryFeeInput {
  zones: Pick<DeliveryZone, 'id' | 'version' | 'profile' | 'status'>[];
  destination: DeliveryCoordinate;
  subtotal: string;
  timezone: string;
  asOf: Date;
}
export type DeliveryFeeCalculation =
  | { status: 'OUTSIDE_ZONE' | 'CLOSED' }
  | { status: 'MINIMUM_NOT_MET'; zoneId: string; zoneVersion: number; minimumOrder: string }
  | {
      status: 'AVAILABLE';
      zoneId: string;
      zoneVersion: number;
      zoneName: string;
      subtotal: string;
      fee: string;
      total: string;
      estimatedMinutes: number;
    };
