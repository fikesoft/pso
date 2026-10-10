import type { CustomerManagementCommand, CustomerManagementResolution } from '@pos/contracts';
import type { Api } from '../../../shared/api';

export interface CustomerPointerScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export interface CustomerPointer extends CustomerPointerScope {
  customerId: string;
  command: CustomerManagementResolution;
}
export interface CustomerPointerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type CustomerAttempt = CustomerManagementCommand & { customerId: string };
export interface CustomerOperationInput extends CustomerPointerScope {
  api: Api;
  canUpdate: boolean;
  canArchive: boolean;
  onSaved: () => Promise<void>;
}
