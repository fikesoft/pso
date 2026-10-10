import type { TenantTransaction } from '@pos/db';
import { TIMELINE_PAGE_SIZE } from '../config/timeline.constants';
import { timelineWindow } from './timeline-cursor';
import type { TimelineAnchor, TimelineRecord, TimelineScope } from './timeline.types';

export async function timelineOtherEvents(
  tx: TenantTransaction,
  scope: TimelineScope,
  anchor: TimelineAnchor | null,
): Promise<TimelineRecord[]> {
  const { orderId, ...tenant } = scope;
  const page = {
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: TIMELINE_PAGE_SIZE + 1,
  };
  const [audits, payments, demos] = await Promise.all([
    tx.auditEvent.findMany({
      where: {
        ...tenant,
        targetId: orderId,
        targetType: 'ORDER',
        action: 'orders.draft.updated',
        outcome: 'SUCCESS',
        actorUserId: { not: null },
        ...timelineWindow('audit', anchor),
      },
      ...page,
    }),
    tx.payment.findMany({
      where: { ...scope, checkoutId: { not: null }, ...timelineWindow('payment', anchor) },
      ...page,
    }),
    tx.checkout.findMany({
      where: { ...scope, mode: 'DEMO', ...timelineWindow('checkout', anchor) },
      ...page,
    }),
  ]);
  const checkouts = await tx.checkout.findMany({
    where: {
      ...scope,
      id: { in: payments.flatMap((payment) => (payment.checkoutId ? [payment.checkoutId] : [])) },
    },
  });
  const result: TimelineRecord[] = audits.map((audit) => ({
    id: `audit:${audit.id}`,
    kind: 'ORDER',
    action: 'DRAFT_UPDATED',
    resourceType: 'ORDER',
    resourceId: orderId,
    locationId: scope.locationId,
    actorUserId: audit.actorUserId!,
    actorDisplayName: audit.actorDisplayName,
    actorNameSource: audit.actorDisplayName === null ? 'UNKNOWN' : 'SNAPSHOT',
    terminalId: null,
    fromStatus: 'DRAFT',
    toStatus: 'DRAFT',
    orderVersion: audit.orderVersion,
    reason: null,
    createdAt: audit.createdAt,
    metadata: {},
  }));
  for (const payment of payments) {
    const checkout = checkouts.find((candidate) => candidate.id === payment.checkoutId);
    result.push({
      id: `payment:${payment.id}`,
      kind: 'PAYMENT',
      action: 'PAYMENT_COLLECTED',
      resourceType: 'PAYMENT',
      resourceId: payment.id,
      locationId: payment.locationId,
      actorUserId: payment.confirmedByUserId,
      actorDisplayName: checkout?.cashierName ?? null,
      actorNameSource: checkout?.cashierName ? 'SNAPSHOT' : 'UNKNOWN',
      terminalId: null,
      fromStatus: null,
      toStatus: null,
      orderVersion: null,
      reason: null,
      createdAt: payment.createdAt,
      metadata: {
        amount: payment.amount.toFixed(2),
        currency: payment.currency,
        method: payment.method,
        checkoutMode: 'MANUAL',
      },
    });
  }
  for (const checkout of demos)
    result.push({
      id: `checkout:${checkout.id}`,
      kind: 'ORDER',
      action: 'DEMO_CHECKOUT',
      resourceType: 'CHECKOUT',
      resourceId: checkout.id,
      locationId: checkout.locationId,
      actorUserId: checkout.createdByUserId,
      actorDisplayName: checkout.cashierName,
      actorNameSource: 'SNAPSHOT',
      terminalId: null,
      fromStatus: null,
      toStatus: null,
      orderVersion: null,
      reason: null,
      createdAt: checkout.createdAt,
      metadata: { checkoutMode: 'DEMO' },
    });
  return result;
}
