import type { TenantTransaction } from '@pos/db';
import { assert } from '../../../shared/lib/http';
import { FINALIZE_CONSUMPTION_REASON } from '../config/inventory.constants';
import { movementQuantity, quantityUnits } from './quantities';
import { stockBalances } from './stock-balance';
import type { FinalizeInventoryInput } from './inventory.types';

export async function consumeOrder(tx: TenantTransaction, input: FinalizeInventoryInput) {
  // Historical send-time consumption remains immutable and must never be charged twice.
  const legacy = await tx.inventoryDocument.findFirst({
    where: { orderId: input.orderId, kind: 'CONSUMPTION' },
  });
  if (legacy) return null;
  const untracked = await tx.inventoryLegacyOrder.findUnique({ where: { orderId: input.orderId } });
  if (untracked) return null;
  const reservation = await tx.inventoryReservation.findFirst({
    where: { orderId: input.orderId },
  });
  assert(reservation?.status === 'PENDING', 409, 'Rezervarea de stoc a comenzii lipsește.');
  const lines = await tx.inventoryReservationLine.findMany({
    where: { reservationId: reservation.id },
  });
  const itemIds = [...new Set(lines.map((line) => line.inventoryItemId))].sort();
  if (itemIds.length) {
    await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id=ANY(${itemIds}::uuid[]) ORDER BY id FOR UPDATE`;
  }
  const balances = await stockBalances(tx, input.locationId, itemIds);
  const remaining = new Map(
    itemIds.map((id) => [id, quantityUnits(balances.get(id) ?? '0.000000')]),
  );
  for (const line of lines) {
    const balance = remaining.get(line.inventoryItemId)! - quantityUnits(line.quantity.toFixed(6));
    movementQuantity(balance);
    remaining.set(line.inventoryItemId, balance);
  }
  const document = await tx.inventoryDocument.create({
    data: {
      organizationId: input.organizationId,
      locationId: input.locationId,
      kind: 'CONSUMPTION',
      orderId: input.orderId,
      requestKey: input.requestKey,
      requestHash: input.requestHash,
      reason: FINALIZE_CONSUMPTION_REASON,
      createdByUserId: input.actorUserId,
      actorName: input.actorName,
    },
  });
  if (lines.length) {
    await tx.inventoryMovement.createMany({
      data: lines.map(({ id: _id, reservationId: _reservationId, ...line }) => ({
        ...line,
        documentId: document.id,
        quantity: line.quantity.neg(),
      })),
    });
  }
  await tx.inventoryReservation.update({
    where: { id: reservation.id },
    data: { status: 'CONSUMED', resolvedAt: new Date() },
  });
  return document;
}
