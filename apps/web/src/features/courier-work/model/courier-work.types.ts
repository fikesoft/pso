import type { CourierWorkItem, CourierWorkQuery } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { AcceptanceModel } from './courier-acceptance.types';
import type { TransitionModel } from './courier-transition.types';
export interface CourierWorkProps {
  api: Api;
  organizationId: string;
  actorUserId: string;
  locationId: string;
  locationName: string;
  canRead: boolean;
}
export type CourierWorkView = CourierWorkQuery['view'];
export interface CourierWorkCardProps {
  order: CourierWorkItem;
  onOpen: () => void;
}
export interface CourierWorkDetailsProps extends CourierWorkProps {
  command: AcceptanceModel;
  transition: TransitionModel;
  orderId: string;
  onInvalidated: () => void;
}

export interface CourierAppStatusProps {
  online: boolean;
  installed: boolean;
  available: boolean;
}
