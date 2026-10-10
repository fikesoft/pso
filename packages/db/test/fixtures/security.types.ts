import type { createSecurityFixture } from './security.fixture';
export type SecurityFixture = Awaited<ReturnType<typeof createSecurityFixture>>;
