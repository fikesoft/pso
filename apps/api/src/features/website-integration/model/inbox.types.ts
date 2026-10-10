import type { z } from 'zod';
import type { websiteInboxQuerySchema } from '@pos/contracts';
export type WebsiteInboxQuery = z.infer<typeof websiteInboxQuerySchema>;
