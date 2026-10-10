import type { OrderSearchResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useOrderSearch } from './use-order-search';
export interface OrderSearchFields {
  number: string;
  customerName: string;
  customerPhone: string;
  createdByUserId: string;
  status: string;
  source: string;
  createdFrom: string;
  createdTo: string;
}
export interface OrderSearchInput {
  api: Api;
  locationId: string;
  enabled: boolean;
}
export interface OrderSearchProps {
  model: ReturnType<typeof useOrderSearch>;
}
export interface OrderSearchPage extends OrderSearchResponse {
  pageDepth: number;
}
