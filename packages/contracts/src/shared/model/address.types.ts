import type { z } from 'zod';
import type { deliveryAddressSchema } from './address.schema';
export type DeliveryAddressInput = z.input<typeof deliveryAddressSchema>;
export interface DeliveryAddress {
  address: string;
  instructions: string | null;
}
export interface AddressReference {
  id: string;
  version: number;
}
