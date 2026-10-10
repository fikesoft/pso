import type { CashCommandIdentity } from '@pos/contracts';
import { openCashShift, closeCashShift, createCashMovement } from '../../../entities/cash-shift';
import type { Api } from '../../../shared/api';
import type { ShiftAttempt } from '../model/shift-management.types';
export function shiftAttemptIdentity(attempt: ShiftAttempt): CashCommandIdentity {
  const { locationId, requestKey } = attempt.body;
  switch (attempt.kind) {
    case 'OPEN':
      return { locationId, requestKey, kind: 'OPEN', registerId: attempt.registerId };
    case 'CLOSE':
      return { locationId, requestKey, kind: 'CLOSE', shiftId: attempt.shiftId };
    case 'CASH_IN':
    case 'CASH_OUT':
      if (attempt.body.direction !== (attempt.kind === 'CASH_IN' ? 'IN' : 'OUT'))
        throw new Error('Direcția mișcării nu corespunde tentativei.');
      return { locationId, requestKey, kind: attempt.kind, shiftId: attempt.shiftId };
  }
}
export async function sendShiftAttempt(api: Api, attempt: ShiftAttempt): Promise<string> {
  switch (attempt.kind) {
    case 'OPEN':
      return (await openCashShift(api, attempt.registerId, attempt.body)).shift.id;
    case 'CLOSE':
      return (await closeCashShift(api, attempt.shiftId, attempt.body)).shift.id;
    case 'CASH_IN':
    case 'CASH_OUT':
      return (await createCashMovement(api, attempt.shiftId, attempt.body)).movement.shiftId;
  }
}
