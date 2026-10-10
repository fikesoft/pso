import type { z } from 'zod';
import type { CustomerDto } from './customers.types';
import type {
  customerManagementCommandSchema,
  customerManagementListSchema,
  customerManagementProfileSchema,
  customerManagementResolutionSchema,
  customerManagementResultSchema,
  customerManagementSearchSchema,
} from './customer-management.schema';

export interface CustomerManagementDto extends CustomerDto {
  email: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}
export type CustomerManagementProfile = z.infer<typeof customerManagementProfileSchema>;
export type CustomerManagementCommand = z.infer<typeof customerManagementCommandSchema>;
export type CustomerManagementResolution = z.infer<typeof customerManagementResolutionSchema>;
export type CustomerManagementList = z.infer<typeof customerManagementListSchema>;
export type CustomerManagementSearch = z.infer<typeof customerManagementSearchSchema>;
export type CustomerManagementResult = z.infer<typeof customerManagementResultSchema>;
export interface CustomerManagementListResponse {
  customers: CustomerManagementDto[];
  nextCursor: string | null;
}
export type CustomerManagementCommandResponse =
  | { status: 'SUCCEEDED'; result: CustomerManagementResult; customer: CustomerManagementDto }
  | { status: 'RETIRED'; result: null; customer: CustomerManagementDto };
