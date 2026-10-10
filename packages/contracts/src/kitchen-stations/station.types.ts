import type { z } from 'zod';
import type {
  kitchenStationCreateSchema,
  kitchenStationUpdateSchema,
  kitchenStationArchiveSchema,
  kitchenStationListSchema,
  kitchenStationResolutionSchema,
} from './station.schema';
export type KitchenStationStatus = 'ACTIVE' | 'ARCHIVED';
export type KitchenStationCreateRequest = z.infer<typeof kitchenStationCreateSchema>;
export type KitchenStationUpdateRequest = z.infer<typeof kitchenStationUpdateSchema>;
export type KitchenStationArchiveRequest = z.infer<typeof kitchenStationArchiveSchema>;
export type KitchenStationListRequest = z.input<typeof kitchenStationListSchema>;
export type KitchenStationCommandIdentity = z.infer<typeof kitchenStationResolutionSchema>;
export interface KitchenStationDto {
  id: string;
  locationId: string;
  code: string;
  name: string;
  sortOrder: number;
  status: KitchenStationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface KitchenStationMutationResponse {
  station: KitchenStationDto;
}
export interface KitchenStationListResponse {
  stations: KitchenStationDto[];
  nextCursor: string | null;
  timezone: string;
}
export type KitchenStationResolutionResponse =
  | {
      status: 'SUCCEEDED';
      command: KitchenStationCommandIdentity;
      result: KitchenStationMutationResponse;
    }
  | { status: 'RETIRED'; command: KitchenStationCommandIdentity };
