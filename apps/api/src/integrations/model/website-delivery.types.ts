import type { WebsiteDeliveryOrder } from '@pos/contracts';

/** Resolved server-side from an authenticated integration and its authorized mappings. */
export type DeliveryImportContext = Readonly<{
  connectionId: string;
  organizationId: string;
  locationId: string;
}>;
export type DeliveryImportRequest = Readonly<{
  context: DeliveryImportContext;
  idempotencyKey: string;
  order: WebsiteDeliveryOrder;
}>;
export type DeliveryImportResult = Readonly<{
  orderId: string;
  externalOrderId: string;
  status: 'AWAITING_ACCEPTANCE';
}>;
export interface WebsiteDeliveryAdapter {
  importOrder(request: DeliveryImportRequest): Promise<DeliveryImportResult>;
}
