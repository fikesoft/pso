import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
import { createRegister, registerData } from './cash-register.fixture';
import type { createSecurityFixture } from './security.fixture';

type SecurityFixture = Awaited<ReturnType<typeof createSecurityFixture>>;

export async function openCashShiftFixture(
  f: SecurityFixture,
  tenant: 'a' | 'b' = 'a',
  locationId = tenant === 'a' ? f.locationA.id : f.locationB.id,
  openingAmount = '1000',
) {
  const identity = f[tenant];
  const transact = tenant === 'a' ? f.txA : f.txB;
  const register = await transact((tx) =>
    createRegister(
      tx,
      registerData(f, {
        organizationId: identity.organization.id,
        locationId,
        createdByUserId: identity.user.id,
        updatedByUserId: identity.user.id,
      }),
    ),
  );
  // OPEN commits independently before any later financial header changes this shift.
  return transact((tx) =>
    openRegisterShiftFixture(tx, register.id, identity.user.id, openingAmount),
  );
}

export async function openRegisterShiftFixture(
  tx: TenantTransaction,
  registerId: string,
  actorUserId: string,
  openingAmount = '1000',
) {
  const register = await tx.cashRegister.findUniqueOrThrow({ where: { id: registerId } });
  const owner = await tx.companyUser.findUniqueOrThrow({ where: { id: actorUserId } });
  const shift = await tx.cashShift.create({
    data: {
      organizationId: register.organizationId,
      locationId: register.locationId,
      registerId,
      ownerUserId: actorUserId,
      registerCode: register.code,
      registerName: register.name,
      ownerDisplayName: owner.displayName,
      openingAmount,
      lastActivityId: randomUUID(),
    },
  });
  await tx.cashOperation.create({
    data: {
      organizationId: shift.organizationId,
      locationId: shift.locationId,
      registerId,
      shiftId: shift.id,
      kind: 'OPEN',
      requestKey: randomUUID(),
      requestHash: 'a'.repeat(64),
      actorUserId,
      cashShiftVersion: 1,
      openingAmount,
    },
  });
  return tx.cashShift.findUniqueOrThrow({ where: { id: shift.id } });
}

export async function closeCashShiftFixture(
  tx: TenantTransaction,
  shiftId: string,
  countedCash: string,
  reason = 'Diferență sintetică',
) {
  const shift = await tx.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
  await tx.cashOperation.create({
    data: {
      organizationId: shift.organizationId,
      locationId: shift.locationId,
      registerId: shift.registerId,
      shiftId,
      kind: 'CLOSE',
      requestKey: randomUUID(),
      requestHash: 'b'.repeat(64),
      actorUserId: shift.ownerUserId,
      expectedVersion: shift.version,
      cashShiftVersion: shift.version + 1,
      countedCash,
      discrepancyReason: reason,
    },
  });
  return tx.cashClosing.findFirstOrThrow({ where: { shiftId } });
}
