import type { kitchenQuerySchema } from '@pos/contracts';
import type { z } from 'zod';

export type KitchenQuery = z.infer<typeof kitchenQuerySchema>;
export interface KitchenServerClock {
  serverTime: Date;
}
