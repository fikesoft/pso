import type { OrderTimelineResponse } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { TIMELINE_PAGE_SIZE } from '../config/timeline.constants';
import {
  compareTimelineRecords,
  encodeTimelineCursor,
  resolveTimelineCursor,
} from './timeline-cursor';
import { timelineOtherEvents } from './timeline-other-events';
import { timelineStatusEvents } from './timeline-status-events';
import type { TimelineScope } from './timeline.types';

export async function readTimeline(
  tx: TenantTransaction,
  scope: TimelineScope,
  cursor?: string,
): Promise<OrderTimelineResponse> {
  const anchor = await resolveTimelineCursor(tx, scope, cursor);
  const [status, other] = await Promise.all([
    timelineStatusEvents(tx, scope, anchor),
    timelineOtherEvents(tx, scope, anchor),
  ]);
  const rows = [...status, ...other].sort(compareTimelineRecords);
  const page = rows.slice(0, TIMELINE_PAGE_SIZE);
  const users = await tx.companyUser.findMany({
    where: {
      organizationId: scope.organizationId,
      id: {
        in: page
          .filter((entry) => entry.actorNameSource === 'UNKNOWN')
          .map((entry) => entry.actorUserId),
      },
    },
    select: { id: true, displayName: true },
  });
  return {
    events: page.map((entry) => {
      const currentName = users.find((user) => user.id === entry.actorUserId)?.displayName;
      return {
        ...entry,
        ...(entry.actorNameSource === 'UNKNOWN' && currentName
          ? { actorDisplayName: currentName, actorNameSource: 'CURRENT' as const }
          : {}),
        createdAt: entry.createdAt.toISOString(),
      };
    }),
    nextCursor:
      rows.length > TIMELINE_PAGE_SIZE ? encodeTimelineCursor(scope.orderId, page.at(-1)!) : null,
  };
}
