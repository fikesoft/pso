export interface OrderTimelineEvent {
  id: string;
  kind: 'ORDER' | 'KITCHEN' | 'PAYMENT' | 'DELIVERY' | 'PACKING';
  action: string;
  resourceType: string;
  resourceId: string;
  locationId: string;
  actorUserId: string;
  actorDisplayName: string | null;
  actorNameSource: 'SNAPSHOT' | 'CURRENT' | 'UNKNOWN';
  terminalId: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  orderVersion: number | null;
  reason: string | null;
  createdAt: string;
  metadata: {
    amount?: string;
    currency?: string;
    method?: string;
    courierUserId?: string;
    courierName?: string;
    checkoutMode?: string;
  };
}
export interface OrderTimelineResponse {
  events: OrderTimelineEvent[];
  nextCursor: string | null;
}
