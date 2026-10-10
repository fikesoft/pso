import { z } from 'zod';
import { idSchema } from '../shared';

export const orderCreatorsQuerySchema = z
  .object({
    locationId: idSchema,
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
