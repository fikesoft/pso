import type { TenantTransaction } from '@pos/db';
import { INVENTORY_COUNT_STALE } from '@pos/contracts';
import type { Request } from 'express';
import {
  inventoryDocumentResponse,
  inventoryMovementResponse,
  movementQuantity,
  quantityUnits,
  stockBalance,
} from '../../../entities/inventory';
import type { StoredInventoryDocument } from '../../../entities/inventory';
import type { AccessData } from '../../../entities/tenant-access';
import { audit } from '../../../entities/tenant-access';
import type { TenantAuthState } from '../../../shared/lib/http';
import { assert, HttpError } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireInventoryStock } from './inventory-authorization';
import type { InventoryDocumentInput } from './inventory.types';

async function response(
  tx: TenantTransaction,
  stored: StoredInventoryDocument,
  inventoryItemId: string,
) {
  const document = await inventoryDocumentResponse(tx, stored);
  const movements = await tx.inventoryMovement.findMany({
    where: { documentId: stored.id },
    orderBy: { id: 'asc' },
  });
  return {
    document,
    movements: movements.map((movement) => inventoryMovementResponse(movement, document)),
    balance: await stockBalance(tx, stored.locationId, inventoryItemId),
  };
}
export async function createInventoryDocument(
  tx: TenantTransaction,
  access: AccessData,
  auth: TenantAuthState,
  req: Request,
  body: InventoryDocumentInput,
) {
  requireInventoryStock(access, auth.user.id, body.locationId, true);
  const item = await tx.inventoryItem.findUnique({ where: { id: body.inventoryItemId } });
  assert(item, 404, 'Articolul nu există');
  const hash = requestHash(body);
  const previous = await tx.inventoryDocument.findFirst({
    where: { locationId: body.locationId, requestKey: body.requestKey },
  });
  if (previous) {
    assert(
      previous.requestHash === hash && previous.kind === body.kind,
      409,
      'Cheia cererii a fost folosită pentru alte date',
    );
    return response(tx, previous, item.id);
  }
  await tx.$queryRaw`SELECT id FROM "InventoryItem" WHERE id=${item.id}::uuid FOR UPDATE`;
  const balance = await stockBalance(tx, body.locationId, item.id);
  const quantity = quantityUnits(body.quantity);
  if (body.kind === 'COUNT' && quantityUnits(body.expectedQuantity!) !== quantityUnits(balance))
    throw new HttpError(
      409,
      'Stocul s-a schimbat. Reîncărcați înainte de inventariere.',
      INVENTORY_COUNT_STALE,
    );
  const delta =
    body.kind === 'COUNT'
      ? quantity - quantityUnits(balance)
      : body.kind === 'WASTE'
        ? -quantity
        : quantity;
  const movement = movementQuantity(delta);
  movementQuantity(quantityUnits(balance) + delta);
  const document = await tx.inventoryDocument.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      kind: body.kind,
      requestKey: body.requestKey,
      requestHash: hash,
      reason: body.reason,
      createdByUserId: auth.user.id,
      actorName: access.currentUser.displayName,
    },
  });
  await tx.inventoryMovement.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      documentId: document.id,
      inventoryItemId: item.id,
      quantity: movement,
      countedQuantity: body.kind === 'COUNT' ? body.quantity : null,
      itemName: item.name,
      itemSku: item.sku,
      unit: item.unit,
    },
  });
  await audit(
    tx,
    auth,
    req,
    `inventory.${body.kind.toLowerCase()}`,
    'INVENTORY_DOCUMENT',
    document.id,
    body.locationId,
  );
  return response(tx, document, item.id);
}
