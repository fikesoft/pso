import type { CatalogSearchQuery } from '@pos/contracts';

export interface CatalogCursorContext extends CatalogSearchQuery {
  organizationId: string;
  userId: string;
}
