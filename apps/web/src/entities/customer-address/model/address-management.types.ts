import type {
  AddressManagementCommand,
  AddressManagementIdentity,
  AddressManagementProfile,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface AddressBookScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
  customerId: string;
}
export type AddressBookIdentity =
  | AddressManagementIdentity
  | {
      action: 'CREATE';
      locationId: string;
      requestKey: string;
    };
export interface AddressBookPointer extends AddressBookScope {
  command: AddressBookIdentity;
}
export type AddressBookAttempt =
  | (AddressManagementCommand & { addressId: string })
  | {
      action: 'CREATE';
      locationId: string;
      requestKey: string;
      profile: AddressManagementProfile;
    };
export interface AddressBookStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface AddressBookOperationInput extends AddressBookScope {
  api: Api;
  canManage: boolean;
  onSaved: () => Promise<void>;
}
