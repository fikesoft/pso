import type {
  KitchenStationCommandIdentity,
  KitchenStationCreateRequest,
  KitchenStationUpdateRequest,
  KitchenStationArchiveRequest,
  KitchenStationMutationResponse,
  KitchenRoutingIdentity,
  KitchenRoutingSetRequest,
  KitchenRoutingDto,
} from '@pos/contracts/kitchen-stations';
import type { Api } from '../../../shared/api';
import type { useStationOperation } from './use-station-operation';
export interface StationScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface StationAccessProps extends StationScope {
  api: Api;
  can: (permission: string) => boolean;
}
export type StationOperationIdentity =
  | { family: 'STATION'; command: KitchenStationCommandIdentity }
  | { family: 'ROUTING'; command: KitchenRoutingIdentity };
export type StationPointer = StationScope & StationOperationIdentity;
export type StationAttempt =
  | { family: 'ROUTING'; body: KitchenRoutingSetRequest }
  | { family: 'STATION'; kind: 'CREATE'; body: KitchenStationCreateRequest }
  | { family: 'STATION'; kind: 'UPDATE'; stationId: string; body: KitchenStationUpdateRequest }
  | { family: 'STATION'; kind: 'ARCHIVE'; stationId: string; body: KitchenStationArchiveRequest };
export type StationOperationResult =
  | { family: 'STATION'; result: KitchenStationMutationResponse }
  | { family: 'ROUTING'; result: { routing: KitchenRoutingDto } };
export interface StationOperationInput extends StationAccessProps {
  family: StationOperationIdentity['family'];
  isExternallyBlocked?: () => boolean;
  onSaved: (result?: StationOperationResult) => Promise<unknown>;
}
export type StationOperationModel = ReturnType<typeof useStationOperation>;
export interface StationStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}
