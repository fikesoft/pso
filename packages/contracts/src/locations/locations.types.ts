import type { z } from 'zod';
import type {
  businessHoursWindowSchema,
  createLocationSchema,
  updateLocationSchema,
} from './locations.schema';
export type BusinessHoursWindow = z.infer<typeof businessHoursWindowSchema>;
export type CreateLocationRequest = z.infer<typeof createLocationSchema>;
export type UpdateLocationRequest = z.infer<typeof updateLocationSchema>;
