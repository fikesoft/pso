import type { OrderCustomer } from './order-customer.types';
import type { DeliveryStatus } from '../delivery';
import type { PackingStatus } from '../packing';
import type { CheckoutSummary } from '../checkout';
import type { PaymentStatus, PaymentSummary } from '../payments';
import type {
  ModifierGroupSnapshotDto,
  CustomerReference,
  DeliveryAddress,
  AddressReference,
} from '../shared';
import type {
  ORDER_SOURCES,
  ORDER_STATUSES,
  KITCHEN_STATUSES,
  MANUAL_ORDER_SOURCES,
  SERVICE_TYPES,
} from './config/order.constants';
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type ServiceType = (typeof SERVICE_TYPES)[number];
export type OrderSource = (typeof ORDER_SOURCES)[number];
export type ManualOrderSource = (typeof MANUAL_ORDER_SOURCES)[number];
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];
export type OrderKitchenStatus = 'NOT_SENT' | Exclude<KitchenStatus, 'CANCELLED'>;

export interface OrderItem {
  id: string;
  productId: string;
  position: number;
  courseNumber: number;
  productName: string;
  productSku: string;
  unitPrice: string;
  taxRateSnapshot: string | null;
  baseUnitPrice: string;
  quantity: string;
  lineTotal: string;
  note: string | null;
  modifierGroups: ModifierGroupSnapshotDto[];
}

export interface Order {
  id: string;
  locationId: string;
  brandId: string | null;
  source: OrderSource | null;
  number: number;
  createdByUserId: string;
  customer?: OrderCustomer | null;
  customerRef?: CustomerReference | null;
  deliveryAddress?: DeliveryAddress | null;
  addressRef?: AddressReference | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentSummary: PaymentSummary;
  deliveryStatus: DeliveryStatus | null;
  deliveryCourierId: string | null;
  deliveryCourierName: string | null;
  serviceType: ServiceType;
  tableLabel: string | null;
  tableVisitId?: string;
  notes: string | null;
  currency: 'MDL';
  total: string;
  deliveryFee: string;
  deliveryFeeConfirmed: boolean;
  version: number;
  kitchenStatus: OrderKitchenStatus;
  packingStatus: PackingStatus;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  checkout?: CheckoutSummary | null;
}

export type OrderSummary = Order;
export interface OrdersResponse {
  orders: Order[];
  nextCursor: string | null;
}
export interface OrderResponse {
  order: Order;
}
