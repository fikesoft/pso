import type { prepareCustomerLookup } from './customer-lookup-setup';
export type CustomerLookupFixture = Awaited<ReturnType<typeof prepareCustomerLookup>>;
export interface CustomerLookupActor {
  pin: string;
  user: { id: string };
}
