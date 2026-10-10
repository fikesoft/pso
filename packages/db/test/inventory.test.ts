import { test } from 'node:test';
import { runInventoryLegacyTests } from './inventory-legacy.cases';
import { createInventoryFixture } from './fixtures/inventory.fixture';
import { runInventoryRecipeTests } from './inventory-recipe.cases';
import { runInventoryLedgerTests } from './inventory-ledger.cases';
import { runInventoryConsumptionTests } from './inventory-consumption.cases';
import { runInventoryLifecycleTests } from './inventory-lifecycle.cases';

test('PostgreSQL real: inventar, rețete imuabile și rezervare la trimitere și consum exact la finalizare', async (t) => {
  const state = await createInventoryFixture();
  try {
    await runInventoryRecipeTests(t, state);
    await runInventoryLedgerTests(t, state);
    await runInventoryConsumptionTests(t, state);
    await runInventoryLifecycleTests(t, state);
    await runInventoryLegacyTests(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
