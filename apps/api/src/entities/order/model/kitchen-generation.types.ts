import type { Prisma } from '@pos/db';
export interface KitchenGenerationInput {
  organizationId: string;
  locationId: string;
  orderId: string;
  orderVersion: number;
  requestKey: string;
  requestHash: string;
  actorUserId: string;
}
export type KitchenGenerationItem = Prisma.OrderItemGetPayload<Record<string, never>>;
