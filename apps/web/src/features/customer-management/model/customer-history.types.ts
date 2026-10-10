import type { Order } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface CustomerHistoryProps {
  api: Api;
  customerId: string;
  locationId: string;
}
export interface CustomerHistoryCardProps {
  order: Order;
}
