import type { Prisma } from '../../src';
export interface DeliveryTestCommand {
  toStatus: string;
  courierUserId?: string;
  reason?: string;
  orderVersion?: number;
  omit?: 'order' | 'event';
  operation?: Partial<Prisma.DeliveryOperationUncheckedCreateInput>;
  event?: Partial<Prisma.OrderStatusEventUncheckedCreateInput>;
}
