import type { ModifierGroupSnapshotDto } from '../shared';
import type { ServiceType, KitchenStatus } from '../orders';
import type { KitchenAlertThresholds } from '../kitchen-alerts';

export interface KitchenArrivalResponse {
  revision: string;
}

export interface KitchenTicketItem {
  id: string;
  orderItemId: string;
  position: number;
  courseNumber: number;
  productName: string;
  productSku: string;
  quantity: string;
  note: string | null;
  modifierGroups: ModifierGroupSnapshotDto[];
  alertThresholds: KitchenAlertThresholds;
}

export interface KitchenTicketBatch {
  id: string;
  status: KitchenStatus;
  version: number;
  courseNumber: number;
  firedAt: string | null;
  createdAt: string;
  updatedAt: string;
  station: { id: string; code: string; name: string } | null;
  ticketItemIds: string[];
}

export interface KitchenTicket {
  id: string;
  orderId: string;
  locationId: string;
  orderNumber: number;
  orderVersion: number;
  revision: number;
  serviceType: ServiceType;
  tableLabel: string | null;
  status: KitchenStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  items: KitchenTicketItem[];
  batches: KitchenTicketBatch[];
}

export interface KitchenResponse {
  serverTime: string;
  tickets: KitchenTicket[];
  nextCursor: string | null;
}

export interface KitchenStationOption {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}
export interface KitchenStationOptionsResponse {
  stations: KitchenStationOption[];
  nextCursor: string | null;
}
