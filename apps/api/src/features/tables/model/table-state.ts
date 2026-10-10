import type { VisitOrderState, VisitState } from './table-state.types';
import type { TableVisitStatus } from '@pos/contracts';

/** Call with all scoped visit orders, before applying order-detail read permissions. */
export function deriveVisitState(
  visit: { status: TableVisitStatus; billRequested: boolean } | null,
  orders: readonly VisitOrderState[],
): VisitState {
  if (!visit || visit.status !== 'OPEN')
    return { state: 'FREE', hasReadyFood: false, hasWaitingFood: false };

  let hasReadyFood = false;
  let hasWaitingFood = false;
  for (const order of orders) {
    if (order.status === 'CANCELLED' || order.status === 'COMPLETED') continue;
    hasReadyFood ||= order.kitchenStatus === 'READY' || order.kitchenStatus === 'PARTIALLY_READY';
    hasWaitingFood ||=
      order.kitchenStatus === 'QUEUED' ||
      order.kitchenStatus === 'PREPARING' ||
      order.kitchenStatus === 'PARTIALLY_READY';
  }
  const state = visit.billRequested
    ? 'PAYMENT_REQUESTED'
    : hasReadyFood
      ? 'READY'
      : hasWaitingFood
        ? 'WAITING_FOOD'
        : 'OCCUPIED';
  return { state, hasReadyFood, hasWaitingFood };
}
