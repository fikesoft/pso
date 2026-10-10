import { z } from 'zod';
import { idSchema } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { assert } from '../../../shared/lib/http';
import { TIMELINE_SOURCES } from '../config/timeline.constants';
import type {
  TimelineAnchor,
  TimelineRecord,
  TimelineScope,
  TimelineSource,
} from './timeline.types';

export const timelineQuerySchema = z
  .object({ cursor: z.string().min(1).max(512).optional() })
  .strict();
const cursorSchema = z
  .object({ orderId: idSchema, source: z.enum(TIMELINE_SOURCES), id: idSchema })
  .strict();

export function decodeTimelineCursor(value: string, orderId: string) {
  try {
    const decoded = Buffer.from(value, 'base64url');
    assert(decoded.toString('base64url') === value, 400, 'Cursor invalid');
    const cursor = cursorSchema.parse(JSON.parse(decoded.toString('utf8')));
    assert(cursor.orderId === orderId, 400, 'Cursor invalid');
    return cursor;
  } catch {
    assert(false, 400, 'Cursorul nu este valid pentru cronologia comenzii');
  }
}

export function encodeTimelineCursor(orderId: string, record: TimelineRecord) {
  const [source, id] = record.id.split(':');
  return Buffer.from(JSON.stringify({ orderId, source, id })).toString('base64url');
}

export async function resolveTimelineCursor(
  tx: TenantTransaction,
  scope: TimelineScope,
  value?: string,
): Promise<TimelineAnchor | null> {
  if (!value) return null;
  const cursor = decodeTimelineCursor(value, scope.orderId)!;
  const { orderId, ...tenant } = scope;
  const where = { ...tenant, id: cursor.id };
  const record =
    cursor.source === 'event'
      ? await tx.orderStatusEvent.findFirst({
          where: { ...where, orderId, kind: { in: ['ORDER', 'KITCHEN', 'PAYMENT', 'DELIVERY'] } },
          select: { createdAt: true },
        })
      : cursor.source === 'audit'
        ? await tx.auditEvent.findFirst({
            where: {
              ...where,
              targetId: orderId,
              targetType: 'ORDER',
              action: 'orders.draft.updated',
              outcome: 'SUCCESS',
              actorUserId: { not: null },
            },
            select: { createdAt: true },
          })
        : cursor.source === 'payment'
          ? await tx.payment.findFirst({
              where: { ...where, orderId, checkoutId: { not: null } },
              select: { createdAt: true },
            })
          : await tx.checkout.findFirst({
              where: { ...where, orderId, mode: 'DEMO' },
              select: { createdAt: true },
            });
  assert(record, 400, 'Cursorul nu aparține cronologiei comenzii');
  return { source: cursor.source, id: cursor.id, createdAt: record.createdAt };
}

export function timelineWindow(source: TimelineSource, anchor: TimelineAnchor | null) {
  if (!anchor) return {};
  const older = { createdAt: { lt: anchor.createdAt } };
  if (source > anchor.source) return older;
  return {
    OR: [
      older,
      {
        createdAt: anchor.createdAt,
        ...(source === anchor.source ? { id: { lt: anchor.id } } : {}),
      },
    ],
  };
}

export function compareTimelineRecords(a: TimelineRecord, b: TimelineRecord) {
  return (
    b.createdAt.getTime() - a.createdAt.getTime() || (a.id === b.id ? 0 : a.id < b.id ? 1 : -1)
  );
}
