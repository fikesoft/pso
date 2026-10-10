import type { TenantTransaction } from '@pos/db';
import type { FireKitchenCourseInput, KitchenCourseResult } from '@pos/contracts';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import type { StoredTicket } from '../../../entities/order';
import type { StoredCourseCommand } from './course-command.types';

export function courseResult(row: StoredCourseCommand): KitchenCourseResult {
  return {
    ticketId: row.ticketId,
    requestKey: row.requestKey,
    course: row.course === 'ALL' ? 'ALL' : (Number(row.course) as 1 | 2 | 3),
    expectedVersion: row.expectedVersion!,
    version: row.resultVersion!,
    firedAt: row.createdAt.toISOString(),
    batchIds: row.batchIds,
  };
}

export async function readCourseCommand(
  tx: TenantTransaction,
  ticket: StoredTicket,
  actor: string,
  requestKey: string,
) {
  const row = await tx.kitchenCourseCommand.findFirst({
    where: { organizationId: ticket.organizationId, requestKey },
  });
  if (row)
    assert(
      row.actorUserId === actor &&
        row.ticketId === ticket.id &&
        row.locationId === ticket.locationId,
      409,
      'Cheia cererii aparține altei operațiuni.',
    );
  return row;
}

export async function fireCourse(
  tx: TenantTransaction,
  ticket: StoredTicket,
  actor: string,
  body: FireKitchenCourseInput,
) {
  const hash = requestHash({
    organizationId: ticket.organizationId,
    ticketId: ticket.id,
    actor,
    ...body,
  });
  const previous = await readCourseCommand(tx, ticket, actor, body.requestKey);
  if (previous) {
    assert(previous.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
    assert(previous.requestHash === hash, 409, 'Cheia cererii a fost folosită pentru alte date.');
    return { result: courseResult(previous), replayed: true };
  }
  assert(ticket.version === body.version, 409, 'Tichetul a fost modificat. Reîncărcați.');
  const pending = await tx.kitchenTicketBatch.count({
    where: {
      organizationId: ticket.organizationId,
      locationId: ticket.locationId,
      ticketId: ticket.id,
      courseNumber: body.course === 'ALL' ? { not: 0 } : body.course,
      firedAt: null,
      status: 'QUEUED',
    },
  });
  assert(pending > 0, 409, 'Nu există etape în așteptare pentru această lansare.');
  const row = await tx.kitchenCourseCommand.create({
    data: {
      organizationId: ticket.organizationId,
      locationId: ticket.locationId,
      ticketId: ticket.id,
      actorUserId: actor,
      requestKey: body.requestKey,
      status: 'SUCCEEDED',
      requestHash: hash,
      expectedVersion: body.version,
      course: String(body.course),
    },
  });
  return { result: courseResult(row), replayed: false };
}
