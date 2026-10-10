import type { z } from 'zod';
import type { websiteDeliveryOrderSchema } from './website-delivery.schema';

export type WebsiteDeliveryOrder = z.infer<typeof websiteDeliveryOrderSchema>;
