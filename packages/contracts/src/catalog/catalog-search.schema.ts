import { z } from 'zod';
import { idSchema } from '../shared';

export const catalogSearchFields = {
  q: z
    .string()
    .trim()
    .max(150)
    .transform((value) => value || undefined)
    .optional(),
  categoryId: idSchema.optional(),
  cursor: z.string().min(1).max(2048).optional(),
};
