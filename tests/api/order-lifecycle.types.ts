import type { prepareOrderLifecycle } from './order-lifecycle-setup';
export type OrderLifecycleFixture = Awaited<ReturnType<typeof prepareOrderLifecycle>>;
