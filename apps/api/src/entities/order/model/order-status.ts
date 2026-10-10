import type { OrderStatus } from '@pos/contracts';
import type { Prisma } from '@pos/db';
import { ORDER_STATUSES } from '@pos/contracts/orders';

export function effectiveKitchenStatus(status: string) {
  return status === 'NEW' ? 'QUEUED' : status;
}

export function effectiveOrderStatus(status: string, kitchenStatus: string): OrderStatus {
  if (status === 'OPEN') {
    if (kitchenStatus === 'READY') return 'READY';
    if (kitchenStatus === 'PREPARING' || kitchenStatus === 'PARTIALLY_READY') return 'IN_PROGRESS';
    return 'CONFIRMED';
  }
  const known = ORDER_STATUSES.find((candidate) => candidate === status);
  if (!known) throw new Error('Unknown persisted order stage');
  return known;
}

export function canPrepareKitchen(current: string, next: string) {
  const status = effectiveKitchenStatus(current);
  return (
    (status === 'QUEUED' && next === 'PREPARING') ||
    (status === 'PREPARING' && (next === 'PARTIALLY_READY' || next === 'READY')) ||
    (status === 'PARTIALLY_READY' && next === 'READY')
  );
}

export function orderStatusFilter(status: OrderStatus): Prisma.OrderWhereInput {
  const legacyKitchen =
    status === 'CONFIRMED'
      ? ['NEW', 'QUEUED']
      : status === 'IN_PROGRESS'
        ? ['PREPARING', 'PARTIALLY_READY']
        : status === 'READY'
          ? ['READY']
          : [];
  return legacyKitchen.length
    ? { OR: [{ status }, { status: 'OPEN', kitchenStatus: { in: legacyKitchen } }] }
    : { status };
}
