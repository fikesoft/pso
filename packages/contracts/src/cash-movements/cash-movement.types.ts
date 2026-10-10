import type { z } from 'zod';
import type {
  cashMovementCreateSchema,
  cashMovementResolutionSchema,
  cashMovementListSchema,
} from './cash-movement.schema';
import type { CASH_MOVEMENT_KINDS } from './config/cash-movement.constants';
export type CashMovementCreateRequest = z.input<typeof cashMovementCreateSchema>;
export type CashMovementResolutionRequest = z.input<typeof cashMovementResolutionSchema>;
export type CashMovementListRequest = z.input<typeof cashMovementListSchema>;
export type CashMovementCommandIdentity = CashMovementResolutionRequest;
export interface CashDrawerMovementDto {
  id: string;
  cashOperationId: string;
  locationId: string;
  shiftId: string;
  shiftVersion: number;
  requestKey: string;
  kind: 'CASH_IN' | 'CASH_OUT';
  direction: 'IN' | 'OUT';
  amount: string;
  currency: 'MDL';
  reason: string;
  actorUserId: string;
  createdAt: string;
}
export interface CashMovementCreateResponse {
  movement: CashDrawerMovementDto;
}
export type CashMovementResolutionResponse =
  | {
      status: 'SUCCEEDED';
      command: CashMovementCommandIdentity;
      result: CashMovementCreateResponse;
    }
  | { status: 'RETIRED'; command: CashMovementCommandIdentity };
export interface CashMovementRowDto {
  id: string;
  locationId: string;
  shiftId: string;
  kind: (typeof CASH_MOVEMENT_KINDS)[number];
  direction: 'IN' | 'OUT';
  amount: string;
  currency: 'MDL';
  actorUserId: string;
  createdAt: string;
  reason: string | null;
  source: { kind: 'CASH_OPERATION' | 'PAYMENT' | 'REFUND'; id: string };
}
export interface CashMovementListResponse {
  movements: CashMovementRowDto[];
  nextCursor: string | null;
  timezone: string;
}
