import type { TenantTransaction } from '@pos/db';
import { assert } from '../../../shared/lib/http';
import { TIMELINE_PAGE_SIZE } from '../config/timeline.constants';
import { timelineWindow } from './timeline-cursor';
import type { TimelineAnchor, TimelineRecord, TimelineScope } from './timeline.types';

export async function timelineStatusEvents(
  tx: TenantTransaction,
  scope: TimelineScope,
  anchor: TimelineAnchor | null,
): Promise<TimelineRecord[]> {
  const events = await tx.orderStatusEvent.findMany({
    where: {
      ...scope,
      kind: { in: ['ORDER', 'KITCHEN', 'PAYMENT', 'DELIVERY', 'PACKING'] },
      ...timelineWindow('event', anchor),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: TIMELINE_PAGE_SIZE + 1,
  });
  const requestKeys = events.flatMap((event) => (event.requestKey ? [event.requestKey] : []));
  const [payments, deliveries] = await Promise.all([
    tx.paymentOperation.findMany({ where: { ...scope, requestKey: { in: requestKeys } } }),
    tx.deliveryOperation.findMany({ where: { ...scope, requestKey: { in: requestKeys } } }),
  ]);
  const operationIds = payments.map((operation) => operation.id);
  const [collections, refunds] = await Promise.all([
    tx.payment.findMany({
      where: { ...scope, operationId: { in: operationIds } },
      select: { operationId: true, method: true },
    }),
    tx.paymentRefund.findMany({
      where: { ...scope, operationId: { in: operationIds } },
      select: { operationId: true, method: true },
    }),
  ]);
  return events.map((event) => {
    const record: TimelineRecord = {
      id: `event:${event.id}`,
      kind: event.kind as TimelineRecord['kind'],
      action:
        event.kind === 'ORDER' && event.fromStatus === null && event.toStatus === 'DRAFT'
          ? 'ORDER_CREATED'
          : `${event.kind}_STATUS_CHANGED`,
      resourceType: 'ORDER',
      resourceId: scope.orderId,
      locationId: event.locationId,
      actorUserId: event.actorUserId,
      actorDisplayName: event.actorDisplayName,
      actorNameSource: event.actorDisplayName === null ? 'UNKNOWN' : 'SNAPSHOT',
      terminalId: null,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      orderVersion: event.orderVersion,
      reason: event.reason,
      createdAt: event.createdAt,
      metadata: {},
    };
    if (event.kind === 'PAYMENT') {
      const operation = payments.find((candidate) => candidate.requestKey === event.requestKey);
      assert(operation, 500, 'Evenimentul financiar nu are operațiunea asociată');
      const methods = [
        ...new Set(
          [...collections, ...refunds]
            .filter((line) => line.operationId === operation.id)
            .map((line) => line.method),
        ),
      ];
      record.action = operation.kind === 'COLLECT' ? 'PAYMENT_COLLECTED' : 'PAYMENT_REFUNDED';
      record.resourceType = 'PAYMENT_OPERATION';
      record.resourceId = operation.id;
      record.metadata = {
        amount: operation.amount.toFixed(2),
        currency: operation.currency,
        ...(methods.length === 1 ? { method: methods[0] } : {}),
      };
    }
    if (event.kind === 'DELIVERY') {
      const operation = deliveries.find((candidate) => candidate.requestKey === event.requestKey);
      assert(operation, 500, 'Evenimentul livrării nu are operațiunea asociată');
      record.action = 'DELIVERY_UPDATED';
      record.resourceType = 'DELIVERY_OPERATION';
      record.resourceId = operation.id;
      record.metadata = {
        ...(operation.courierUserId ? { courierUserId: operation.courierUserId } : {}),
        ...(operation.courierName ? { courierName: operation.courierName } : {}),
      };
    }
    return record;
  });
}
