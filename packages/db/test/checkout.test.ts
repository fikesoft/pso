import { openCashShiftFixture } from './fixtures/cash-shift.fixture';
import { test } from 'node:test';
import { createOperationsFixture } from './fixtures/operations.fixture';
import { runCheckoutAmountTests } from './checkout-amounts.cases';
import { runCheckoutSecurityTests } from './checkout-security.cases';

test('PostgreSQL real: finalizare DEMO, încasare manuală și bon imuabil', async (t) => {
  const state = await createOperationsFixture();
  const cashShift = await openCashShiftFixture(state);
  try {
    await runCheckoutAmountTests(t, state, cashShift.id);
    await runCheckoutSecurityTests(t, state, cashShift.id);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
