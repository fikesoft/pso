import type { KitchenAlertIdentity } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { scopeFor, visibleLocations } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireAlertAccess(
  access: AccessData,
  actor: string,
  identity: KitchenAlertIdentity,
) {
  const scope = scopeFor(access.org.id, identity.scope);
  assert(access.service.canUse(actor, 'kitchen.alerts.manage', scope));
  if (identity.scope.scopeType === 'LOCATION') {
    const locationId = identity.scope.locationId;
    assert(
      visibleLocations(access, actor).some(
        (row) => row.id === locationId && row.status === 'ACTIVE',
      ),
    );
  }
}

export async function requireAlertTarget(
  tx: TenantTransaction,
  organizationId: string,
  identity: KitchenAlertIdentity,
  active = false,
) {
  const { target, scope } = identity;
  const status = active ? { status: 'ACTIVE' } : {};
  if (target.kind === 'STATION') {
    assert(scope.scopeType === 'LOCATION', 400, 'Stația necesită o locație.');
    assert(
      await tx.kitchenStation.findFirst({
        where: {
          organizationId,
          locationId: scope.locationId,
          id: target.stationId,
          ...status,
        },
      }),
      404,
      'Stația nu există în această locație sau nu este disponibilă.',
    );
  } else if (target.kind === 'CATEGORY') {
    assert(
      await tx.category.findFirst({
        where: {
          organizationId,
          id: target.categoryId,
          ...status,
        },
      }),
      404,
      'Categoria nu există sau nu este disponibilă.',
    );
  } else if (target.kind === 'PRODUCT') {
    assert(
      await tx.product.findFirst({
        where: {
          organizationId,
          id: target.productId,
          ...status,
        },
      }),
      404,
      'Produsul nu există sau nu este disponibil.',
    );
    if (scope.scopeType === 'LOCATION')
      assert(
        await tx.locationProduct.findFirst({
          where: {
            organizationId,
            locationId: scope.locationId,
            productId: target.productId,
          },
        }),
        404,
        'Produsul nu există în această locație.',
      );
  }
}
