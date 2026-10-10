import type { TenantTransaction } from '@pos/db';
import { MAX_LOCATION_UPSELL_RULES, MAX_SOURCE_UPSELL_RULES } from '@pos/contracts/upsell';
import { scopeFor } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireUpsellAccess(
  access: AccessData,
  userId: string,
  locationId: string,
  manage = false,
) {
  assert(
    access.locations.some((location) => location.id === locationId && location.status === 'ACTIVE'),
    403,
    'Locație nepermisă',
  );
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(
    access.service.canUse(userId, 'catalog.manage', scope) ||
      (!manage && access.service.canUse(userId, 'catalog.read', scope)),
  );
}
export async function validateUpsellRule(
  tx: TenantTransaction,
  locationId: string,
  sourceProductId: string,
  targetProductId: string,
  exceptId?: string,
) {
  const productIds = [sourceProductId, targetProductId];
  const [local, products, rules] = await Promise.all([
    tx.locationProduct.count({ where: { locationId, productId: { in: productIds } } }),
    tx.product.count({ where: { id: { in: productIds }, status: 'ACTIVE' } }),
    tx.upsellRule.findMany({
      where: { locationId, status: 'ACTIVE', ...(exceptId ? { id: { not: exceptId } } : {}) },
    }),
  ]);
  assert(
    local === 2 && products === 2,
    400,
    'Alegeți două produse active configurate în această locație.',
  );
  assert(rules.length < MAX_LOCATION_UPSELL_RULES, 409, 'Locația a atins limita regulilor active.');
  const sourceRules = rules.filter((rule) => rule.sourceProductId === sourceProductId);
  assert(
    sourceRules.length < MAX_SOURCE_UPSELL_RULES,
    409,
    'Produsul are deja numărul maxim de recomandări.',
  );
  assert(
    !sourceRules.some((rule) => rule.targetProductId === targetProductId),
    409,
    'Recomandarea există deja pentru acest produs.',
  );
}
