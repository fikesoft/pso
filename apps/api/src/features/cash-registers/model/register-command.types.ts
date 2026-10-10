import type {
  CashRegisterCommandKind,
  CashRegisterCreateRequest,
  CashRegisterRenameRequest,
  CashRegisterArchiveRequest,
} from '@pos/contracts';
export interface RegisterCommandIdentity {
  locationId: string;
  requestKey: string;
  kind: CashRegisterCommandKind;
  registerId?: string;
}
export type RegisterMutation =
  | { kind: 'CREATE'; body: CashRegisterCreateRequest }
  | { kind: 'RENAME'; registerId: string; body: CashRegisterRenameRequest }
  | { kind: 'ARCHIVE'; registerId: string; body: CashRegisterArchiveRequest };
export interface RegisterCursorContext {
  organizationId: string;
  actor: string;
  locationId: string;
  status: string;
}
