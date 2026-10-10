import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert, HttpError } from '../../../shared/lib/http';
export function requireOrderVisitAccess(
  access: AccessData,
  actor: string,
  order: { locationId: string; tableVisitId?: string | null },
) {
  if (!order.tableVisitId) return;
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: order.locationId });
  assert(
    access.service.canUse(actor, 'tables.read', scope) &&
      access.service.canUse(actor, 'tables.visits.manage', scope),
  );
}
export async function createOrderVisit(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  body: { locationId: string; tableVisitId?: string },
) {
  if (!body.tableVisitId) return {};
  requireOrderVisitAccess(access, actor, body);
  const visit = await tx.tableVisit.findFirst({
    where: { id: body.tableVisitId, locationId: body.locationId },
  });
  assert(visit, 404, 'Vizita nu există');
  await tx.$executeRaw`SELECT public.prepare_table_visit(${access.org.id}::uuid,${body.locationId}::uuid,${visit.id}::uuid)`;
  const current = await tx.tableVisit.findUniqueOrThrow({ where: { id: visit.id } });
  if (current.status !== 'OPEN')
    throw new HttpError(409, 'Vizita este închisă.', 'TABLE_VISIT_NOT_OPEN');
  return { tableVisitId: current.id, tableLabel: current.tableCode };
}
export function preserveOrderVisit(
  current: { tableVisitId: string | null; tableLabel: string | null },
  body: { serviceType: string; tableLabel?: string },
) {
  if (!current.tableVisitId) return body.tableLabel ?? null;
  if (
    body.serviceType !== 'DINE_IN' ||
    (body.tableLabel !== undefined && body.tableLabel !== current.tableLabel)
  )
    throw new HttpError(
      409,
      'Asocierea comenzii cu masa nu poate fi modificată din ciornă.',
      'TABLE_ORDER_ASSOCIATION_IMMUTABLE',
    );
  return current.tableLabel;
}
