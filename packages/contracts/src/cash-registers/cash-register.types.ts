import type { z } from 'zod';
import type {
  CASH_REGISTER_STATUSES,
  CASH_REGISTER_COMMAND_KINDS,
} from './config/cash-register.constants';
import type {
  cashRegisterCreateSchema,
  cashRegisterRenameSchema,
  cashRegisterArchiveSchema,
  cashRegisterQuerySchema,
  cashRegisterResolutionSchema,
} from './cash-register.schema';
export type CashRegisterStatus = (typeof CASH_REGISTER_STATUSES)[number];
export type CashRegisterCommandKind = (typeof CASH_REGISTER_COMMAND_KINDS)[number];
export interface CashRegisterDto {
  id: string;
  locationId: string;
  code: string;
  name: string;
  status: CashRegisterStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type CashRegisterCreateRequest = z.input<typeof cashRegisterCreateSchema>;
export type CashRegisterRenameRequest = z.input<typeof cashRegisterRenameSchema>;
export type CashRegisterArchiveRequest = z.input<typeof cashRegisterArchiveSchema>;
export type CashRegisterListRequest = z.input<typeof cashRegisterQuerySchema>;
export type CashRegisterResolutionRequest = z.input<typeof cashRegisterResolutionSchema>;
export interface CashRegisterResponse {
  register: CashRegisterDto;
}
export interface CashRegisterListResponse {
  registers: CashRegisterDto[];
  nextCursor: string | null;
}
export type CashRegisterResolutionResponse =
  | { status: 'SUCCEEDED'; kind: CashRegisterCommandKind; register: CashRegisterDto }
  | {
      status: 'RETIRED';
      kind: CashRegisterCommandKind;
      locationId: string;
      requestKey: string;
      registerId: string | null;
    };
