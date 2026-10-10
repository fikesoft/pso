import { expect, it } from 'vitest';
import { createMenuScheduleSchema, updateMenuScheduleSchema } from './menu-schedules.schema';

const id = '11111111-1111-4111-8111-111111111111';
const schedule = {
  locationId: id,
  requestKey: id,
  name: 'Mic dejun',
  eventName: null,
  weekdays: [1, 2, 3, 4, 5],
  startMinute: 420,
  endMinute: 660,
  startsOn: null,
  endsOn: null,
  productIds: [id],
};

it('accepts recurring, overnight, full-day and bounded special event schedules', () => {
  for (const change of [
    {},
    { startMinute: 1320, endMinute: 120 },
    { startMinute: 0, endMinute: 1440 },
    { eventName: 'Eveniment local', startsOn: '2026-09-26', endsOn: '2026-09-26' },
  ])
    expect(createMenuScheduleSchema.safeParse({ ...schedule, ...change }).success).toBe(true);
});

it('rejects ambiguous windows, duplicate entries, invalid ranges and unbounded special events', () => {
  for (const change of [
    { startMinute: 420, endMinute: 420 },
    { endMinute: 1441 },
    { startMinute: -1 },
    { weekdays: [] },
    { weekdays: [1, 1] },
    { weekdays: [7] },
    { productIds: [] },
    { productIds: [id, id] },
    { startsOn: '2026-10-01', endsOn: '2026-09-01' },
    { startsOn: '2026-02-30' },
    { eventName: 'Eveniment' },
  ])
    expect(createMenuScheduleSchema.safeParse({ ...schedule, ...change }).success).toBe(false);
  const { locationId: _locationId, requestKey: _requestKey, ...fields } = schedule;
  expect(updateMenuScheduleSchema.safeParse({ ...fields, status: 'ACTIVE' }).success).toBe(false);
  expect(
    updateMenuScheduleSchema.safeParse({ ...fields, status: 'ACTIVE', version: 1 }).success,
  ).toBe(true);
});
