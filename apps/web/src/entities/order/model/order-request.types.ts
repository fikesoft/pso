import type { Order, ManualOrderSource, ModifierSelectionInput, ServiceType } from '@pos/contracts';
export interface OrderItemInput {
  id?: string;
  productId: string;
  sourceUpsellOfferId?: string;
  quantity: string;
  courseNumber?: number;
  note?: string;
  modifiers?: ModifierSelectionInput[];
}
export interface OrderInput {
  customer?: Order['customer'];
  customerRef?: Order['customerRef'];
  deliveryAddress?: Order['deliveryAddress'];
  addressRef?: Order['addressRef'];
  serviceType: ServiceType;
  tableLabel?: string;
  notes?: string;
  items: OrderItemInput[];
}
export interface CreateOrderInput extends OrderInput {
  tableVisitId?: string;
  source?: ManualOrderSource;
  locationId: string;
  requestKey: string;
}
export interface UpdateOrderInput extends OrderInput {
  version: number;
}
export type OrderCommandAction = 'send' | 'confirm' | 'cancel' | 'complete';
export interface OrderCommandInput {
  version: number;
  requestKey: string;
  reason?: string;
}
