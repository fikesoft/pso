import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { runOperationsIsolationTests } from './operations-isolation.cases';
import { runOrderIntegrityTests } from './order-integrity.cases';
import { runKitchenIntegrityTests } from './kitchen-integrity.cases';

test('PostgreSQL real: catalog, comenzi draft și snapshot bucătărie', async (t) => {
  const state = await createOperationsFixture();
  try {
    await runOperationsIsolationTests(t, state);
    await runOrderIntegrityTests(t, state);
    await runKitchenIntegrityTests(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
