import type { ReactNode } from 'react';
import type { Order, OrderRepeatSource } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useOrderReview } from './use-order-review';
export interface OrderReviewInput {
  api: Api;
  organizationId: string;
  actorUserId: string;
  locationId: string;
  can: (permission: string) => boolean;
  onUpdated?: () => Promise<unknown> | void;
  isExternallyBlocked?: () => boolean;
}
export type OrderReviewModel = ReturnType<typeof useOrderReview>;
export interface OrderReviewEditingActions {
  edit: (order: Order) => void;
  repeat: (order: OrderRepeatSource) => void;
  repeatBlocked: boolean;
}
export interface OrderReviewExtensionContext {
  order: Order;
  blocked: boolean;
  refresh: () => Promise<void>;
}
export interface OrderReviewProps {
  model: OrderReviewModel;
  canEdit: boolean;
  editing?: OrderReviewEditingActions;
  renderExtension?: (context: OrderReviewExtensionContext) => ReactNode;
  recoveryExtension?: ReactNode;
}
