import { CATALOG_CURSOR_DOMAIN, CATALOG_FILTER_DOMAIN } from '../config/catalog-search.constants';
import { idSchema } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { openJson, sealJson, domainHmac } from '../../../shared/lib/sealed-json';
import { assert, HttpError } from '../../../shared/lib/http';
import type { CatalogCursorContext } from './catalog-search.types';

function associated(context: CatalogCursorContext) {
  return [
    context.organizationId,
    context.locationId,
    context.userId,
    domainHmac(
      CATALOG_FILTER_DOMAIN,
      JSON.stringify({
        q: context.q ?? null,
        categoryId: context.categoryId ?? null,
        includeArchived: context.includeArchived ?? false,
      }),
    ),
  ];
}
export function encodeCatalogCursor(context: CatalogCursorContext, id: string) {
  return sealJson(CATALOG_CURSOR_DOMAIN, associated(context), id);
}
export async function readCatalogCursor(tx: TenantTransaction, context: CatalogCursorContext) {
  if (!context.cursor) return undefined;
  if (idSchema.safeParse(context.cursor).success) {
    assert(
      !context.q && !context.categoryId,
      400,
      'Căutarea necesită cursorul emis pentru aceleași filtre.',
    );
    const anchor = await tx.product.findFirst({
      where: {
        id: context.cursor,
        organizationId: context.organizationId,
        ...(!context.includeArchived ? { status: 'ACTIVE' } : {}),
      },
      select: { id: true },
    });
    assert(anchor, 400, 'Cursorul nu aparține catalogului curent.');
    return anchor.id;
  }
  try {
    return idSchema.parse(openJson(CATALOG_CURSOR_DOMAIN, associated(context), context.cursor));
  } catch {
    throw new HttpError(400, 'Cursorul de catalog nu este valid pentru această căutare.');
  }
}
