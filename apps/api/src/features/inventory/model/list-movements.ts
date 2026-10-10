import type { TenantTransaction } from '@pos/db';
import { inventoryDocumentResponse, inventoryMovementResponse } from '../../../entities/inventory';
import { assert } from '../../../shared/lib/http';
import type { InventoryMovementsQuery, MovementCursor } from './inventory.types';

export async function listInventoryMovements(
  tx: TenantTransaction,
  query: InventoryMovementsQuery,
) {
  if (query.inventoryItemId)
    assert(
      await tx.inventoryItem.findUnique({ where: { id: query.inventoryItemId } }),
      404,
      'Articolul nu există',
    );
  const cursorMovement = query.cursor
    ? await tx.inventoryMovement.findFirst({
        where: {
          id: query.cursor,
          locationId: query.locationId,
          inventoryItemId: query.inventoryItemId,
        },
      })
    : null;
  const cursorDocument = cursorMovement
    ? await tx.inventoryDocument.findUnique({ where: { id: cursorMovement.documentId } })
    : null;
  assert(
    !query.cursor || (cursorDocument && (!query.kind || query.kind === cursorDocument.kind)),
    400,
    'Cursorul nu este valid pentru filtrele selectate',
  );
  const itemId = query.inventoryItemId ?? null;
  const kind = query.kind ?? null;
  const cursorId = cursorMovement?.id ?? null;
  const cursorDocumentId = cursorDocument?.id ?? null;
  const cursorTime = cursorDocument?.createdAt ?? null;
  const rows = await tx.$queryRaw<MovementCursor[]>`
    SELECT m.id,m."documentId",d."createdAt" FROM "InventoryMovement" m
    JOIN "InventoryDocument" d ON d.id=m."documentId" AND d."organizationId"=m."organizationId" AND d."locationId"=m."locationId"
    WHERE m."locationId"=${query.locationId}::uuid
      AND (${itemId}::uuid IS NULL OR m."inventoryItemId"=${itemId}::uuid)
      AND (${kind}::text IS NULL OR d.kind=${kind}::text)
      AND (${cursorId}::uuid IS NULL OR (d."createdAt",d.id)<(${cursorTime}::timestamptz,${cursorDocumentId}::uuid)
        OR (d."createdAt"=${cursorTime}::timestamptz AND d.id=${cursorDocumentId}::uuid AND m.id>${cursorId}::uuid))
    ORDER BY d."createdAt" DESC,d.id DESC,m.id ASC LIMIT ${query.limit + 1}`;
  const page = rows.slice(0, query.limit);
  const movements = await tx.inventoryMovement.findMany({
    where: { id: { in: page.map((row) => row.id) } },
  });
  const documents = await tx.inventoryDocument.findMany({
    where: { id: { in: page.map((row) => row.documentId) } },
  });
  const serialized = await Promise.all(
    documents.map((document) => inventoryDocumentResponse(tx, document)),
  );
  return {
    movements: page.map((row) =>
      inventoryMovementResponse(
        movements.find((entry) => entry.id === row.id)!,
        serialized.find((entry) => entry.id === row.documentId)!,
      ),
    ),
    nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
  };
}
