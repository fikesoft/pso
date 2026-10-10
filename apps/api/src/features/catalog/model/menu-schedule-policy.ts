import {
  MAX_LOCATION_MENU_SCHEDULES,
  MAX_PRODUCT_MENU_SCHEDULES,
} from '@pos/contracts/menu-schedules';
import type { TenantTransaction } from '@pos/db';
import { scopeFor } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireMenuScheduleAccess(
  access: AccessData,
  userId: string,
  locationId: string,
  manage = false,
) {
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(
    access.service.canUse(userId, 'catalog.manage', scope) ||
      (!manage && access.service.canUse(userId, 'catalog.read', scope)),
  );
}

export async function validateScheduleProducts(
  tx: TenantTransaction,
  locationId: string,
  productIds: readonly string[],
  active: boolean,
  exceptId?: string,
) {
  const products = await tx.locationProduct.findMany({
    where: { locationId, productId: { in: [...productIds] } },
  });
  assert(
    products.length === productIds.length,
    400,
    'Configurați produsele în această locație înaintea programului.',
  );
  if (!active) return;
  const schedules = await tx.menuSchedule.findMany({
    where: { locationId, status: 'ACTIVE', ...(exceptId ? { id: { not: exceptId } } : {}) },
  });
  assert(
    schedules.length < MAX_LOCATION_MENU_SCHEDULES,
    409,
    'Locația are deja numărul maxim de programe active.',
  );
  const bindings = await tx.menuScheduleProduct.findMany({
    where: {
      menuScheduleId: { in: schedules.map((schedule) => schedule.id) },
      productId: { in: [...productIds] },
    },
  });
  assert(
    productIds.every(
      (id) =>
        bindings.filter((binding) => binding.productId === id).length < MAX_PRODUCT_MENU_SCHEDULES,
    ),
    409,
    'Un produs are deja numărul maxim de programe active în această locație.',
  );
}

export async function saveScheduleProducts(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  menuScheduleId: string,
  productIds: readonly string[],
) {
  const existing = await tx.menuScheduleProduct.findMany({ where: { menuScheduleId } });
  await tx.menuScheduleProduct.deleteMany({
    where: { menuScheduleId, productId: { notIn: [...productIds] } },
  });
  const retained = new Set(existing.map((binding) => binding.productId));
  const additions = productIds.filter((id) => !retained.has(id)).sort();
  if (additions.length)
    await tx.menuScheduleProduct.createMany({
      data: additions.map((productId) => ({
        organizationId,
        locationId,
        menuScheduleId,
        productId,
      })),
    });
}
