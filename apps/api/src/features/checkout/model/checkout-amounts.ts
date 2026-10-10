import { assert } from '../../../shared/lib/http';
import { decimalString, decimalUnits } from '../../../shared/lib/money';
import type { CheckoutAmounts, CheckoutCommand } from './checkout.types';

export function checkoutAmounts(command: CheckoutCommand, total: string): CheckoutAmounts {
  if (command.mode === 'DEMO') return { method: null, receivedAmount: null, changeAmount: null };
  if (command.body.method === 'CARD')
    return { method: 'CARD', receivedAmount: total, changeAmount: '0.00' };
  const received = decimalUnits(command.body.receivedAmount, 2);
  const amount = decimalUnits(total, 2);
  assert(received >= amount, 400, 'Suma primită este mai mică decât totalul comenzii');
  return {
    method: 'CASH',
    receivedAmount: decimalString(received, 2),
    changeAmount: decimalString(received - amount, 2),
  };
}
