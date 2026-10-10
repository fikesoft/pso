import type { z } from 'zod';
import type {
  addressManagementProfileSchema,
  addressManagementCommandSchema,
  addressManagementResolutionSchema,
  addressManagementIdentitySchema,
  addressManagementPreferenceSchema,
  addressManagementDtoSchema,
  addressManagementQuerySchema,
  addressManagementListResponseSchema,
  addressManagementResultSchema,
  addressManagementCommandResponseSchema,
} from './address-management.schema';
export type AddressManagementProfile = z.infer<typeof addressManagementProfileSchema>;
export type AddressManagementCommand = z.infer<typeof addressManagementCommandSchema>;
export type AddressManagementResolution = z.infer<typeof addressManagementResolutionSchema>;
export type AddressManagementIdentity = z.infer<typeof addressManagementIdentitySchema>;
export type AddressManagementPreference = z.infer<typeof addressManagementPreferenceSchema>;
export type AddressManagementDto = z.infer<typeof addressManagementDtoSchema>;
export type AddressManagementQuery = z.infer<typeof addressManagementQuerySchema>;
export type AddressManagementListResponse = z.infer<typeof addressManagementListResponseSchema>;
export type AddressManagementResult = z.infer<typeof addressManagementResultSchema>;
export type AddressManagementCommandResponse = z.infer<
  typeof addressManagementCommandResponseSchema
>;
