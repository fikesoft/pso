import { z } from 'zod';
import { idSchema } from '../shared';

export const listSessionsSchema = z.object({
  userId: idSchema.optional(),
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const revokeAllSessionsSchema = z.object({ userId: idSchema.optional() }).strict();
