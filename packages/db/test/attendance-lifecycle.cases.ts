import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import type { AttendanceFixture } from './fixtures/attendance.types';

export async function runAttendanceLifecycleTests(t: TestContext, state: AttendanceFixture) {
  await t.test(
    'ora serverului, snapshotul rolului și pauzele produc istoric exact, fără rescriere',
    async () => {
      const earliest = Date.now();
      const start = await state.event({ createdAt: new Date('2000-01-01T00:00:00Z') });
      const original = await state.txWorker((tx) =>
        tx.workShift.findUniqueOrThrow({ where: { id: start.shiftId } }),
      );
      assert.ok(start.createdAt.getTime() >= earliest);
      assert.equal(original.startedAt.getTime(), start.createdAt.getTime());
      assert.equal(original.status, 'ACTIVE');
      assert.equal(original.startRequestKey, start.requestKey);
      assert.deepEqual(original.roleSnapshot, {
        isPrimaryAdmin: false,
        assignments: [
          {
            assignmentId: state.assignments[0]!.id,
            roleId: state.role.id,
            roleVersionId: state.roleVersion.id,
            roleName: state.role.name,
            roleVersion: 1,
            scopeType: 'LOCATION',
            locationId: state.locationA.id,
          },
        ],
      });
      await state.txA((tx) =>
        tx.role.update({
          where: { id: state.role.id },
          data: { name: 'Denumire ulterioară', version: { increment: 1 } },
        }),
      );
      await assert.rejects(
        state.event({ action: 'END_BREAK', shiftId: start.shiftId, shiftVersion: 2 }),
        /invalid attendance transition/,
      );
      const pause = await state.event({
        action: 'START_BREAK',
        shiftId: start.shiftId,
        shiftVersion: 2,
      });
      await assert.rejects(
        state.event({ action: 'START_BREAK', shiftId: start.shiftId, shiftVersion: 3 }),
        /invalid attendance transition/,
      );
      const resumed = await state.event({
        action: 'END_BREAK',
        shiftId: start.shiftId,
        shiftVersion: 3,
      });
      const secondPause = await state.event({
        action: 'START_BREAK',
        shiftId: start.shiftId,
        shiftVersion: 4,
      });
      const end = await state.event({
        action: 'END_SHIFT',
        shiftId: start.shiftId,
        shiftVersion: 5,
        createdAt: new Date('2100-01-01T00:00:00Z'),
      });
      const stored = await state.txWorker(async (tx) => ({
        shift: await tx.workShift.findUniqueOrThrow({ where: { id: start.shiftId } }),
        breaks: await tx.workBreak.findMany({
          where: { shiftId: start.shiftId },
          orderBy: { startedAt: 'asc' },
        }),
        events: await tx.attendanceEvent.findMany({
          where: { shiftId: start.shiftId },
          orderBy: { shiftVersion: 'asc' },
        }),
      }));
      assert.equal(stored.shift.status, 'ENDED');
      assert.equal(stored.shift.version, 5);
      assert.equal(stored.shift.endedAt?.getTime(), end.createdAt.getTime());
      assert.deepEqual(stored.shift.roleSnapshot, original.roleSnapshot);
      assert.equal(stored.breaks.length, 2);
      assert.equal(stored.breaks[0]!.startedAt.getTime(), pause.createdAt.getTime());
      assert.equal(stored.breaks[0]!.endedAt?.getTime(), resumed.createdAt.getTime());
      assert.equal(stored.breaks[1]!.startedAt.getTime(), secondPause.createdAt.getTime());
      assert.equal(stored.breaks[1]!.endedAt?.getTime(), end.createdAt.getTime());
      assert.deepEqual(
        stored.events.map((event) => event.shiftVersion),
        [1, 2, 3, 4, 5],
      );
      assert.ok(end.createdAt.getTime() <= Date.now() + 1);
      for (const pauseRow of stored.breaks) {
        assert.ok(pauseRow.endedAt!.getTime() >= pauseRow.startedAt.getTime());
      }
      await assert.rejects(
        state.event({ action: 'END_SHIFT', shiftId: start.shiftId, shiftVersion: 6 }),
        /active shift/,
      );
      await assert.rejects(state.event({ requestKey: start.requestKey }));
      assert.equal(
        await state.txWorker((tx) => tx.workShift.count({ where: { status: { not: 'ENDED' } } })),
        0,
      );
    },
  );
  await t.test(
    'rollbackul și ON CONFLICT nu pot lăsa o tranziție fără evenimentul ei',
    async () => {
      const start = await state.event();
      await assert.rejects(
        state.txWorker(async (tx) => {
          await tx.attendanceEvent.create({
            data: state.data({ action: 'START_BREAK', shiftId: start.shiftId, shiftVersion: 2 }),
          });
          throw new Error('Rollback după pauză');
        }),
        /Rollback după pauză/,
      );
      const requestKey = randomUUID();
      await assert.rejects(
        state.txWorker(
          (tx) => tx.$executeRaw`
        INSERT INTO "AttendanceEvent" (id,"organizationId","locationId","shiftId","userId",
          "actorUserId",action,"requestKey","requestHash","shiftVersion") VALUES
        (${start.id}::uuid,${start.organizationId}::uuid,${start.locationId}::uuid,
          ${start.shiftId}::uuid,${start.userId}::uuid,${start.actorUserId}::uuid,
          'START_BREAK',${requestKey}::uuid,${'b'.repeat(64)},2)
        ON CONFLICT (id) DO NOTHING`,
        ),
        /each attendance transition requires/,
      );
      const stored = await state.txWorker(async (tx) => ({
        shift: await tx.workShift.findUniqueOrThrow({ where: { id: start.shiftId } }),
        breaks: await tx.workBreak.count({ where: { shiftId: start.shiftId } }),
        events: await tx.attendanceEvent.count({ where: { shiftId: start.shiftId } }),
      }));
      assert.equal(stored.shift.status, 'ACTIVE');
      assert.equal(stored.shift.version, 1);
      assert.equal(stored.breaks, 0);
      assert.equal(stored.events, 1);
      await state.event({ action: 'END_SHIFT', shiftId: start.shiftId, shiftVersion: 2 });
    },
  );
}
