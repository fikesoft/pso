import type { KitchenTicket, KitchenAlertSeverity, KitchenFireTarget } from '@pos/contracts';
import type { useCourseOperation } from '../../../entities/kitchen';
import type { KitchenPage } from '../../../entities/kitchen';
import type { OperationalPanelProps } from '../../../shared/model/operations.types';
import type { Api } from '../../../shared/api';
export interface KitchenBoardProps extends OperationalPanelProps {
  organizationId: string;
  actorUserId: string;
}
export interface KitchenSoundProps {
  api: Api;
  locationId: string;
  stationId?: string;
}
export type KitchenColumnStatus = 'QUEUED' | 'PREPARING' | 'PARTIALLY_READY' | 'READY';
export type KitchenBoardData = Record<KitchenColumnStatus, KitchenPage>;
export interface KitchenTimerProps {
  createdAt: string;
  completedAt?: string;
  now?: number;
  fromRelease?: boolean;
}

export interface KitchenBatchProps
  extends Pick<KitchenCardProps, 'api' | 'now' | 'ticket' | 'canUpdate' | 'busy' | 'onUpdate'> {
  batch: KitchenTicket['batches'][number];
}
export interface KitchenCardProps {
  api: Api;
  now?: number;
  ticket: KitchenTicket;
  canUpdate: boolean;
  canFire: boolean;
  onFire: (ticket: KitchenTicket, course: KitchenFireTarget) => void;
  busy: boolean;
  stationId?: string;
  onUpdate: (
    ticket: KitchenTicket,
    status: 'PREPARING' | 'PARTIALLY_READY' | 'READY',
    batchId?: string,
  ) => void;
}

export interface KitchenCourseActionsProps {
  ticket: KitchenTicket;
  disabled: boolean;
  onFire: KitchenCardProps['onFire'];
}
export interface KitchenCourseRecoveryProps {
  operation: ReturnType<typeof useCourseOperation>;
}

export interface KitchenStationFilterProps {
  api: Api;
  locationId: string;
  value?: string;
  disabled: boolean;
  onChange: (stationId?: string) => void;
}

export interface PendingKitchenUpdate {
  ticket: KitchenTicket;
  status: 'PREPARING' | 'PARTIALLY_READY' | 'READY';
  batchId?: string;
}

export interface KitchenActionsProps {
  status: KitchenTicket['status'];
  busy: boolean;
  onUpdate: (status: PendingKitchenUpdate['status']) => void;
}
export interface KitchenItemsProps {
  api: Api;
  ticketId: string;
  items: KitchenTicket['items'];
  elapsedSeconds?: number;
}
export interface KitchenRecipeProps {
  api: Api;
  ticketId: string;
  item: KitchenTicket['items'][number];
}
export interface KitchenSeverityProps {
  severity?: KitchenAlertSeverity;
}
