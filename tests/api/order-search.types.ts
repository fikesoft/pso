import type { prepareOrderSearch } from './order-search-setup';
export type OrderSearchFixture = Awaited<ReturnType<typeof prepareOrderSearch>>;
export interface OrderSearchActor {
  pin: string;
  user: { id: string };
}
