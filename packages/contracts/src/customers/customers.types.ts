import type { z } from 'zod';
import type { createCustomerSchema, customerLookupSchema } from './customers.schema';
export interface CustomerDto {
  id: string;
  version: number;
  name: string | null;
  phone: string;
}
export type CustomerLookupRequest = z.input<typeof customerLookupSchema>;
export interface CustomerLookupResponse {
  customer: CustomerDto | null;
}
export type CustomerCreateRequest = z.input<typeof createCustomerSchema>;
export interface CustomerCreateResponse {
  customer: CustomerDto;
}
