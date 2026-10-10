import type { TenantTransaction } from '@pos/db';
import { catalogProductIdsQuery, catalogSearchFilter } from './catalog-search-filter';
import { encodeCatalogCursor, readCatalogCursor } from './catalog-search-cursor';
import type { CatalogCursorContext } from './catalog-search.types';

export async function readCatalogPage(tx: TenantTransaction, context: CatalogCursorContext) {
  const after = await readCatalogCursor(tx, context);
  const identifiers = await tx.$queryRaw<Array<{ id: string }>>(
    catalogProductIdsQuery(context.organizationId, context, after),
  );
  const page = identifiers.slice(0, context.limit ?? 50);
  // Recheck current archive/category visibility during hydration; concurrent changes may make a sparse page.
  const products = await tx.product.findMany({
    where: {
      ...catalogSearchFilter(context.organizationId, context),
      id: { in: page.map((row) => row.id) },
    },
    orderBy: { id: 'asc' },
  });
  return {
    products,
    nextCursor:
      identifiers.length > page.length ? encodeCatalogCursor(context, page.at(-1)!.id) : null,
  };
}
