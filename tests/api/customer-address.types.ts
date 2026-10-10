import type { prepareCustomerAddresses } from './customer-address-setup';
export type CustomerAddressFixture = Awaited<ReturnType<typeof prepareCustomerAddresses>>;
