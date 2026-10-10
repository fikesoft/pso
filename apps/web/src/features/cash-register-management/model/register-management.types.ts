import type { CashRegisterDto, CashRegisterResolutionRequest } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export interface RegisterScope {
  organizationId: string;
  actorUserId: string;
  locationId: string;
}
export type RegisterPointer = RegisterScope & CashRegisterResolutionRequest;
export interface RegisterStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface CashRegisterManagementProps extends RegisterScope {
  api: Api;
  locationName: string;
  canRead: boolean;
  canManage: boolean;
}
export type RegisterEdit =
  | { kind: 'CREATE' }
  | { kind: 'RENAME' | 'ARCHIVE'; register: CashRegisterDto };
export type RegisterFilter = 'ACTIVE' | 'ARCHIVED' | 'ALL';
export interface RegisterCommandInput extends RegisterScope {
  api: Api;
  enabled: boolean;
  onSettled: () => Promise<void>;
}
