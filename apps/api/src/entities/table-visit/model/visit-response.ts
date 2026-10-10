import { z } from 'zod';
import type { TableVisitDto, TableVisitEventDto } from '@pos/contracts';
import { TABLE_VISIT_COMMAND_KINDS } from '@pos/contracts';
import type { StoredVisit, StoredVisitEvent } from './visit.types';
const snapshotSchema = z.object({
  id: z.string().uuid(),
  locationId: z.string().uuid(),
  tableId: z.string().uuid(),
  tableCode: z.string(),
  tableName: z.string(),
  status: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  mergedIntoVisitId: z.string().uuid().nullable().optional(),
  version: z.number().int().positive(),
  guestCount: z.number().int().positive(),
  waiterUserId: z.string().uuid(),
  waiterDisplayName: z.string(),
  openedAt: z.coerce.date(),
  closedAt: z.coerce.date().nullable(),
  billRequested: z.boolean(),
  billRequestedAt: z.coerce.date().nullable(),
  billRequestEventId: z.string().uuid().nullable(),
});
export function visitResponse(row: StoredVisit | z.output<typeof snapshotSchema>): TableVisitDto {
  return {
    id: row.id,
    locationId: row.locationId,
    tableId: row.tableId,
    tableCode: row.tableCode,
    tableName: row.tableName,
    status: z.enum(['OPEN', 'CLOSED', 'MERGED']).parse(row.status),
    ...(row.mergedIntoVisitId ? { mergedIntoVisitId: row.mergedIntoVisitId } : {}),
    version: row.version,
    guestCount: row.guestCount,
    waiter: { id: row.waiterUserId, displayName: row.waiterDisplayName },
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    billRequested: row.billRequested,
    billRequestedAt: row.billRequestedAt?.toISOString() ?? null,
    billRequestEventId: row.billRequestEventId,
  };
}
export function visitEventResponse(row: StoredVisitEvent): TableVisitEventDto {
  return {
    id: row.id,
    locationId: row.locationId,
    visitId: row.visitId,
    tableId: row.tableId,
    kind: z.enum(TABLE_VISIT_COMMAND_KINDS).parse(row.kind),
    actor: { id: row.actorUserId, displayName: row.actorDisplayName },
    previousVersion: row.previousVersion,
    result: visitResponse(snapshotSchema.parse(row.resultSnapshot)),
    previousTable:
      row.kind === 'MOVED'
        ? { id: row.tableId, code: row.previousTableCode!, name: row.previousTableName! }
        : null,
    relatedVisitId: row.relatedVisitId,
    previousGuestCount: row.previousGuestCount,
    previousWaiter: row.previousWaiterUserId
      ? { id: row.previousWaiterUserId, displayName: row.previousWaiterDisplayName! }
      : null,
    previousBillRequested: row.previousBillRequested,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}
