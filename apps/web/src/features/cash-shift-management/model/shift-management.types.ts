import type {
  CashMovementCreateRequest,
  CashShiftOpenRequest,
  CashShiftCloseRequest,
  CashShiftDetailResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { CashCommandScope, CashRecoveryModel } from '../../../entities/cash-command';
import type { useShiftList } from './use-shift-list';
import type { useShiftDetail } from './use-shift-detail';
import type { useShiftCommand } from './use-shift-command';
export interface CashShiftManagementProps extends CashCommandScope {
  isExternallyBlocked?: () => boolean;
  externalBlocked?: boolean;
  onReviewResponsibilities?: () => void;
  api: Api;
  can: (permission: string) => boolean;
}
export type ShiftAttempt =
  | { kind: 'OPEN'; registerId: string; body: CashShiftOpenRequest }
  | { kind: 'CLOSE'; shiftId: string; body: CashShiftCloseRequest }
  | { kind: 'CASH_IN' | 'CASH_OUT'; shiftId: string; body: CashMovementCreateRequest };
export interface ShiftCommandInput {
  isExternallyBlocked?: () => boolean;
  api: Api;
  recovery: CashRecoveryModel;
  enabled: boolean;
  canSend: (kind: ShiftAttempt['kind']) => boolean;
  onSaved: (shiftId: string) => Promise<void>;
}
export type ShiftCommandModel = ReturnType<typeof useShiftCommand>;
export interface ShiftOpenFormProps {
  props: CashShiftManagementProps;
  command: ShiftCommandModel;
}
export interface ShiftCloseFormProps {
  detail: CashShiftDetailResponse;
  actorUserId: string;
  command: ShiftCommandModel;
}
export interface ShiftListProps {
  model: ReturnType<typeof useShiftList>;
  disabled: boolean;
  canReport: boolean;
  onOpen: (id: string) => void;
}
export interface ShiftDetailProps {
  detail: CashShiftDetailResponse;
  props: CashShiftManagementProps;
  disabled: boolean;
  onClose: () => void;
}
export interface ShiftSummaryProps {
  detail: CashShiftDetailResponse;
}

export interface ShiftCommandStatusProps {
  command: ShiftCommandModel;
  onRefresh: () => Promise<void>;
}

export interface ShiftMovementFormProps {
  detail: CashShiftDetailResponse;
  direction: 'IN' | 'OUT';
  command: ShiftCommandModel;
}
export interface ShiftMovementsProps {
  detail: CashShiftDetailResponse;
  props: CashShiftManagementProps;
}

export type ShiftDialogMode = 'OPEN' | 'DETAIL' | 'CLOSE' | 'CASH_IN' | 'CASH_OUT' | null;
export interface ShiftDialogProps {
  props: CashShiftManagementProps;
  mode: ShiftDialogMode;
  setMode: (mode: ShiftDialogMode) => void;
  detail: ReturnType<typeof useShiftDetail>;
  command: ShiftCommandModel;
  mayClose: boolean;
  mayMove: boolean;
  onRefresh: () => Promise<void>;
}
