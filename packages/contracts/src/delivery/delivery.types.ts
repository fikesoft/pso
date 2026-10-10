import type { z } from 'zod';
import type { Order } from '../orders';
import type { DELIVERY_STATUSES } from './config/delivery.constants';
import type { deliveryProofSchema } from './delivery-proof.schema';
import type { deliveryCommandSchema } from './delivery.schema';
import type { deliveryResolutionSchema } from './delivery-recovery.schema';
export type DeliveryResolution = z.infer<typeof deliveryResolutionSchema>;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type DeliveryCommand = z.input<typeof deliveryCommandSchema>;
export interface DeliveryOperationRecord {
  id: string;
  fromStatus: DeliveryStatus | null;
  toStatus: DeliveryStatus;
  previousCourierId: string | null;
  courierUserId: string | null;
  courierName: string | null;
  actorUserId: string;
  reason: string | null;
  orderVersion: number;
  createdAt: string;
}
export interface DeliveryResponse {
  operations: DeliveryOperationRecord[];
  nextCursor: string | null;
  canAssign: boolean;
  canUpdate: boolean;
}
export interface DeliveryCouriersResponse {
  couriers: Array<{ id: string; displayName: string }>;
  nextCursor: string | null;
}
export interface DeliveryCommandResponse {
  order: Order;
  operation: DeliveryOperationRecord;
}

export type DeliveryProof = z.infer<typeof deliveryProofSchema>;
