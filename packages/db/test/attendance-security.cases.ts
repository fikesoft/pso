import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { AttendanceFixture } from './fixtures/attendance.types';

export async function runAttendanceSecurityTests(t: TestContext, state: AttendanceFixture) {
  await t.test('RLS FORCE, actorul propriu și FK tenant/locație protejează pontajul', async () => {
    const policies = await state.runtime.$queryRaw<
      Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>
    >`SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relname IN ('WorkShift','WorkBreak','AttendanceEvent') ORDER BY relname`;
    assert.equal(policies.length, 3);
    assert.ok(policies.every((row) => row.relrowsecurity && row.relforcerowsecurity));
    const start = await state.event();
    await state.event({ action: 'START_BREAK', shiftId: start.shiftId, shiftVersion: 2 });
    for (const read of [
      state.runtime.workShift.findMany(),
      state.runtime.workBreak.findMany(),
      state.runtime.attendanceEvent.findMany(),
      state.txB((tx) => tx.workShift.findMany()),
      state.txB((tx) => tx.workBreak.findMany()),
      state.txB((tx) => tx.attendanceEvent.findMany()),
    ]) {
      assert.deepEqual(await read, []);
    }
    await assert.rejects(state.runtime.attendanceEvent.create({ data: state.data() }));
    await assert.rejects(state.event({ organizationId: state.b.organization.id }));
    await assert.rejects(state.event({ locationId: state.locationB.id }));
    await assert.rejects(state.event({ actorUserId: state.a.user.id }));
    await assert.rejects(state.event({ userId: state.a.user.id }));
    await assert.rejects(
      state.event({
        action: 'END_SHIFT',
        shiftId: start.shiftId,
        shiftVersion: 3,
        locationId: state.locationA2.id,
      }),
    );
    for (const client of [state.auth, state.platform]) {
      await assert.rejects(client.workShift.findMany());
      await assert.rejects(client.workBreak.findMany());
      await assert.rejects(client.attendanceEvent.findMany());
    }
    await state.event({ action: 'END_SHIFT', shiftId: start.shiftId, shiftVersion: 3 });
  });
  await t.test(
    'stările nu pot fi scrise direct, iar evenimentele și timpii rămân imuabili',
    async () => {
      const start = await state.event();
      const shift = await state.txWorker((tx) =>
        tx.workShift.findUniqueOrThrow({ where: { id: start.shiftId } }),
      );
      await assert.rejects(
        state.txWorker((tx) =>
          tx.workShift.create({
            data: { ...shift, id: randomUUID(), roleSnapshot: {}, startRequestKey: randomUUID() },
          }),
        ),
      );
      await assert.rejects(
        state.txWorker((tx) =>
          tx.workShift.update({
            where: { id: shift.id },
            data: { startedAt: new Date('2000-01-01T00:00:00Z') },
          }),
        ),
      );
      await assert.rejects(
        state.txWorker((tx) => tx.workShift.delete({ where: { id: shift.id } })),
      );
      await assert.rejects(
        state.txWorker((tx) =>
          tx.workBreak.create({
            data: {
              organizationId: shift.organizationId,
              locationId: shift.locationId,
              shiftId: shift.id,
              userId: shift.userId,
            },
          }),
        ),
      );
      await assert.rejects(
        state.txWorker((tx) =>
          tx.attendanceEvent.update({
            where: { id: start.id },
            data: { requestHash: 'b'.repeat(64) },
          }),
        ),
      );
      await assert.rejects(
        state.txWorker((tx) => tx.attendanceEvent.delete({ where: { id: start.id } })),
      );
      await state.event({ action: 'END_SHIFT', shiftId: shift.id, shiftVersion: 2 });
    },
  );
  await t.test(
    'profilul opțional păstrează identitatea și codul angajatului este unic în companie',
    async () => {
      const before = await state.txA((tx) =>
        tx.companyUser.findUniqueOrThrow({ where: { id: state.worker.id } }),
      );
      const updated = await state.txA((tx) =>
        tx.companyUser.update({
          where: { id: state.worker.id },
          data: {
            firstName: 'Ana',
            lastName: 'Sintetică',
            phone: '+373 22 111 222',
            email: 'synthetic@example.invalid',
            employeeCode: 'EMP-001',
            hireDate: new Date('2026-01-02T00:00:00Z'),
            version: { increment: 1 },
          },
        }),
      );
      assert.equal(updated.loginNormalized, before.loginNormalized);
      assert.equal(updated.passwordHash, before.passwordHash);
      assert.equal(updated.authVersion, before.authVersion);
      assert.equal(updated.hireDate?.toISOString().slice(0, 10), '2026-01-02');
      await assert.rejects(
        state.txA((tx) =>
          tx.companyUser.update({
            where: { id: state.a.user.id },
            data: { employeeCode: 'EMP-001' },
          }),
        ),
      );
      await state.txB((tx) =>
        tx.companyUser.update({
          where: { id: state.b.user.id },
          data: { employeeCode: 'EMP-001' },
        }),
      );
      await assert.rejects(
        state.txA((tx) =>
          tx.companyUser.update({ where: { id: state.worker.id }, data: { employeeCode: ' ' } }),
        ),
      );
      await assert.rejects(
        state.txA(
          (tx) => tx.$executeRaw`
        UPDATE "CompanyUser" SET "hireDate"='infinity'::date WHERE id=${state.worker.id}::uuid`,
        ),
      );
    },
  );
}
