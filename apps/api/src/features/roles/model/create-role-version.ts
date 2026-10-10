import type { PermissionEntry } from '@pos/authz';
import type { TenantTransaction } from '@pos/db';
import type { TenantAuthState } from '../../../entities/session';
import { moneyData, PERMISSIONS, scopeFor } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
export const createRoleVersion = async (
  tx: TenantTransaction,
  d: AccessData,
  a: TenantAuthState,
  roleId: string,
  permissions: readonly PermissionEntry[],
) => {
  assert(d.service.canUse(a.user.id, 'roles.manage', scopeFor(d.org.id, {})));
  for (const p of permissions)
    assert(
      PERMISSIONS.some((x) => x.key === p.permission && x.delegable),
      400,
      'Permisiune necunoscută sau rezervată administratorului principal',
    );
  const last = await tx.roleVersion.findFirst({
    where: { roleId },
    orderBy: { version: 'desc' },
  });
  const version = await tx.roleVersion.create({
    data: {
      organizationId: d.org.id,
      roleId,
      version: (last?.version ?? 0) + 1,
      createdByUserId: a.user.id,
    },
  });
  await tx.rolePermission.createMany({
    data: permissions.map((p) => ({
      organizationId: d.org.id,
      roleVersionId: version.id,
      permissionKey: p.permission,
      ...moneyData(p),
    })),
  });
  return { ...version, permissions };
};
