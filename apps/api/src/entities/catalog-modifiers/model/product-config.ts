import type { TenantTransaction } from '@pos/db';
import type { ProductModifierGroupDto } from '@pos/contracts';
import { modifierGroupDto, productModifierGroupDto } from './modifier-response';

export async function loadProductModifierConfigs(
  tx: TenantTransaction,
  productIds: readonly string[],
): Promise<Map<string, ProductModifierGroupDto[]>> {
  const ids = [...new Set(productIds)];
  const result = new Map<string, ProductModifierGroupDto[]>(ids.map((id) => [id, []]));
  if (!ids.length) return result;
  const bindings = await tx.productModifierGroup.findMany({
    where: { productId: { in: ids }, status: 'ACTIVE' },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  const groupIds = [...new Set(bindings.map((binding) => binding.modifierGroupId))];
  if (!groupIds.length) return result;
  const [groups, options] = await Promise.all([
    tx.modifierGroup.findMany({ where: { id: { in: groupIds }, status: 'ACTIVE' } }),
    tx.modifierOption.findMany({
      where: { modifierGroupId: { in: groupIds }, status: 'ACTIVE' },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const byGroup = new Map(groups.map((group) => [group.id, group]));
  for (const binding of bindings) {
    const group = byGroup.get(binding.modifierGroupId);
    if (!group) continue;
    result.get(binding.productId)?.push(productModifierGroupDto(binding, group, options));
  }
  return result;
}

export async function loadModifierGroups(
  tx: TenantTransaction,
  groups: readonly Awaited<ReturnType<TenantTransaction['modifierGroup']['findMany']>>[number][],
) {
  const options = groups.length
    ? await tx.modifierOption.findMany({
        where: { modifierGroupId: { in: groups.map((group) => group.id) }, status: 'ACTIVE' },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      })
    : [];
  return groups.map((group) => modifierGroupDto(group, options));
}
