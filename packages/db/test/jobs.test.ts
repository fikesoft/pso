import { test } from 'node:test';
import { createJobsFixture } from './fixtures/jobs.fixture';
import { jobsSecurityCases } from './jobs-security.cases';
import { jobsLifecycleCases } from './jobs-lifecycle.cases';

test('PostgreSQL real: coadă persistentă, izolare, lease și recuperare', async (t) => {
  const state = await createJobsFixture();
  try {
    await jobsSecurityCases(t, state);
    await jobsLifecycleCases(t, state);
  } finally {
    await Promise.all([
      state.runtime.$disconnect(),
      state.platform.$disconnect(),
      state.auth.$disconnect(),
      state.worker.$disconnect(),
    ]);
  }
});
