import { expect, it } from 'vitest';
import { formatKitchenDuration, kitchenElapsed, kitchenServerNow } from './kitchen-time';

it('advances from server time using monotonic elapsed time, including a delayed callback', () => {
  const server = '2026-10-04T09:00:00.000Z';
  expect(kitchenServerNow(server, 100, 1350)).toBe(Date.parse(server) + 1250);
  expect(kitchenServerNow(server, 100, 120100)).toBe(Date.parse(server) + 120000);
  expect(kitchenServerNow(server, 100, 50)).toBe(Date.parse(server));
});
it('freezes completed preparation regardless of subsequent server samples', () => {
  const start = '2026-10-04T09:00:00.000Z';
  const completed = '2026-10-04T09:12:34.000Z';
  expect(kitchenElapsed(start, completed, Date.parse('2026-10-04T10:00:00Z'))).toBe(754);
  expect(kitchenElapsed(start, completed, Date.parse('2026-10-05T10:00:00Z'))).toBe(754);
  expect(kitchenElapsed(start, undefined, Date.parse(completed))).toBe(754);
});
it('does not invent elapsed time for invalid samples or show a negative duration', () => {
  expect(kitchenServerNow('invalid', 0, 1)).toBeUndefined();
  expect(kitchenServerNow('2026-10-04T09:00:00Z', NaN, 1)).toBeUndefined();
  expect(kitchenElapsed('invalid', undefined, 100)).toBeUndefined();
  expect(kitchenElapsed('2026-10-04T09:00:00Z', undefined)).toBeUndefined();
  expect(kitchenElapsed('2026-10-04T09:00:00Z', undefined, 0)).toBe(0);
});
it('formats durations across minute, hour and day boundaries', () => {
  expect(formatKitchenDuration(0)).toBe('00:00');
  expect(formatKitchenDuration(59)).toBe('00:59');
  expect(formatKitchenDuration(60)).toBe('01:00');
  expect(formatKitchenDuration(3599)).toBe('59:59');
  expect(formatKitchenDuration(3600)).toBe('01:00:00');
  expect(formatKitchenDuration(90061)).toBe('25:01:01');
});
