import type { KitchenAlertCommandIdentity } from '@pos/contracts/kitchen-alerts';
import type { Api } from '../../../shared/api';
export interface AlertAccessProps {
  api: Api;
  organizationId: string;
  actorUserId: string;
  locationId: string;
  canManageOrganization: boolean;
  canManageLocation: boolean;
}
export interface AlertOperationInput extends AlertAccessProps {
  onSaved: () => Promise<void>;
}
export interface AlertStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface AlertPointerScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface AlertPointer extends AlertPointerScope {
  command: KitchenAlertCommandIdentity;
}
