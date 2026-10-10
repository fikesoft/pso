import { test } from 'node:test';
import { createAttendanceFixture } from './fixtures/attendance.fixture';
import { runAttendanceLifecycleTests } from './attendance-lifecycle.cases';
import { runAttendanceSecurityTests } from './attendance-security.cases';
import { runAttendanceConcurrencyTests } from './attendance-concurrency.cases';

test('PostgreSQL real: pontaj izolat, timpi server, registru imuabil și concurență', async (t) => {
  const state = await createAttendanceFixture();
  try {
    await runAttendanceLifecycleTests(t, state);
    await runAttendanceSecurityTests(t, state);
    await runAttendanceConcurrencyTests(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
