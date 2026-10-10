import { randomUUID } from 'node:crypto';
import type {
  TableVisitCommandRequest,
  TableVisitOpenRequest,
  TableVisitCommandIdentity,
} from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { mergeVisit } from './visit-merge';
import { visitEventResponse, visitMemberIds } from '../../../entities/table-visit';
import { HttpError } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { lockTable } from './table-command';
import { readVisit, requireVisitAccess, requireWaiter, visitCloseBlocked } from './visit-access';
import { replayVisit, saveVisitCommand } from './visit-command';
export async function openVisit(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  tableId: string,
  body: TableVisitOpenRequest,
) {
  requireVisitAccess(access, actor, body.locationId);
  const identity: TableVisitCommandIdentity = {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind: 'OPEN',
    tableId,
  };
  const hash = requestHash({ organizationId: access.org.id, actor, tableId, ...body });
  const previous = await replayVisit(tx, actor, identity, hash);
  if (previous) return { ...previous, replayed: true };
  const table = await lockTable(tx, body.locationId, tableId);
  if (table.status !== 'ACTIVE')
    throw new HttpError(409, 'Masa este arhivată.', 'DINING_TABLE_ARCHIVED');
  if (await tx.tableVisit.findFirst({ where: { tableId, status: 'OPEN' } }))
    throw new HttpError(409, 'Masa este deja ocupată.', 'TABLE_VISIT_ALREADY_OPEN');
  const eventId = randomUUID();
  const visit = await tx.tableVisit.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      tableId,
      tableCode: table.code,
      tableName: table.name,
      status: 'OPEN',
      version: 1,
      guestCount: body.guestCount,
      waiterUserId: actor,
      waiterDisplayName: access.currentUser.displayName,
      billRequested: false,
      lastEventId: eventId,
    },
  });
  const event = await tx.tableVisitEvent.create({
    data: {
      id: eventId,
      organizationId: access.org.id,
      locationId: body.locationId,
      visitId: visit.id,
      tableId,
      requestKey: body.requestKey,
      requestHash: hash,
      kind: 'OPEN',
      actorUserId: actor,
      previousVersion: 0,
      resultVersion: 1,
    },
  });
  await saveVisitCommand(tx, access.org.id, actor, identity, { eventId, hash });
  return { event: visitEventResponse(event), replayed: false };
}
export async function mutateVisit(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  visitId: string,
  body: TableVisitCommandRequest,
) {
  requireVisitAccess(access, actor, body.locationId, body.kind === 'WAITER_CHANGED');
  if (body.kind === 'MERGED') return mergeVisit(tx, access, actor, visitId, body);
  const identity: TableVisitCommandIdentity =
    body.kind === 'WAITER_CHANGED'
      ? {
          locationId: body.locationId,
          requestKey: body.requestKey,
          visitId,
          kind: body.kind,
          targetWaiterUserId: body.targetWaiterUserId,
        }
      : body.kind === 'MOVED'
        ? {
            locationId: body.locationId,
            requestKey: body.requestKey,
            visitId,
            kind: body.kind,
            targetTableId: body.targetTableId,
          }
        : { locationId: body.locationId, requestKey: body.requestKey, visitId, kind: body.kind };
  const hash = requestHash({ organizationId: access.org.id, actor, visitId, ...body });
  const previous = await replayVisit(tx, actor, identity, hash);
  if (previous) return { ...previous, replayed: true };
  if (body.kind === 'MOVED') {
    const target = await lockTable(tx, body.locationId, body.targetTableId);
    if (
      target.status !== 'ACTIVE' ||
      (await tx.tableVisit.findFirst({ where: { tableId: target.id, status: 'OPEN' } }))
    )
      throw new HttpError(
        409,
        'Destinația trebuie să fie o masă activă și liberă.',
        'TABLE_MOVE_DESTINATION_UNAVAILABLE',
      );
  }
  const visit = await readVisit(tx, body.locationId, visitId, true);
  if (visit.status !== 'OPEN')
    throw new HttpError(409, 'Vizita este închisă.', 'TABLE_VISIT_NOT_OPEN');
  if (visit.version !== body.version)
    throw new HttpError(
      409,
      'Vizita a fost modificată. Reîncărcați.',
      'TABLE_VISIT_VERSION_CONFLICT',
    );
  if (body.kind === 'WAITER_CHANGED') {
    requireWaiter(access, body.targetWaiterUserId, body.locationId);
    if (body.targetWaiterUserId === visit.waiterUserId)
      throw new HttpError(409, 'Chelnerul este deja desemnat.', 'TABLE_VISIT_NO_CHANGE');
  }
  if (body.kind === 'GUEST_COUNT_CHANGED' && body.guestCount === visit.guestCount)
    throw new HttpError(409, 'Numărul persoanelor nu s-a schimbat.', 'TABLE_VISIT_NO_CHANGE');
  if (
    body.kind === 'CLOSE' &&
    (await visitCloseBlocked(tx, access.org.id, body.locationId, visitId))
  )
    throw new HttpError(
      409,
      'Vizita are comenzi care trebuie încheiate.',
      'TABLE_VISIT_HAS_OPEN_ORDERS',
    );
  if (
    body.kind === 'BILL_REQUESTED' &&
    (visit.billRequested ||
      !(await tx.order.findFirst({
        where: {
          tableVisitId: { in: await visitMemberIds(tx, access.org.id, body.locationId, visitId) },
          status: { not: 'CANCELLED' },
        },
      })))
  )
    throw new HttpError(
      409,
      'Solicitarea notei nu este disponibilă.',
      'TABLE_BILL_REQUEST_UNAVAILABLE',
    );
  if (body.kind === 'BILL_CANCELLED' && !visit.billRequested)
    throw new HttpError(409, 'Nu există o solicitare activă.', 'TABLE_BILL_REQUEST_UNAVAILABLE');
  const event = await tx.tableVisitEvent.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      visitId,
      tableId: visit.tableId,
      requestKey: body.requestKey,
      requestHash: hash,
      kind: body.kind,
      actorUserId: actor,
      previousVersion: body.version,
      resultVersion: body.version + 1,
      guestCount: body.kind === 'GUEST_COUNT_CHANGED' ? body.guestCount : null,
      targetTableId: body.kind === 'MOVED' ? body.targetTableId : null,
      targetWaiterUserId: body.kind === 'WAITER_CHANGED' ? body.targetWaiterUserId : null,
      reason: 'reason' in body ? body.reason : null,
    },
  });
  await saveVisitCommand(tx, access.org.id, actor, identity, { eventId: event.id, hash });
  return { event: visitEventResponse(event), replayed: false };
}
