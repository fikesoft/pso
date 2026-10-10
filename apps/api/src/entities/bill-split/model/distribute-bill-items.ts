import { decimalString, decimalUnits } from '../../../shared/lib/money';
import {
  BILL_SPLIT_MAX_CENTS,
  BILL_SPLIT_MAX_ORDERS,
  BILL_SPLIT_MAX_PARTS,
} from '../config/bill-split.constants';
import type {
  BillItemDistribution,
  BillItemDivision,
  BillItemPart,
  BillItemSource,
} from './bill-items.types';

/** Divide original line totals, including modifiers, without repricing or moving order items. */
export function distributeBillItems(
  sources: readonly BillItemSource[],
  division: BillItemDivision,
): BillItemDistribution {
  if (
    sources.length === 0 ||
    new Set(sources.map((source) => source.orderItemId)).size !== sources.length ||
    new Set(sources.map((source) => source.orderId)).size > BILL_SPLIT_MAX_ORDERS ||
    division.parts.length < 2 ||
    division.parts.length > BILL_SPLIT_MAX_PARTS
  )
    throw new Error('Selectați articole distincte și între 2 și 50 de părți.');
  const items = [...sources]
    .sort((a, b) => (a.orderItemId < b.orderItemId ? -1 : a.orderItemId > b.orderItemId ? 1 : 0))
    .map((source) => ({
      ...source,
      units: decimalUnits(source.quantity, 3),
      cents: decimalUnits(source.amount, 2),
    }));
  if (
    items.some(
      (item) =>
        !item.orderId ||
        !item.orderItemId ||
        item.units <= 0n ||
        item.units > BILL_SPLIT_MAX_CENTS ||
        item.cents > BILL_SPLIT_MAX_CENTS,
    )
  )
    throw new Error('Articolul trebuie să aibă o cantitate pozitivă și o sumă validă.');
  const total = items.reduce((sum, item) => sum + item.cents, 0n);
  if (total <= 0n || total > BILL_SPLIT_MAX_CENTS)
    throw new Error('Totalul notei trebuie să fie pozitiv și în limita monetară.');
  const knownIds = new Set(items.map((item) => item.orderItemId));
  const assignments = division.parts.map((part) => {
    const quantities = new Map<string, bigint>();
    for (const assignment of part.items) {
      const units = decimalUnits(assignment.quantity, 3);
      if (
        !knownIds.has(assignment.orderItemId) ||
        quantities.has(assignment.orderItemId) ||
        units <= 0n ||
        units > BILL_SPLIT_MAX_CENTS
      )
        throw new Error(
          'Alocarea conține un articol necunoscut, repetat sau o cantitate invalidă.',
        );
      quantities.set(assignment.orderItemId, units);
    }
    return quantities;
  });
  const parts: BillItemPart[] = division.parts.map((_, index) => ({
    position: index + 1,
    amount: '0.00',
    allocations: [],
    items: [],
  }));
  for (const item of items) {
    const shares = assignments.map((part, position) => {
      const units = part.get(item.orderItemId) ?? 0n;
      const numerator = item.cents * units;
      return { position, units, cents: numerator / item.units, remainder: numerator % item.units };
    });
    if (shares.reduce((sum, share) => sum + share.units, 0n) !== item.units)
      throw new Error('Cantitățile alocate trebuie să însumeze exact cantitatea articolului.');
    let remaining = item.cents - shares.reduce((sum, share) => sum + share.cents, 0n);
    // Largest remainder; equal remainders are resolved by the displayed part position.
    const ranked = [...shares].sort((a, b) =>
      a.remainder === b.remainder ? a.position - b.position : a.remainder > b.remainder ? -1 : 1,
    );
    for (const share of ranked) {
      if (remaining === 0n) break;
      share.cents++;
      remaining--;
    }
    for (const share of shares) {
      if (share.units === 0n) continue;
      parts[share.position]!.items.push({
        orderId: item.orderId,
        orderItemId: item.orderItemId,
        quantity: decimalString(share.units, 3),
        amount: decimalString(share.cents, 2),
      });
    }
  }
  for (const part of parts) {
    const byOrder = new Map<string, bigint>();
    for (const item of part.items)
      byOrder.set(item.orderId, (byOrder.get(item.orderId) ?? 0n) + decimalUnits(item.amount, 2));
    const amount = [...byOrder.values()].reduce((sum, value) => sum + value, 0n);
    if (amount <= 0n) throw new Error('Fiecare parte trebuie să aibă o sumă pozitivă.');
    part.amount = decimalString(amount, 2);
    part.allocations = [...byOrder.entries()]
      .filter(([, cents]) => cents > 0n)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([orderId, cents]) => ({ orderId, amount: decimalString(cents, 2) }));
  }
  return { total: decimalString(total, 2), parts };
}
