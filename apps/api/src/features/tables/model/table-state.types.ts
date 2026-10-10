import type { OrderKitchenStatus, OrderStatus, TableMapState } from '@pos/contracts';

export interface VisitOrderState {
  status: OrderStatus;
  kitchenStatus: OrderKitchenStatus;
}

export interface VisitState {
  state: TableMapState;
  hasReadyFood: boolean;
  hasWaitingFood: boolean;
}
