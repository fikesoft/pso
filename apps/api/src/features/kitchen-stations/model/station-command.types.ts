import type {
  KitchenStationCreateRequest,
  KitchenStationUpdateRequest,
  KitchenStationArchiveRequest,
} from '@pos/contracts';
export interface StationCommandIdentity {
  locationId: string;
  requestKey: string;
  kind: 'CREATE' | 'UPDATE' | 'ARCHIVE';
  stationId?: string;
}
export type StationMutation =
  | { kind: 'CREATE'; body: KitchenStationCreateRequest }
  | { kind: 'UPDATE'; stationId: string; body: KitchenStationUpdateRequest }
  | { kind: 'ARCHIVE'; stationId: string; body: KitchenStationArchiveRequest };
export interface StationCursorContext {
  organizationId: string;
  actor: string;
  locationId: string;
  status: string;
}
