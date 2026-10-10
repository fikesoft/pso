import type { prepareOrderCreation } from './order-creation-setup';
export type OrderCreationFixture = Awaited<ReturnType<typeof prepareOrderCreation>>;

export interface OrderCreationActor {
  pin: string;
  user: { id: string };
}
