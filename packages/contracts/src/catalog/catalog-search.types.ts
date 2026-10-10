export interface CatalogSearchQuery {
  locationId: string;
  q?: string;
  categoryId?: string;
  cursor?: string;
  limit?: number;
  includeArchived?: boolean;
}
