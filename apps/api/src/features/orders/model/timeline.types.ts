import type { OrderTimelineEvent } from '@pos/contracts';
export type TimelineSource = 'audit' | 'checkout' | 'event' | 'payment';
export interface TimelineScope {
  organizationId: string;
  locationId: string;
  orderId: string;
}
export interface TimelineAnchor {
  source: TimelineSource;
  id: string;
  createdAt: Date;
}
export type TimelineRecord = Omit<OrderTimelineEvent, 'createdAt'> & { createdAt: Date };
