import { z } from 'zod';
import { idSchema } from '../shared';

export const activeOrdersSchema = z
  .object({
    locationId: idSchema,
    limit: z.coerce.number().int().min(1).max(50).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
