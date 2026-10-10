import type { z } from 'zod';
import type { brandSchema, createBrandSchema, updateBrandSchema } from './brands.schema';
export type Brand = z.infer<typeof brandSchema>;
export type CreateBrandRequest = z.infer<typeof createBrandSchema>;
export type UpdateBrandRequest = z.infer<typeof updateBrandSchema>;
