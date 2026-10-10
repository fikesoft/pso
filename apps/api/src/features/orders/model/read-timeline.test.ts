import { expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@pos/db';
import { readTimeline } from './read-timeline';
import { timelineStatusEvents } from './timeline-status-events';
import type { TimelineRecord } from './timeline.types';

vi.mock('./timeline-status-events', () => ({ timelineStatusEvents: vi.fn() }));
vi.mock('./timeline-other-events', () => ({ timelineOtherEvents: vi.fn().mockResolvedValue([]) }));

it('nu prezintă numele curent ca snapshot istoric și păstrează necunoscutele explicite', async () => {
  const entry = (id: string, actorDisplayName: string | null): TimelineRecord => ({
    id: `event:${id}`,
    kind: 'ORDER',
    action: 'ORDER_CREATED',
    resourceType: 'ORDER',
    resourceId: 'order',
    locationId: 'location',
    actorUserId: id,
    actorDisplayName,
    actorNameSource: actorDisplayName === null ? 'UNKNOWN' : 'SNAPSHOT',
    terminalId: null,
    fromStatus: null,
    toStatus: 'DRAFT',
    orderVersion: null,
    reason: null,
    createdAt: new Date('2026-09-26T12:00:00.000Z'),
    metadata: {},
  });
  vi.mocked(timelineStatusEvents).mockResolvedValue([
    entry('snapshot', 'Numele capturat'),
    entry('historical', null),
    entry('unknown', null),
  ]);
  const tx = {
    companyUser: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'snapshot', displayName: 'Nume schimbat' },
        { id: 'historical', displayName: 'Numele curent' },
      ]),
    },
  } as unknown as TenantTransaction;
  const page = await readTimeline(tx, {
    organizationId: 'tenant',
    locationId: 'location',
    orderId: 'order',
  });
  expect(page.events.find((row) => row.actorUserId === 'snapshot')).toMatchObject({
    actorDisplayName: 'Numele capturat',
    actorNameSource: 'SNAPSHOT',
  });
  expect(page.events.find((row) => row.actorUserId === 'historical')).toMatchObject({
    actorDisplayName: 'Numele curent',
    actorNameSource: 'CURRENT',
    orderVersion: null,
  });
  expect(page.events.find((row) => row.actorUserId === 'unknown')).toMatchObject({
    actorDisplayName: null,
    actorNameSource: 'UNKNOWN',
    terminalId: null,
  });
});
