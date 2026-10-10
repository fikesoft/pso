import type { OrderTimelineEvent } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface OrderTimelineProps {
  api: Api;
  orderId: string;
  locationId: string;
  version: number;
}
export interface OrderTimelineEventProps {
  event: OrderTimelineEvent;
}
