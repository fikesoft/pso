import type { DeliveryCommand, Order } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useOrderDelivery } from './use-order-delivery';
export interface OrderDeliveryInput {
  api: Api;
  order: Order;
  enabled: boolean;
  isExternallyBlocked?: () => boolean;
  onUpdated: (order: Order) => void;
}
export interface DeliveryFormState {
  status: DeliveryCommand['status'];
  courierUserId: string;
  reason: string;
}
export interface OrderDeliveryProps {
  model: ReturnType<typeof useOrderDelivery>;
  order: Order;
  disabled: boolean;
}

export interface DeliveryFormProps {
  model: OrderDeliveryProps['model'];
  order: Order;
  status: DeliveryCommand['status'];
  options: readonly DeliveryCommand['status'][];
  blocked: boolean;
}
