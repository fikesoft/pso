import type { Prisma, TenantTransaction } from '@pos/db';
import type { ProductModifierGroupDto, ProductScheduleAvailability } from '@pos/contracts';
import { catalogProductResponse } from '../../../entities/catalog-product';
import { productImageUrl } from '../../../entities/file-assets';
import { assert } from '../../../shared/lib/http';

export function productResponse(
  product: Prisma.ProductGetPayload<Record<string, never>>,
  locationId: string,
  local?: Prisma.LocationProductGetPayload<Record<string, never>> | null,
  modifierGroups: ProductModifierGroupDto[] = [],
  scheduleAvailability: ProductScheduleAvailability | null = null,
) {
  return catalogProductResponse(
    product,
    locationId,
    local,
    modifierGroups,
    scheduleAvailability,
    productImageUrl(product.id, locationId, product.imageAssetId),
  );
}

export function categoryResponse(category: Prisma.CategoryGetPayload<Record<string, never>>) {
  return {
    id: category.id,
    name: category.name,
    sortOrder: category.sortOrder,
    status: category.status,
    version: category.version,
  };
}

export async function requireActiveCategory(tx: TenantTransaction, categoryId?: string | null) {
  if (!categoryId) return;
  const category = await tx.category.findUnique({ where: { id: categoryId } });
  assert(category, 404, 'Categoria nu există');
  assert(category.status === 'ACTIVE', 409, 'Categoria este arhivată');
}
