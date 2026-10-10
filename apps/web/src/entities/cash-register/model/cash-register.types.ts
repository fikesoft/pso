import type {
  CashRegisterCreateRequest,
  CashRegisterRenameRequest,
  CashRegisterArchiveRequest,
} from '@pos/contracts';
export type CashRegisterAttempt =
  | { kind: 'CREATE'; body: CashRegisterCreateRequest }
  | { kind: 'RENAME'; registerId: string; body: CashRegisterRenameRequest }
  | { kind: 'ARCHIVE'; registerId: string; body: CashRegisterArchiveRequest };
