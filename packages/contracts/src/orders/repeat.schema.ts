import { z } from 'zod';
import { idSchema } from '../shared';
export const orderRepeatPreviewSchema = z.object({ locationId: idSchema }).strict();
export const orderLastCustomerOrderQuerySchema = z
  .object({ locationId: idSchema, cursor: z.string().min(1).max(2048).optional() })
  .strict();
