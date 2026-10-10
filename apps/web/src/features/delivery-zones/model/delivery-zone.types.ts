import type { DeliveryZone, DeliveryZoneProfile, DeliveryZoneResolution } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useZoneCommand } from './use-zone-command';
export interface ZoneScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export type ZonePointer = ZoneScope & DeliveryZoneResolution & { zoneId: string };
export interface ZoneStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface DeliveryZonesProps extends ZoneScope {
  api: Api;
  locationName: string;
  timezone?: string;
  canRead: boolean;
  canManage: boolean;
}
export type ZoneFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';
export type ZoneEdit =
  | { action: 'CREATE'; zoneId: string }
  | { action: 'UPDATE' | 'ARCHIVE' | 'RESTORE'; zone: DeliveryZone };
export interface ZoneCommandInput extends ZoneScope {
  api: Api;
  enabled: boolean;
  onSettled: () => Promise<void>;
  onInvalidated: () => void;
}
export type ZoneCommandModel = ReturnType<typeof useZoneCommand>;
export interface ZoneFormProps {
  edit: ZoneEdit;
  locationId: string;
  command: ZoneCommandModel;
  onClose: () => void;
}
export interface ZoneShapeProps {
  shape: DeliveryZoneProfile['shape'];
  disabled: boolean;
  onChange: (shape: DeliveryZoneProfile['shape']) => void;
}

export interface ZoneRecoveryProps {
  command: ZoneCommandModel;
}
export interface ZoneCardProps {
  zone: DeliveryZone;
  canManage: boolean;
  locked: boolean;
  onEdit: (edit: ZoneEdit) => void;
}

export interface ZonePricingProps {
  profile: DeliveryZoneProfile;
  disabled: boolean;
  onChange: (profile: DeliveryZoneProfile) => void;
}
