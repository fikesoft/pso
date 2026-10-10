import { randomUUID } from 'node:crypto';
import { withTenantTransaction } from '../../src';
import { createSecurityFixture } from './security.fixture';
import type { AttendanceOverrides } from './attendance.types';

export async function createAttendanceFixture() {
  const state = await createSecurityFixture();
  const profile = await state.txA(async (tx) => {
    const worker = await tx.companyUser.create({
      data: {
        organizationId: state.a.organization.id,
        loginNormalized: 'attendance-worker',
        displayName: 'Lucrător pontaj sintetic',
        passwordHash: '$argon2id$test-fixture-not-a-login-hash',
        createdByUserId: state.a.user.id,
      },
    });
    await tx.userLocationAccess.createMany({
      data: [state.locationA.id, state.locationA2.id].map((locationId) => ({
        organizationId: state.a.organization.id,
        userId: worker.id,
        locationId,
      })),
    });
    const role = await tx.role.create({
      data: {
        organizationId: state.a.organization.id,
        name: 'Chelner sintetic',
        createdByUserId: state.a.user.id,
      },
    });
    const version = await tx.roleVersion.create({
      data: {
        organizationId: state.a.organization.id,
        roleId: role.id,
        version: 1,
        createdByUserId: state.a.user.id,
      },
    });
    await tx.rolePermission.create({
      data: {
        organizationId: state.a.organization.id,
        roleVersionId: version.id,
        permissionKey: 'attendance.clock',
      },
    });
    const assignments = await Promise.all(
      [state.locationA.id, state.locationA2.id].map((locationId) =>
        tx.userRoleAssignment.create({
          data: {
            organizationId: state.a.organization.id,
            userId: worker.id,
            roleVersionId: version.id,
            scopeType: 'LOCATION',
            locationId,
            issuedByUserId: state.a.user.id,
          },
        }),
      ),
    );
    return { worker, role, roleVersion: version, assignments };
  });
  const txWorker = <T>(fn: Parameters<typeof withTenantTransaction<T>>[2]) =>
    withTenantTransaction(
      state.runtime,
      { organizationId: state.a.organization.id, userId: profile.worker.id },
      fn,
    );
  const data = (overrides: AttendanceOverrides = {}) => ({
    id: randomUUID(),
    organizationId: state.a.organization.id,
    locationId: state.locationA.id,
    shiftId: randomUUID(),
    userId: profile.worker.id,
    actorUserId: profile.worker.id,
    action: 'START_SHIFT',
    requestKey: randomUUID(),
    requestHash: 'a'.repeat(64),
    shiftVersion: 1,
    ...overrides,
  });
  const event = (overrides: AttendanceOverrides = {}) =>
    txWorker((tx) => tx.attendanceEvent.create({ data: data(overrides) }));
  return { ...state, ...profile, txWorker, data, event };
}
