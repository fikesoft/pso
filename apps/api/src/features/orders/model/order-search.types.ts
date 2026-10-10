import type { Prisma } from '@pos/db';
import type { z } from 'zod';
import type { orderSearchSchema } from '@pos/contracts';

export type ParsedOrderSearch = z.output<typeof orderSearchSchema>;
export interface OrderCursorContext {
  organizationId: string;
  locationId: string;
  userId: string;
  kind: 'SEARCH' | 'LIST' | 'CREATORS' | 'CUSTOMER_LAST';
  fingerprint: string;
}
export interface OrderScanInput {
  where: Prisma.OrderWhereInput;
  context: OrderCursorContext;
  limit: number;
  before?: number;
  distinctCreators?: boolean;
}
export interface OrderDateBoundary {
  from: Date | null;
  until: Date | null;
}
