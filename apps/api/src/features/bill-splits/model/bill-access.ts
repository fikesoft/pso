import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import type { BillContext } from '@pos/contracts';
export function requireBillAccess(
  access: AccessData,
  actor: string,
  locationId: string,
  context: BillContext,
  total?: string,
) {
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(
    access.service.canUse(actor, 'orders.split', { ...scope, ...(total ? { amount: total } : {}) }),
  );
  if (context.kind === 'VISIT')
    assert(
      access.service.canUse(actor, 'tables.read', scope) &&
        access.service.canUse(actor, 'tables.visits.manage', scope),
    );
}
export function requireBillOrderRead(
  access: AccessData,
  actor: string,
  locationId: string,
  total: string,
) {
  assert(
    access.service.canUse(actor, 'orders.read', {
      ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
      amount: total,
    }),
    403,
    'Accesul la toate comenzile notei este necesar.',
  );
}
