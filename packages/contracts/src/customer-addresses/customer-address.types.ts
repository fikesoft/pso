import type { z } from 'zod';
import type {
  customerAddressCreateSchema,
  customerAddressArchiveSchema,
  customerAddressQuerySchema,
  customerAddressCreationResolutionSchema,
} from './customer-address.schema';
import type { CUSTOMER_ADDRESS_STATUSES } from './config/customer-address.constants';
export type CustomerAddressStatus = (typeof CUSTOMER_ADDRESS_STATUSES)[number];
export interface CustomerAddressDto {
  id: string;
  version: number;
  customerId: string;
  status: CustomerAddressStatus;
  label: string | null;
  address: string;
  instructions: string | null;
}
export type CustomerAddressCreateRequest = z.input<typeof customerAddressCreateSchema>;
export type CustomerAddressArchiveRequest = z.input<typeof customerAddressArchiveSchema>;
export type CustomerAddressListRequest = z.input<typeof customerAddressQuerySchema>;
export interface CustomerAddressResponse {
  address: CustomerAddressDto;
}
export interface CustomerAddressListResponse {
  addresses: CustomerAddressDto[];
  nextCursor: string | null;
}
export type CustomerAddressCreationResolutionRequest = z.input<
  typeof customerAddressCreationResolutionSchema
>;
export type CustomerAddressCreationResolutionResponse =
  | { status: 'CREATED'; address: CustomerAddressDto }
  | { status: 'RETIRED'; customerId: string; locationId: string; requestKey: string };
