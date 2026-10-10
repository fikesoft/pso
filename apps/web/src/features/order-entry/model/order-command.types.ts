import type { Order } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { OrderCommandAction, OrderCommandInput } from '../../../entities/order';
export type { OrderCommandAction } from '../../../entities/order';
export interface PendingOrderCommand {
  action: OrderCommandAction;
  body: OrderCommandInput;
  uncertain: boolean;
}
export interface OrderCommandsInput {
  isExternallyBlocked?: () => boolean;
  api: Api;
  selected: Order | null;
  onUpdated: (order: Order) => void;
}
