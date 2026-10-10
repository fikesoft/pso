import { test } from 'node:test';
import { createSecurityFixture } from './fixtures/security.fixture';
import { runIsolationTests } from './isolation.cases';
import { runHistoryTests } from './history.cases';

test('PostgreSQL real: RLS, integritate cross-tenant, bootstrap restrâns și istoric imuabil', async (t) => {
  const state = await createSecurityFixture();
  try {
    await runIsolationTests(t, state);
    await runHistoryTests(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
