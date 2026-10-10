import type {
  CustomerManagementDto,
  CustomerManagementList,
  CustomerManagementProfile,
  CustomerManagementSearch,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useCustomerOperation } from '../../../entities/customer';
import type { useCustomerDirectory } from './use-customer-directory';
export interface CustomerManagementProps {
  api: Api;
  organizationId: string;
  actorUserId: string;
  locationId: string;
  locationName: string;
  canCreate: boolean;
  canManageAddresses: boolean;
  canReadOrders: boolean;
  canReadAnalytics: boolean;
  canUpdate: boolean;
  canArchive: boolean;
}
export type CustomerDirectoryQuery = Pick<CustomerManagementList, 'status'> &
  Partial<Pick<CustomerManagementSearch, 'field' | 'query'>>;
export type CustomerDirectoryModel = ReturnType<typeof useCustomerDirectory>;
export interface CustomerProfileFieldsProps {
  profile?: CustomerManagementProfile;
  disabled: boolean;
}
export interface CustomerDetailProps {
  organizationId: string;
  actorUserId: string;
  canManageAddresses: boolean;
  canReadOrders: boolean;
  canReadAnalytics: boolean;
  addressLocked: boolean;
  onAddressLockedChange: (locked: boolean) => void;
  api: Api;
  customerId: string;
  locationId: string;
  canUpdate: boolean;
  canArchive: boolean;
  operation: ReturnType<typeof useCustomerOperation>;
  locked: boolean;
}
export interface CustomerEditorProps {
  customer: CustomerManagementDto;
  locationId: string;
  canUpdate: boolean;
  canArchive: boolean;
  operation: ReturnType<typeof useCustomerOperation>;
  locked: boolean;
}
export interface CustomerCreateProps {
  api: Api;
  locationId: string;
  onSaved: () => Promise<void>;
  onLockedChange: (locked: boolean) => void;
}

export interface CustomerDirectoryProps {
  model: CustomerDirectoryModel;
}
