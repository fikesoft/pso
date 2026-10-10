import type { TenantActorReference } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import { runtime, withTenantTransaction } from '../../../shared/db';
import { loadAccess, scopeFor } from '../../../entities/tenant-access';

export async function authorizeCatalogSubscription(
  actor: TenantActorReference,
  locationId?: string,
) {
  return withTenantTransaction(
    runtime,
    { organizationId: actor.user.organizationId, userId: actor.user.id },
    async (tx) => {
      const access = await loadAccess(tx, actor);
      if (!locationId) return;
      assert(
        access.locations.some(
          (location) => location.id === locationId && location.status === 'ACTIVE',
        ),
        403,
        'Locație nepermisă',
      );
      const scope = scopeFor(actor.user.organizationId, { scopeType: 'LOCATION', locationId });
      assert(
        ['catalog.read', 'catalog.manage', 'orders.create'].some((permission) =>
          access.service.canUse(actor.user.id, permission, scope),
        ),
        403,
        'Abonament nepermis',
      );
    },
  );
}
