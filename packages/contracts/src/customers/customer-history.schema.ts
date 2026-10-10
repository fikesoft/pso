import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import { ORDER_STATUSES } from '../orders/config/order.constants';

export const customerHistoryQuerySchema = z
  .object({
    locationId: idSchema,
    status: z.enum(ORDER_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
