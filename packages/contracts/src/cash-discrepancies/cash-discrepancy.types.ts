import type { z } from 'zod';
import type { CashClosingDto } from '../cash-shifts';
import type {
  cashDiscrepancyQuerySchema,
  cashDiscrepancyRegisterQuerySchema,
} from './cash-discrepancy.schema';
export type CashDiscrepancyQuery = z.input<typeof cashDiscrepancyQuerySchema>;
export type CashDiscrepancyRegisterQuery = z.input<typeof cashDiscrepancyRegisterQuerySchema>;
export interface CashDiscrepancyRowDto {
  shift: {
    id: string;
    registerId: string;
    registerCode: string;
    registerName: string;
    ownerUserId: string;
    ownerDisplayName: string;
    openedAt: string;
  };
  closing: CashClosingDto;
}
export interface CashDiscrepancyResponse {
  closings: CashDiscrepancyRowDto[];
  nextCursor: string | null;
  timezone: string;
}
export interface CashDiscrepancyRegisterOption {
  registerId: string;
  registerCode: string;
  registerName: string;
}
export interface CashDiscrepancyRegisterResponse {
  registers: CashDiscrepancyRegisterOption[];
  nextCursor: string | null;
  timezone: string;
}
