import type {
  CashCommandIdentity,
  CashShiftResolutionResponse,
  PaymentCommandResolutionResponse,
  ManualCheckoutResolutionResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { useCashCommandRecovery } from './use-cash-command-recovery';
export interface CashCommandScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export type CashRecoveryChannel = 'CASH' | 'FINANCIAL';
export interface CashCommandPointer extends CashCommandScope {
  command: CashCommandIdentity;
}
export type CashCommandResolution =
  | CashShiftResolutionResponse
  | PaymentCommandResolutionResponse
  | ManualCheckoutResolutionResponse;
export interface CashPointerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface CashRecoveryInput extends CashCommandScope {
  api: Api;
  channel: CashRecoveryChannel;
  canResolve: (command: CashCommandIdentity) => boolean;
  onResolved?: (command: CashCommandIdentity) => Promise<void>;
}
export type CashRecoveryModel = ReturnType<typeof useCashCommandRecovery>;
export interface CashRecoveryProps {
  model: CashRecoveryModel;
}
