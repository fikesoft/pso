import type { Prisma, TenantTransaction } from '@pos/db';
import type { ModifierGroupSnapshotDto } from '@pos/contracts';

function snapshotFromStored(
  group: Prisma.OrderItemModifierGroupGetPayload<Record<string, never>>,
  options: readonly Prisma.OrderItemModifierGetPayload<Record<string, never>>[],
): ModifierGroupSnapshotDto {
  return {
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
  };
}

export async function loadOrderItemModifierSnapshots(
  tx: TenantTransaction,
  itemIds: readonly string[],
): Promise<Map<string, ModifierGroupSnapshotDto[]>> {
  const ids = [...new Set(itemIds)];
  const result = new Map<string, ModifierGroupSnapshotDto[]>(ids.map((id) => [id, []]));
  if (!ids.length) return result;
  const groups = await tx.orderItemModifierGroup.findMany({
    where: { orderItemId: { in: ids } },
    orderBy: [{ orderItemId: 'asc' }, { position: 'asc' }],
  });
  const options = groups.length
    ? await tx.orderItemModifier.findMany({
        where: { modifierGroupSnapshotId: { in: groups.map((group) => group.id) } },
        orderBy: [{ modifierGroupSnapshotId: 'asc' }, { position: 'asc' }],
      })
    : [];
  for (const group of groups) {
    result.get(group.orderItemId)?.push(snapshotFromStored(group, options));
  }
  return result;
}

export async function createOrderItemModifierSnapshots(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  orderItemId: string,
  snapshots: readonly ModifierGroupSnapshotDto[],
) {
  for (const snapshot of snapshots) {
    const group = await tx.orderItemModifierGroup.create({
      data: {
        organizationId,
        locationId,
        orderItemId,
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
      await tx.orderItemModifier.create({
        data: {
          organizationId,
          locationId,
          orderItemId,
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
