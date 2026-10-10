import type { AddressReference, DeliveryAddressInput } from '@pos/contracts';
import type { StoredOrder } from '../../../entities/order';
export type AddressOrderContext = Pick<StoredOrder, 'id' | 'organizationId' | 'locationId'> &
  Partial<Pick<StoredOrder, 'customerId' | 'customerAddressId' | 'deliveryAddressEncrypted'>>;
export interface AddressOrderInput {
  serviceType: string;
  deliveryAddress?: DeliveryAddressInput | null;
  addressRef?: AddressReference | null;
}
