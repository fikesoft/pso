import { decimalString, decimalUnits } from '../../../shared/lib/money';
import {
  BILL_SPLIT_MAX_CENTS,
  BILL_SPLIT_MAX_ORDERS,
  BILL_SPLIT_MAX_PARTS,
} from '../config/bill-split.constants';
import type { BillDivision, BillDistribution, BillSourceAmount } from './bill-split.types';
/** Amounts stay in integer cents, including totals beyond Number.MAX_SAFE_INTEGER. */
export function distributeBill(
  sources: readonly BillSourceAmount[],
  division: BillDivision,
): BillDistribution {
  if (
    sources.length < 1 ||
    sources.length > BILL_SPLIT_MAX_ORDERS ||
    new Set(sources.map((source) => source.orderId)).size !== sources.length
  )
    throw new Error('Selectați între 1 și 100 de comenzi distincte.');
  const orders = sources
    .map((source) => ({ ...source, remaining: decimalUnits(source.amount, 2) }))
    .sort((a, b) => (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0));
  if (
    orders.some(
      (order) => !order.orderId || order.remaining < 0n || order.remaining > BILL_SPLIT_MAX_CENTS,
    )
  )
    throw new Error('Fiecare comandă trebuie să aibă o sumă nenegativă validă.');
  const total = orders.reduce((sum, order) => sum + order.remaining, 0n);
  if (total > BILL_SPLIT_MAX_CENTS) throw new Error('Totalul depășește limita monetară.');
  const count = division.mode === 'EQUAL' ? division.count : division.amounts.length;
  if (!Number.isInteger(count) || count < 2 || count > BILL_SPLIT_MAX_PARTS)
    throw new Error('Nota se împarte în 2 până la 50 de părți.');
  const divisor = BigInt(count);
  const amounts =
    division.mode === 'EQUAL'
      ? Array.from(
          { length: count },
          (_, index) => total / divisor + (BigInt(index) < total % divisor ? 1n : 0n),
        )
      : division.amounts.map((amount) => decimalUnits(amount, 2));
  if (
    amounts.some((amount) => amount <= 0n) ||
    amounts.reduce((sum, amount) => sum + amount, 0n) !== total
  )
    throw new Error('Părțile trebuie să fie pozitive și să însumeze exact nota.');
  const payable = orders.filter((order) => order.remaining > 0n);
  let index = 0;
  const parts = amounts.map((amount, position) => {
    let remaining = amount;
    const allocations = [];
    while (remaining > 0n) {
      const order = payable[index]!;
      const allocated = remaining < order.remaining ? remaining : order.remaining;
      allocations.push({ orderId: order.orderId, amount: decimalString(allocated, 2) });
      remaining -= allocated;
      order.remaining -= allocated;
      if (order.remaining === 0n) index++;
    }
    return { position: position + 1, amount: decimalString(amount, 2), allocations };
  });
  return { total: decimalString(total, 2), parts };
}
