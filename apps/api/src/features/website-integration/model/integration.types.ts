import type { TenantTransaction } from '@pos/db';
import type { Request } from 'express';
import type { WebsiteCatalogProduct } from '@pos/contracts';
import type { StoredWebsiteConnection, StoredWebsiteKey } from '../../../entities/website-order';

export interface WebsiteKeyLookup {
  keyId: string;
  organizationId: string;
  locationId: string;
  connectionId: string;
  createdByUserId: string;
  expiresAt: string;
}
export type WebsiteKeyReference = Omit<WebsiteKeyLookup, 'expiresAt'> & { digest: string };
export interface IntegrationContext {
  organizationId: string;
  connection: StoredWebsiteConnection;
  key: StoredWebsiteKey;
  location: NonNullable<Awaited<ReturnType<TenantTransaction['location']['findUnique']>>>;
}
export type IntegrationHandler<T = unknown> = (
  tx: TenantTransaction,
  context: IntegrationContext,
  req: Request,
) => Promise<T>;
export type WebsiteCatalogRow = Omit<
  WebsiteCatalogProduct,
  'unitTotal' | 'imageUrl' | 'modifierGroups'
> & {
  imageAssetId: string | null;
};
