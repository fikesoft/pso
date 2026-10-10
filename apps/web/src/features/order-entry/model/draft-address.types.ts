import type { CustomerAddressCreateRequest, CustomerAddressDto, Order } from '@pos/contracts';
import type { Dispatch, SetStateAction } from 'react';
import type { Api } from '../../../shared/api';
import type { OrderCreationScope } from './order-creation.types';
import type { OrderDraftState } from './order-entry.types';
export interface AddressPointer extends OrderCreationScope {
  customerId: string;
  requestKey: string;
  operation: 'CREATE' | 'ARCHIVE';
  addressId?: string;
  version?: number;
}
export interface AddressCommandInput extends OrderCreationScope {
  api: Api;
  disabled: boolean;
  isOtherLocked: () => boolean;
  onResult: (address: CustomerAddressDto) => void;
}
export interface DraftAddressInput extends Omit<AddressCommandInput, 'onResult'> {
  draft: OrderDraftState;
  order: Order | null;
  setDraft: Dispatch<SetStateAction<OrderDraftState>>;
  canRead: boolean;
  canManage: boolean;
}
export type AddressCreateFields = Pick<
  CustomerAddressCreateRequest,
  'label' | 'address' | 'instructions'
>;
