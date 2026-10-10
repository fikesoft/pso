import type { CashShiftOpenRequest, CashShiftCloseRequest } from '@pos/contracts';
export type ShiftMutation =
  | { kind: 'OPEN'; registerId: string; body: CashShiftOpenRequest }
  | { kind: 'CLOSE'; shiftId: string; body: CashShiftCloseRequest };
export interface ShiftCursorContext {
  organizationId: string;
  actor: string;
  locationId: string;
  view: string;
  status: string;
  registerId?: string;
}
