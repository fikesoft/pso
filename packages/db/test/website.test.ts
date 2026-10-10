import { test } from 'node:test';
import { createWebsiteFixture } from './fixtures/website.fixture';
import { runWebsiteCredentialTests } from './website-credentials.cases';
import { runWebsiteInboxTests } from './website-inbox.cases';
import { runWebsiteAcceptanceTests } from './website-acceptance.cases';

test('PostgreSQL real: chei website izolate, inbox imuabil și acceptare atomică', async (t) => {
  const state = await createWebsiteFixture();
  try {
    await runWebsiteCredentialTests(t, state);
    await runWebsiteInboxTests(t, state);
    await runWebsiteAcceptanceTests(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
    ]);
  }
});
