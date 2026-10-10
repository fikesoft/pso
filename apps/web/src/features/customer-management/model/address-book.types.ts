import type { AddressManagementDto, AddressManagementProfile } from '@pos/contracts';
import type { useAddressBook } from './use-address-book';
import type { CustomerManagementProps } from './customer-management.types';
export interface AddressBookProps
  extends Pick<CustomerManagementProps, 'api' | 'organizationId' | 'actorUserId' | 'locationId'> {
  customerId: string;
  active: boolean;
  canManage: boolean;
  parentLocked: boolean;
  onLockedChange: (locked: boolean) => void;
}
export type AddressBookModel = ReturnType<typeof useAddressBook>;
export interface AddressBookViewProps {
  model: AddressBookModel;
}
export interface AddressCardProps extends AddressBookViewProps {
  address: AddressManagementDto;
}
export interface AddressFormProps {
  profile?: AddressManagementProfile;
  disabled: boolean;
  onSave: (profile: AddressManagementProfile) => Promise<void>;
  onCancel: () => void;
}
