import type { TenantTransaction } from '@pos/db';
import type { ModifierGroupSnapshotDto } from '@pos/contracts';

export async function loadWebsiteOrderItemModifierSnapshots(
  tx: TenantTransaction,
  itemIds: readonly string[],
): Promise<Map<string, ModifierGroupSnapshotDto[]>> {
  const ids = [...new Set(itemIds)];
  const result = new Map<string, ModifierGroupSnapshotDto[]>(ids.map((id) => [id, []]));
  if (!ids.length) return result;
  const groups = await tx.websiteOrderItemModifierGroup.findMany({
    where: { websiteOrderItemId: { in: ids } },
    orderBy: [{ websiteOrderItemId: 'asc' }, { position: 'asc' }],
  });
  const options = groups.length
    ? await tx.websiteOrderItemModifier.findMany({
        where: { modifierGroupSnapshotId: { in: groups.map((group) => group.id) } },
        orderBy: [{ modifierGroupSnapshotId: 'asc' }, { position: 'asc' }],
      })
    : [];
  for (const group of groups) {
    result.get(group.websiteOrderItemId)?.push({
      bindingId: group.productModifierGroupId,
      groupId: group.modifierGroupId,
      groupName: group.groupName,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      groupVersion: group.groupVersion,
      bindingVersion: group.bindingVersion,
      position: group.position,
      options: options
        .filter((option) => option.modifierGroupSnapshotId === group.id)
        .map((option) => ({
          optionId: option.modifierOptionId,
          optionName: option.optionName,
          extraPrice: option.extraPrice.toFixed(4),
          optionVersion: option.optionVersion,
          position: option.position,
        })),
    });
  }
  return result;
}

export async function createWebsiteOrderItemModifierSnapshots(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  websiteOrderItemId: string,
  snapshots: readonly ModifierGroupSnapshotDto[],
) {
  for (const snapshot of snapshots) {
    const group = await tx.websiteOrderItemModifierGroup.create({
      data: {
        organizationId,
        locationId,
        websiteOrderItemId,
        productModifierGroupId: snapshot.bindingId,
        modifierGroupId: snapshot.groupId,
        groupName: snapshot.groupName,
        minSelections: snapshot.minSelections,
        maxSelections: snapshot.maxSelections,
        groupVersion: snapshot.groupVersion,
        bindingVersion: snapshot.bindingVersion,
        position: snapshot.position,
      },
    });
    for (const option of snapshot.options) {
      await tx.websiteOrderItemModifier.create({
        data: {
          organizationId,
          locationId,
          websiteOrderItemId,
          modifierGroupSnapshotId: group.id,
          modifierGroupId: snapshot.groupId,
          modifierOptionId: option.optionId,
          optionName: option.optionName,
          extraPrice: option.extraPrice,
          optionVersion: option.optionVersion,
          position: option.position,
        },
      });
    }
  }
}
