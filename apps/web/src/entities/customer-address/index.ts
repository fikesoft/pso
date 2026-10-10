export {
  readCustomerAddresses,
  createCustomerAddress,
  archiveCustomerAddress,
  resolveCustomerAddress,
} from './api/address.api';
export { readAddressBook } from './api/address-management.api';
export { useAddressBookOperation } from './model/use-address-book-operation';
export type { AddressBookAttempt } from './model/address-management.types';
