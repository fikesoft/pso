import type { TenantTransaction } from '@pos/db';
import type { StoredTicket } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
import type { KitchenQuery } from './kitchen.types';

export async function listActiveTickets(tx: TenantTransaction, query: KitchenQuery) {
  const filtered = query.stationId !== undefined;
  const stationId = query.stationId === 'UNASSIGNED' ? null : (query.stationId ?? null);
  if (stationId) {
    const station = await tx.kitchenStation.findFirst({
      where: { id: stationId, locationId: query.locationId },
      select: { id: true },
    });
    assert(station, 404, 'Stația nu există în această locație.');
  }
  // A completed cursor remains usable because immutable ticket history is retained.
  const cursor = query.cursor
    ? await tx.kitchenTicket.findFirst({
        where: { id: query.cursor, locationId: query.locationId },
        select: { id: true, createdAt: true },
      })
    : null;
  assert(!query.cursor || cursor, 400, 'Cursorul de paginare nu este valid pentru această locație');
  if (cursor && filtered) {
    const batch = await tx.kitchenTicketBatch.findFirst({
      where: { ticketId: cursor.id, locationId: query.locationId, stationId },
      select: { id: true },
    });
    assert(batch, 400, 'Cursorul de paginare nu aparține stației selectate.');
  }
  const status = query.status ?? null;
  const cursorId = cursor?.id ?? null;
  const cursorTime = cursor?.createdAt ?? null;
  // Filter the parent before pagination; post-filtering would hide later live tickets.
  // Both tables retain FORCE RLS and every relationship is joined with tenant+location.
  return tx.$queryRaw<StoredTicket[]>`
    SELECT t.* FROM "KitchenTicket" t
    JOIN "Order" o ON o.id=t."orderId"
      AND o."organizationId"=t."organizationId" AND o."locationId"=t."locationId"
    WHERE t."locationId"=${query.locationId}::uuid AND o.status IN ('OPEN','CONFIRMED','IN_PROGRESS','READY')
      AND ((NOT ${filtered}::boolean AND (${status}::text IS NULL OR public.effective_kitchen_status(t.status)=${status}::text))
        OR (${filtered}::boolean AND EXISTS (
          SELECT 1 FROM "KitchenTicketBatch" b WHERE b."organizationId"=t."organizationId"
            AND b."locationId"=t."locationId" AND b."ticketId"=t.id
            AND b."stationId" IS NOT DISTINCT FROM ${stationId}::uuid
          GROUP BY b."ticketId"
          HAVING ${status}::text IS NULL OR (CASE
            WHEN bool_and(b.status='CANCELLED') THEN 'CANCELLED'
            WHEN bool_and(b.status='READY') THEN 'READY'
            WHEN bool_or(b.status IN ('READY','PARTIALLY_READY')) THEN 'PARTIALLY_READY'
            WHEN bool_or(b.status='PREPARING') THEN 'PREPARING' ELSE 'QUEUED' END)=${status}::text
        )))
      AND (${cursorId}::uuid IS NULL
        OR (t."createdAt",t.id)>(${cursorTime}::timestamptz,${cursorId}::uuid))
    ORDER BY t."createdAt" ASC,t.id ASC LIMIT ${query.limit + 1}`;
}
