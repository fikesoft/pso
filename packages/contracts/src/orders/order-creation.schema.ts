import { z } from 'zod';
import { idSchema } from '../shared';
export const orderCreationResolutionSchema = z
  .object({ locationId: idSchema, requestKey: idSchema })
  .strict();
