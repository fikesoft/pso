import type { TenantTransaction } from '@pos/db';
export type StoredWebsiteConnection = NonNullable<
  Awaited<ReturnType<TenantTransaction['websiteConnection']['findUnique']>>
>;
export type StoredWebsiteKey = NonNullable<
  Awaited<ReturnType<TenantTransaction['websiteApiKey']['findUnique']>>
>;
export type StoredWebsiteOrder = NonNullable<
  Awaited<ReturnType<TenantTransaction['websiteOrder']['findUnique']>>
>;
export interface WebsiteDataContext {
  id: string;
  organizationId: string;
  locationId: string;
  connectionId: string;
}
