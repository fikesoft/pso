import { expect, it } from 'vitest';
import type { MenuScheduleWindow } from '@pos/contracts';
import { localScheduleTime, scheduleMatches } from './schedule-window';

const breakfast: MenuScheduleWindow = {
  weekdays: [1, 2, 3, 4, 5],
  startMinute: 420,
  endMinute: 660,
  startsOn: null,
  endsOn: null,
};
const matches = (schedule: MenuScheduleWindow, instant: string, timezone = 'Europe/Chisinau') =>
  scheduleMatches(schedule, localScheduleTime(new Date(instant), timezone));

it('uses location-local weekdays and start-inclusive, end-exclusive windows', () => {
  expect(matches(breakfast, '2026-09-28T03:59:59Z')).toBe(false);
  expect(matches(breakfast, '2026-09-28T04:00:00Z')).toBe(true);
  expect(matches(breakfast, '2026-09-28T07:59:59Z')).toBe(true);
  expect(matches(breakfast, '2026-09-28T08:00:00Z')).toBe(false);
  expect(matches(breakfast, '2026-09-27T05:00:00Z')).toBe(false);
  expect(matches(breakfast, '2026-09-28T04:00:00Z', 'UTC')).toBe(false);
});

it('anchors overnight windows and event date boundaries to the opening local date', () => {
  const night = {
    ...breakfast,
    weekdays: [5],
    startMinute: 1320,
    endMinute: 120,
    startsOn: '2026-09-25',
    endsOn: '2026-09-25',
  };
  expect(matches(night, '2026-09-25T19:00:00Z')).toBe(true);
  expect(matches(night, '2026-09-25T22:59:59Z')).toBe(true);
  expect(matches(night, '2026-09-25T23:00:00Z')).toBe(false);
  expect(matches(night, '2026-09-26T19:00:00Z')).toBe(false);
  expect(matches(night, '2026-09-18T19:00:00Z')).toBe(false);
});

it('treats 00:00–24:00 as the full local calendar day', () => {
  const fullDay = {
    ...breakfast,
    weekdays: [0],
    startMinute: 0,
    endMinute: 1440,
    startsOn: '2026-09-27',
    endsOn: '2026-09-27',
  };
  expect(matches(fullDay, '2026-09-26T21:00:00Z')).toBe(true);
  expect(matches(fullDay, '2026-09-27T20:59:59Z')).toBe(true);
  expect(matches(fullDay, '2026-09-27T21:00:00Z')).toBe(false);
});

it('handles repeated fall-back minutes and skipped spring-forward minutes as local wall time', () => {
  const repeated = { ...breakfast, weekdays: [0], startMinute: 60, endMinute: 120 };
  expect(matches(repeated, '2025-11-02T05:30:00Z', 'America/New_York')).toBe(true);
  expect(matches(repeated, '2025-11-02T06:30:00Z', 'America/New_York')).toBe(true);
  const missing = { ...repeated, startMinute: 120, endMinute: 180 };
  expect(matches(missing, '2025-03-09T06:59:59Z', 'America/New_York')).toBe(false);
  expect(matches(missing, '2025-03-09T07:00:00Z', 'America/New_York')).toBe(false);
});
