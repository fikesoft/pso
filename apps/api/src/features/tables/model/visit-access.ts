import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert, HttpError } from '../../../shared/lib/http';
import { requireTableAccess } from './table-access';
export function canVisit(access: AccessData, actor: string, locationId: string, assign = false) {
  return access.service.canUse(
    actor,
    assign ? 'tables.visits.assign' : 'tables.visits.manage',
    scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
  );
}
export function requireVisitAccess(
  access: AccessData,
  actor: string,
  locationId: string,
  assign = false,
) {
  requireTableAccess(access, actor, locationId);
  assert(canVisit(access, actor, locationId, assign));
}
export async function readVisit(
  tx: TenantTransaction,
  locationId: string,
  id: string,
  lock = false,
) {
  const found = await tx.tableVisit.findFirst({ where: { id, locationId } });
  assert(found, 404, 'Vizita nu există');
  if (!lock) return found;
  await tx.$executeRaw`SELECT public.prepare_table_visit(${found.organizationId}::uuid,${locationId}::uuid,${id}::uuid)`;
  return tx.tableVisit.findUniqueOrThrow({ where: { id } });
}
export function waiterEligible(access: AccessData, id: string, locationId: string) {
  const user = access.users.find((row) => row.id === id);
  return (
    !!user &&
    user.status === 'ACTIVE' &&
    (id === access.org.primaryAdminUserId ||
      !!access.snapshot.users.find((row) => row.id === id)?.locationIds.includes(locationId))
  );
}
export function requireWaiter(access: AccessData, id: string, locationId: string) {
  if (!waiterEligible(access, id, locationId))
    throw new HttpError(
      409,
      'Chelnerul nu mai este disponibil în locație.',
      'TABLE_WAITER_NOT_ELIGIBLE',
    );
}
export async function visitCloseBlocked(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  id: string,
) {
  const [row] = await tx.$queryRaw<
    Array<{ blocked: boolean }>
  >`SELECT public.table_visit_close_blocked(${organizationId}::uuid,${locationId}::uuid,${id}::uuid) AS blocked`;
  return row!.blocked;
}
