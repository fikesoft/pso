import type {
  OrderResponsibilityCommandRequest,
  OrderResponsibilityCommandKind,
  OrderResponsibilityRowDto,
  CashShiftDto,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { ResponsibilityScope } from '../../../entities/order-responsibility';
import type { useResponsibilityCommand } from './use-responsibility-command';
import type { useResponsibilityWorkspace } from './use-responsibility-workspace';
export interface ResponsibilityProps extends ResponsibilityScope {
  api: Api;
  can: (permission: string) => boolean;
}
export interface ResponsibilityWorkspaceInput extends ResponsibilityProps {
  orderId?: string;
  orderVersion?: number;
  accessBlocked: boolean;
  isReviewLocked: () => boolean;
  onSaved: () => Promise<unknown>;
}
export type ResponsibilityView = 'UNASSIGNED' | 'ASSIGNED' | 'INCOMING' | 'OUTGOING';
export interface ResponsibilityAttempt {
  orderId: string;
  body: OrderResponsibilityCommandRequest;
}
export interface ResponsibilityCommandInput extends ResponsibilityProps {
  isReviewLocked: () => boolean;
  onSaved: () => Promise<unknown>;
}
export type ResponsibilityCommandModel = ReturnType<typeof useResponsibilityCommand>;
export type ResponsibilityWorkspaceModel = ReturnType<typeof useResponsibilityWorkspace>;
export interface ResponsibilityQueueProps {
  model: ResponsibilityWorkspaceModel;
  onOpen: (orderId: string) => void;
  disabled: boolean;
}
export interface ResponsibilityPanelProps {
  model: ResponsibilityWorkspaceModel;
  blocked: boolean;
}
export interface ResponsibilityFormProps {
  row: OrderResponsibilityRowDto;
  kind: OrderResponsibilityCommandKind;
  target: CashShiftDto | null;
  actorUserId: string;
  locationId: string;
  command: ResponsibilityCommandModel;
  blocked: boolean;
  onBack: () => void;
}
