import type { Prisma } from '@pos/db';
import type { ProductModifierGroupDto, ProductScheduleAvailability } from '@pos/contracts';
import { productInformation } from './product-information';

export function catalogProductResponse(
  product: Prisma.ProductGetPayload<Record<string, never>>,
  locationId: string,
  local?: Prisma.LocationProductGetPayload<Record<string, never>> | null,
  modifierGroups: ProductModifierGroupDto[] = [],
  scheduleAvailability: ProductScheduleAvailability | null = null,
  imageUrl: string | null = null,
) {
  return {
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    sku: product.sku,
    description: product.description,
    taxRate: product.taxRate?.toFixed(4) ?? null,
    ...productInformation(product),
    status: product.status as 'ACTIVE' | 'ARCHIVED',
    version: product.version,
    locationId,
    price: local?.price.toFixed(4) ?? null,
    enabled: local?.enabled ?? false,
    locationVersion: local?.version ?? null,
    imageUrl,
    modifierGroups,
    scheduleAvailability,
  };
}
