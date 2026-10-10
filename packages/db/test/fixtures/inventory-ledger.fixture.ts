import { createHash, randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src/index';
import type { InventoryFixture, InventoryFixtureItem } from './inventory.types';

export async function inventoryDocumentData(
  tx: TenantTransaction,
  state: InventoryFixture,
  kind: string,
) {
  const actor = await tx.companyUser.findUniqueOrThrow({ where: { id: state.a.user.id } });
  return {
    organizationId: state.a.organization.id,
    locationId: state.locationA.id,
    kind,
    requestKey: randomUUID(),
    requestHash: createHash('sha256').update(randomUUID()).digest('hex'),
    reason: 'Operațiune sintetică pentru test',
    createdByUserId: actor.id,
    actorName: actor.displayName,
  };
}

export function inventoryMovementData(
  state: InventoryFixture,
  item: InventoryFixtureItem,
  documentId: string,
  quantity: string,
) {
  return {
    organizationId: state.a.organization.id,
    locationId: state.locationA.id,
    documentId,
    inventoryItemId: item.id,
    quantity,
    itemName: item.name,
    itemSku: item.sku,
    unit: item.unit,
  };
}

export async function writeInventoryMovement(
  state: InventoryFixture,
  item: InventoryFixtureItem,
  kind: string,
  quantity: string,
  overrides: Partial<Prisma.InventoryMovementUncheckedCreateInput> = {},
) {
  return state.txA(async (tx) => {
    const document = await tx.inventoryDocument.create({
      data: await inventoryDocumentData(tx, state, kind),
    });
    const movement = await tx.inventoryMovement.create({
      data: {
        ...inventoryMovementData(state, item, document.id, quantity),
        ...overrides,
      },
    });
    return { document, movement };
  });
}
