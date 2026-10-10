import type { TenantTransaction } from '@pos/db';
import type { StockLevel } from './inventory.types';

export async function stockBalance(
  tx: TenantTransaction,
  locationId: string,
  inventoryItemId: string,
) {
  const aggregate = await tx.inventoryMovement.aggregate({
    where: { locationId, inventoryItemId },
    _sum: { quantity: true },
  });
  return aggregate._sum.quantity?.toFixed(6) ?? '0.000000';
}
export async function stockBalances(tx: TenantTransaction, locationId: string, itemIds: string[]) {
  const values = await tx.inventoryMovement.groupBy({
    by: ['inventoryItemId'],
    where: { locationId, inventoryItemId: { in: itemIds } },
    _sum: { quantity: true },
  });
  return new Map(
    values.map((row) => [row.inventoryItemId, row._sum.quantity?.toFixed(6) ?? '0.000000']),
  );
}

// Both quantities share one PostgreSQL statement snapshot, including concurrent checkout.
export async function stockLevels(tx: TenantTransaction, locationId: string, itemIds: string[]) {
  const rows = await tx.$queryRaw<StockLevel[]>`
    SELECT i.id AS "inventoryItemId",
      coalesce((SELECT sum(m.quantity) FROM "InventoryMovement" m
        WHERE m."inventoryItemId"=i.id AND m."organizationId"=i."organizationId"
          AND m."locationId"=${locationId}::uuid),0)::numeric(30,6)::text AS balance,
      coalesce((SELECT sum(l.quantity) FROM "InventoryReservationLine" l
        JOIN "InventoryReservation" r ON r.id=l."reservationId" AND r."organizationId"=l."organizationId"
        WHERE l."inventoryItemId"=i.id AND l."organizationId"=i."organizationId"
          AND l."locationId"=${locationId}::uuid AND r.status='PENDING'),0)::numeric(30,6)::text AS "reservedQuantity"
    FROM "InventoryItem" i WHERE i.id=ANY(${itemIds}::uuid[])`;
  return new Map(rows.map((row) => [row.inventoryItemId, row]));
}
