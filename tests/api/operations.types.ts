import type { prepareOperations } from './operations-setup';
export type OperationsFixture = Awaited<ReturnType<typeof prepareOperations>>;
