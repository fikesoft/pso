import type { z } from 'zod';
import type { customerRfmSchema } from './customer-rfm.schema';
export type CustomerRfm = z.infer<typeof customerRfmSchema>;
