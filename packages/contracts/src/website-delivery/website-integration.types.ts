import type { ProductInformation } from '../catalog/product-information.types';
import type { z } from 'zod';
import type { ModifierGroupSnapshotDto, ProductModifierGroupDto } from '../shared';
import type { ProductScheduleAvailability } from '../menu-schedules';
import type {
  createWebsiteConnectionSchema,
  createWebsiteKeySchema,
  updateWebsiteConnectionSchema,
  websiteIntegrationOrderSchema,
  websitePrivateDataSchema,
} from './website-integration.schema';

export type WebsiteIntegrationOrder = z.infer<typeof websiteIntegrationOrderSchema>;
export type WebsitePrivateData = z.infer<typeof websitePrivateDataSchema>;
export type CreateWebsiteConnectionRequest = z.input<typeof createWebsiteConnectionSchema>;
export type UpdateWebsiteConnectionRequest = z.input<typeof updateWebsiteConnectionSchema>;
export type CreateWebsiteKeyRequest = z.input<typeof createWebsiteKeySchema>;
export type WebsiteOrderStatus = 'AWAITING_ACCEPTANCE' | 'ACCEPTED' | 'REJECTED';
export interface WebsiteApiKey {
  id: string;
  connectionId: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}
export interface WebsiteConnection {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
  locationCode: string;
  status: 'ACTIVE' | 'PAUSED';
  version: number;
  createdAt: string;
  keys: WebsiteApiKey[];
}
export interface WebsiteConnectionsResponse {
  connections: WebsiteConnection[];
}
export interface WebsiteConnectionResponse {
  connection: WebsiteConnection;
}
export interface WebsiteKeyResponse {
  key: WebsiteApiKey;
}
export interface CreateWebsiteKeyResponse extends WebsiteKeyResponse {
  apiKey: string;
}
export interface WebsiteCatalogProduct extends ProductInformation {
  productId: string;
  externalProductId: string;
  name: string;
  price: string;
  unitTotal: string;
  imageUrl: string | null;
  modifierGroups: ProductModifierGroupDto[];
  scheduleAvailability: ProductScheduleAvailability;
}
export interface WebsiteCatalogResponse {
  connectionId: string;
  locationCode: string;
  currency: 'MDL';
  products: WebsiteCatalogProduct[];
  nextCursor: string | null;
}
export interface WebsiteOrderReceipt {
  id: string;
  externalOrderId: string;
  status: WebsiteOrderStatus;
  version: number;
  orderId: string | null;
  total: string;
  currency: 'MDL';
  receivedAt: string;
  rejectionReason: string | null;
}
export interface WebsiteOrderReceiptResponse {
  receipt: WebsiteOrderReceipt;
}
export interface WebsiteInboxOrder extends WebsiteOrderReceipt {
  connectionId: string;
  connectionName: string;
  locationId: string;
}
export interface WebsiteInboxItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  unitPrice: string;
  taxRateSnapshot: string | null;
  quantity: string;
  lineTotal: string;
  note: string | null;
  modifierGroups: ModifierGroupSnapshotDto[];
}
export interface WebsiteOrderDetails extends WebsiteInboxOrder, WebsitePrivateData {
  items: WebsiteInboxItem[];
}
export interface WebsiteInboxResponse {
  orders: WebsiteInboxOrder[];
  nextCursor: string | null;
}
export interface WebsiteOrderResponse {
  websiteOrder: WebsiteOrderDetails;
}
export interface WebsiteOrderDecisionResponse extends WebsiteOrderResponse {
  orderId: string | null;
}
