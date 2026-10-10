import { describe, expect, it } from 'vitest';
import {
  compareTimelineRecords,
  decodeTimelineCursor,
  encodeTimelineCursor,
  timelineWindow,
} from './timeline-cursor';
import type { TimelineRecord } from './timeline.types';

describe('cursorul cronologiei', () => {
  const orderId = '00000000-0000-4000-8000-000000000001';
  const id = '00000000-0000-4000-8000-000000000002';
  it('acceptă doar un cursor canonic, limitat la comandă și la sursele cunoscute', () => {
    const record = { id: `event:${id}` } as TimelineRecord;
    const cursor = encodeTimelineCursor(orderId, record);
    expect(decodeTimelineCursor(cursor, orderId)).toEqual({ orderId, source: 'event', id });
    for (const invalid of [
      `${cursor}=`,
      '%%%invalid',
      '',
      Buffer.from(
        JSON.stringify({ orderId, source: 'audit', id, createdAt: '2000-01-01' }),
      ).toString('base64url'),
      Buffer.from(JSON.stringify({ orderId, source: 'unknown', id })).toString('base64url'),
      Buffer.from(JSON.stringify({ orderId, source: 'event', id: 'bad' })).toString('base64url'),
    ])
      expect(() => decodeTimelineCursor(invalid, orderId)).toThrow();
    expect(() => decodeTimelineCursor(cursor, id)).toThrow();
  });
  it('include exact sufixul surselor și ID-urilor când timestampurile sunt egale', () => {
    const createdAt = new Date('2026-09-26T12:00:00.000Z');
    const anchor = { source: 'event' as const, id, createdAt };
    expect(timelineWindow('payment', anchor)).toEqual({ createdAt: { lt: createdAt } });
    expect(timelineWindow('event', anchor)).toEqual({
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
    });
    expect(timelineWindow('audit', anchor)).toEqual({
      OR: [{ createdAt: { lt: createdAt } }, { createdAt }],
    });
    const records = ['audit:z', 'event:a', 'event:z', 'payment:a', 'checkout:a'].map(
      (id) => ({ id, createdAt }) as TimelineRecord,
    );
    expect(records.sort(compareTimelineRecords).map((row) => row.id)).toEqual([
      'payment:a',
      'event:z',
      'event:a',
      'checkout:a',
      'audit:z',
    ]);
  });
});
