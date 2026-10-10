import type { Dispatch, SetStateAction } from 'react';
import type { CustomerDto, Order } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { OrderDraftState } from './order-entry.types';
export interface DraftCustomerInput {
  api: Api;
  locationId: string;
  draft: OrderDraftState;
  order: Order | null;
  setDraft: Dispatch<SetStateAction<OrderDraftState>>;
  disabled: boolean;
  canRead: boolean;
  canCreate: boolean;
}
export interface CustomerLookupResult {
  phone: string;
  customer: CustomerDto | null;
}
