import type { z } from 'zod';
import type { Order } from './orders.types';
import type { orderCreationResolutionSchema } from './order-creation.schema';
export type OrderCreationResolutionRequest = z.input<typeof orderCreationResolutionSchema>;
export type OrderCreationResolutionResponse =
  | { status: 'CREATED'; order: Order }
  | { status: 'RETIRED'; locationId: string; requestKey: string };
