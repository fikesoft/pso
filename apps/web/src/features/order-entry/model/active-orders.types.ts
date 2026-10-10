import type { ActiveOrder, ActiveOrdersResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { OrderEntryModel } from './order-entry.types';
import type { OperatorMode } from './operator.types';
export interface ActiveOrdersInput {
  api: Api;
  locationId: string;
  enabled: boolean;
}
export interface ActiveOrdersPage extends ActiveOrdersResponse {
  pageDepth: number;
}
export interface OperatorActiveOrdersProps {
  model: OrderEntryModel;
  mode?: OperatorMode;
}
export interface ActiveOrderCardProps {
  mode?: OperatorMode;
  order: ActiveOrder;
  timezone: string;
  disabled: boolean;
  onOpen: () => void;
}
export interface ActiveOrderFinancialProps {
  order: ActiveOrder;
  showStatus?: boolean;
}
