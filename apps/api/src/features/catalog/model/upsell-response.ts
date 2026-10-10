import type { Prisma, TenantTransaction } from '@pos/db';
import type { UpsellRuleDto } from '@pos/contracts';

export async function upsellRuleResponses(
  tx: TenantTransaction,
  rules: readonly Prisma.UpsellRuleGetPayload<Record<string, never>>[],
): Promise<UpsellRuleDto[]> {
  const ids = [...new Set(rules.flatMap((rule) => [rule.sourceProductId, rule.targetProductId]))];
  const products = await tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const names = new Map(products.map((product) => [product.id, product.name]));
  return rules.map((rule) => ({
    id: rule.id,
    locationId: rule.locationId,
    sourceProductId: rule.sourceProductId,
    sourceProductName: names.get(rule.sourceProductId) ?? '',
    targetProductId: rule.targetProductId,
    targetProductName: names.get(rule.targetProductId) ?? '',
    name: rule.name,
    sortOrder: rule.sortOrder,
    status: rule.status as UpsellRuleDto['status'],
    version: rule.version,
  }));
}
