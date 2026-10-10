import type { prepareActiveOrders } from './active-orders-setup';
export type ActiveOrdersFixture = Awaited<ReturnType<typeof prepareActiveOrders>>;
