import { PERMISSIONS } from '../../../packages/authz/src/index';
import type { TenantTransaction } from '../../../packages/db/src/index';
import {
  hashPassword,
  staffPinLookup,
  temporaryPassword,
} from '../../../apps/api/src/entities/session';
import { loadAuthorization } from '../../../apps/api/src/entities/tenant-access';
import { CUSTOMER_ACCESS, DELEGATION_ACCESS, STAFF_PROFILES } from '../config/staff.constants';
import { seedKey } from './record';
import type { SeedIdentity, SeedRecord } from './seed.types';

export async function createSeedStaff(
  tx: TenantTransaction,
  record: SeedRecord,
  identity: SeedIdentity,
  locationIds: string[],
) {
  const organizationId = identity.organization.id;
  const adminId = identity.user.id;
  const versions: string[] = [];
  for (const [index, profile] of STAFF_PROFILES.entries()) {
    for (const permission of profile.permissions)
      if (!PERMISSIONS.some((p) => p.key === permission))
        throw new Error('Permisiune de seed necunoscută.');
    const roleId = seedKey(record, `role:${index}`);
    const roleVersionId = seedKey(record, `role-version:${index}`);
    await tx.role.create({
      data: { id: roleId, organizationId, name: profile.name, createdByUserId: adminId },
    });
    await tx.roleVersion.create({
      data: { id: roleVersionId, organizationId, roleId, version: 1, createdByUserId: adminId },
    });
    await tx.rolePermission.createMany({
      data: profile.permissions.map((permissionKey) => ({
        organizationId,
        roleVersionId,
        permissionKey,
      })),
    });
    versions.push(roleVersionId);
  }
  const customerRole = await tx.role.create({
    data: { organizationId, name: 'Clienți DEMO · companie', createdByUserId: adminId },
  });
  const customerVersion = await tx.roleVersion.create({
    data: { organizationId, roleId: customerRole.id, version: 1, createdByUserId: adminId },
  });
  await tx.rolePermission.createMany({
    data: CUSTOMER_ACCESS.map((permissionKey) => ({
      organizationId,
      roleVersionId: customerVersion.id,
      permissionKey,
    })),
  });
  for (const user of record.users) {
    const profile = STAFF_PROFILES[user.profile]!;
    const manager = record.users.find((u) => u.location === user.location && u.profile === 0)!;
    const locationId = locationIds[user.location]!;
    const hash = await hashPassword(user.secret);
    await tx.companyUser.create({
      data: {
        id: user.id,
        organizationId,
        loginNormalized: user.login,
        displayName: `${profile.name} · ${user.location + 1}`,
        firstName: 'Persoană DEMO',
        lastName: `${profile.login} ${user.location + 1}`,
        employeeCode: `DEMO-${user.location + 1}-${user.profile + 1}`,
        hireDate: new Date('2026-01-15T00:00:00Z'),
        passwordHash: profile.mfa ? hash : await hashPassword(temporaryPassword()),
        authenticationMethod: profile.mfa ? 'PASSWORD' : 'PIN',
        pinHash: profile.mfa ? null : hash,
        pinLookup: profile.mfa ? null : staffPinLookup(record.companies[0]!.slug, user.secret),
        mustChangePassword: profile.mfa,
        mfaRequired: profile.mfa,
        temporaryPasswordExpiresAt: profile.mfa ? new Date(record.expiresAt) : null,
        activatedAt: profile.mfa ? null : new Date(),
        createdByUserId: adminId,
        managedByUserId: profile.mfa ? adminId : manager.id,
      },
    });
    await tx.userLocationAccess.create({
      data: { organizationId, userId: user.id, locationId, isDefault: true },
    });
    if (profile.mfa) {
      const grantId = seedKey(record, `delegation:${user.location}`);
      await tx.delegationGrant.create({
        data: {
          id: grantId,
          organizationId,
          userId: user.id,
          issuedByUserId: adminId,
          scopeType: 'LOCATION',
          locationId,
        },
      });
      await tx.delegationGrantPermission.createMany({
        data: DELEGATION_ACCESS.map((permissionKey) => ({
          organizationId,
          delegationGrantId: grantId,
          permissionKey,
        })),
      });
    }
    const derived = profile.login === 'chelner';
    await tx.userRoleAssignment.create({
      data: {
        organizationId,
        userId: user.id,
        roleVersionId: versions[user.profile]!,
        scopeType: 'LOCATION',
        locationId,
        issuedByUserId: derived ? manager.id : adminId,
        delegationGrantId: derived ? seedKey(record, `delegation:${user.location}`) : null,
      },
    });
    if (profile.login === 'operator' || profile.login === 'casier')
      await tx.userRoleAssignment.create({
        data: {
          organizationId,
          userId: user.id,
          roleVersionId: customerVersion.id,
          scopeType: 'ORGANIZATION',
          issuedByUserId: adminId,
        },
      });
  }
  const access = await loadAuthorization(tx, organizationId);
  for (const user of record.users) {
    if (!STAFF_PROFILES[user.profile]!.mfa && access.service.requiresMfa(user.id))
      throw new Error('Un lucrător PIN a primit acces privilegiat. Seed anulat.');
    if (STAFF_PROFILES[user.profile]!.login === 'chelner') {
      const manager = record.users.find((u) => u.location === user.location && u.profile === 0)!;
      for (const permission of DELEGATION_ACCESS)
        if (
          !access.service.canGrant(
            manager.id,
            user.id,
            permission,
            { organizationId, scopeType: 'LOCATION', locationId: locationIds[user.location]! },
            {},
          )
        )
          throw new Error('Proveniență de delegare invalidă. Seed anulat.');
    }
  }
}
