import type { prepareDelivery } from './delivery-setup';
export type DeliveryFixture = Awaited<ReturnType<typeof prepareDelivery>>;
