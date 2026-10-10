import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createDatabaseClient, withTenantTransaction } from '../src';
import type { AttendanceFixture, AttendanceInput } from './fixtures/attendance.types';

async function raceAttendance(state: AttendanceFixture, inputs: AttendanceInput[]) {
  const clients = inputs.map(() => createDatabaseClient(process.env.TEST_DATABASE_URL!, 1));
  const backendIds = new Set<number>();
  let release!: () => void;
  let abort!: (error: Error) => void;
  const barrier = new Promise<void>((resolve, reject) => {
    release = resolve;
    abort = reject;
  });
  const timeout = setTimeout(
    () => abort(new Error('Conexiunile concurente nu au ajuns la barieră')),
    5000,
  );
  try {
    const results = await Promise.allSettled(
      clients.map((client, index) =>
        withTenantTransaction(
          client,
          { organizationId: state.a.organization.id, userId: state.worker.id },
          async (tx) => {
            const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
            backendIds.add(rows[0]!.pid);
            if (backendIds.size === clients.length) release();
            await barrier;
            return tx.attendanceEvent.create({ data: inputs[index]! });
          },
        ),
      ),
    );
    assert.equal(backendIds.size, inputs.length);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    return results;
  } finally {
    clearTimeout(timeout);
    release();
    await Promise.all(clients.map((client) => client.$disconnect()));
  }
}

export async function runAttendanceConcurrencyTests(t: TestContext, state: AttendanceFixture) {
  await t.test('două conexiuni nu pot începe ture simultane în locații diferite', async () => {
    await raceAttendance(state, [state.data(), state.data({ locationId: state.locationA2.id })]);
    const active = await state.txWorker((tx) =>
      tx.workShift.findMany({ where: { userId: state.worker.id, status: { not: 'ENDED' } } }),
    );
    assert.equal(active.length, 1);
    assert.equal(active[0]!.version, 1);
    await state.event({
      action: 'END_SHIFT',
      shiftId: active[0]!.id,
      locationId: active[0]!.locationId,
      shiftVersion: 2,
    });
  });
  await t.test('acțiunile concurente pe aceeași versiune aplică exact o tranziție', async () => {
    const start = await state.event();
    await raceAttendance(state, [
      state.data({ action: 'START_BREAK', shiftId: start.shiftId, shiftVersion: 2 }),
      state.data({ action: 'END_SHIFT', shiftId: start.shiftId, shiftVersion: 2 }),
    ]);
    const stored = await state.txWorker(async (tx) => ({
      shift: await tx.workShift.findUniqueOrThrow({ where: { id: start.shiftId } }),
      events: await tx.attendanceEvent.findMany({
        where: { shiftId: start.shiftId },
        orderBy: { shiftVersion: 'asc' },
      }),
      breaks: await tx.workBreak.findMany({ where: { shiftId: start.shiftId } }),
    }));
    assert.equal(stored.shift.version, 2);
    assert.deepEqual(
      stored.events.map((event) => event.shiftVersion),
      [1, 2],
    );
    if (stored.shift.status === 'ON_BREAK') {
      assert.equal(stored.events[1]!.action, 'START_BREAK');
      assert.equal(stored.breaks.length, 1);
      assert.equal(stored.breaks[0]!.endedAt, null);
      await state.event({ action: 'END_SHIFT', shiftId: start.shiftId, shiftVersion: 3 });
    } else {
      assert.equal(stored.shift.status, 'ENDED');
      assert.equal(stored.events[1]!.action, 'END_SHIFT');
      assert.equal(stored.breaks.length, 0);
    }
  });
}
