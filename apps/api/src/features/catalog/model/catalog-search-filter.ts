import { Prisma } from '@pos/db';
import type { CatalogSearchQuery } from '@pos/contracts';

export function literalCatalogPattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}
export function catalogSearchFilter(
  organizationId: string,
  query: CatalogSearchQuery,
  after?: string,
): Prisma.ProductWhereInput {
  return {
    organizationId,
    ...(!query.includeArchived ? { status: 'ACTIVE' } : {}),
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(after ? { id: { gt: after } } : {}),
  };
}

/** The named deterministic ICU collation makes case handling independent of database lc_ctype. */
export function catalogProductIdsQuery(
  organizationId: string,
  query: CatalogSearchQuery,
  after?: string,
) {
  const pattern = `%${literalCatalogPattern(query.q ?? '')}%`;
  return Prisma.sql`SELECT id FROM "Product"
    WHERE "organizationId"=${organizationId}::uuid
      ${!query.includeArchived ? Prisma.sql`AND status='ACTIVE'` : Prisma.empty}
      ${query.categoryId ? Prisma.sql`AND "categoryId"=${query.categoryId}::uuid` : Prisma.empty}
      ${after ? Prisma.sql`AND id>${after}::uuid` : Prisma.empty}
      ${query.q ? Prisma.sql`AND (name COLLATE public.pos_catalog_search ILIKE ${pattern} OR sku COLLATE public.pos_catalog_search ILIKE ${pattern})` : Prisma.empty}
    ORDER BY id ASC LIMIT ${(query.limit ?? 50) + 1}`;
}
