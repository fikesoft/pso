import type { TenantTransaction } from '@pos/db';
import { MAX_LOCATION_UPSELL_RULES } from '@pos/contracts/upsell';
import type { UpsellCandidate } from './upsell-candidates.types';

export async function loadUpsellCandidates(
  tx: TenantTransaction,
  locationId: string,
  cartProductIds: readonly string[],
): Promise<UpsellCandidate[]> {
  if (!cartProductIds.length) return [];
  const rules = await tx.upsellRule.findMany({
    where: {
      locationId,
      status: 'ACTIVE',
      sourceProductId: { in: [...cartProductIds] },
      targetProductId: { notIn: [...cartProductIds] },
    },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    take: MAX_LOCATION_UPSELL_RULES,
  });
  const ids = [...new Set(rules.flatMap((rule) => [rule.sourceProductId, rule.targetProductId]))];
  const [products, locals] = await Promise.all([
    tx.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' } }),
    tx.locationProduct.findMany({ where: { locationId, productId: { in: ids }, enabled: true } }),
  ]);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const localMap = new Map(locals.map((local) => [local.productId, local]));
  const result: UpsellCandidate[] = [];
  for (const rule of rules) {
    const product = productMap.get(rule.targetProductId);
    const local = localMap.get(rule.targetProductId);
    if (
      product &&
      local &&
      productMap.has(rule.sourceProductId) &&
      localMap.has(rule.sourceProductId)
    )
      result.push({ rule, product, local });
  }
  return result;
}
