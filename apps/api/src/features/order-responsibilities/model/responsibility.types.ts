import type { Prisma } from '@pos/db';
import type { z } from 'zod';
import type {
  OrderResponsibilityCommandIdentity,
  orderResponsibilityListSchema,
} from '@pos/contracts/order-responsibilities';
export type ResponsibilityOrder = Prisma.OrderGetPayload<object>;
export type StoredResponsibility = Prisma.OrderResponsibilityGetPayload<object>;
export type StoredResponsibilityEvent = Prisma.OrderResponsibilityEventGetPayload<object>;
export type ResponsibilityShift = Prisma.CashShiftGetPayload<object>;
export type ResponsibilityListQuery = z.output<typeof orderResponsibilityListSchema>;
export interface ResponsibilityCursorContext {
  organizationId: string;
  actor: string;
  timezone: string;
  query: ResponsibilityListQuery;
}
export interface ResponsibilityHistoryContext {
  organizationId: string;
  actor: string;
  locationId: string;
  orderId: string;
  limit: number;
  timezone: string;
}
export interface ResponsibilityCommandContext {
  command: OrderResponsibilityCommandIdentity;
  actor: string;
  hash?: string;
}
