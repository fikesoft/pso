import type { createJobsFixture } from './jobs.fixture';
export type JobsFixture = Awaited<ReturnType<typeof createJobsFixture>>;
