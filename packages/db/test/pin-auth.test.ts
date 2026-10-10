import { test } from 'node:test';
import { createPinAuthFixture } from './fixtures/pin-auth.fixture';
import { runPinCredentialTests } from './pin-credentials.cases';
import { runPinSessionTests } from './pin-session.cases';

test('PostgreSQL real: PIN individual, identități privilegiate și sesiuni separate', async (t) => {
  const state = await createPinAuthFixture();
  try {
    await runPinCredentialTests(t, state);
    await runPinSessionTests(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
