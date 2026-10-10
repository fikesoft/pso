import type { BusinessHoursWindow } from '@pos/contracts';
export type { CreateLocationRequest, UpdateLocationRequest } from '@pos/contracts';
export interface LocationMetadataRequest {
  brandId: string | null;
  address: string;
  timezone: string;
  phone: string | null;
  latitude: string | null;
  longitude: string | null;
  businessHours: BusinessHoursWindow[];
}
