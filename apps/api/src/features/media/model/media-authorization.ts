import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export async function writableAvatar(
  tx: TenantTransaction,
  access: AccessData,
  actorId: string,
  userId: string,
) {
  const user = await tx.companyUser.findUnique({ where: { id: userId } });
  assert(user, 404, 'Utilizatorul nu există');
  assert(actorId === userId || access.service.canManageUser(actorId, userId, 'update'));
  return user;
}

export async function readableAvatar(
  tx: TenantTransaction,
  access: AccessData,
  actorId: string,
  userId: string,
) {
  const user = await tx.companyUser.findUnique({ where: { id: userId } });
  assert(user, 404, 'Utilizatorul nu există');
  assert(actorId === userId || access.service.canManageUser(actorId, userId, 'read'));
  return user;
}

export async function writableProduct(
  tx: TenantTransaction,
  access: AccessData,
  actorId: string,
  productId: string,
) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  assert(product, 404, 'Produsul nu există');
  assert(access.service.canUse(actorId, 'catalog.manage', scopeFor(access.org.id, {})));
  return product;
}

export async function readableProductImage(
  tx: TenantTransaction,
  access: AccessData,
  actorId: string,
  productId: string,
  locationId: string,
) {
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  const canRead = access.service.canUse(actorId, 'catalog.read', scope);
  const canManageLocal = access.service.canUse(actorId, 'catalog.manage', scope);
  assert(canRead || canManageLocal || access.service.canUse(actorId, 'orders.create', scope));
  const product = await tx.product.findUnique({ where: { id: productId } });
  assert(product, 404, 'Produsul nu există');
  if (product.status === 'ARCHIVED') {
    assert(canRead || canManageLocal);
    assert(access.service.canUse(actorId, 'catalog.manage', scopeFor(access.org.id, {})));
  }
  return product;
}
