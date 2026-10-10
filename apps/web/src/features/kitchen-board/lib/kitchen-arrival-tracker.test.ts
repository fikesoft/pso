import { expect, it } from 'vitest';
import { createKitchenArrivalTracker } from './kitchen-arrival-tracker';

it('treats the initial history as baseline, deduplicates invalidations and groups a reconnect burst', () => {
  const tracker = createKitchenArrivalTracker();
  expect(tracker.observe('51')).toBe(false);
  expect(tracker.observe('51')).toBe(false);
  expect(tracker.observe('52')).toBe(true);
  expect(tracker.observe('52')).toBe(false);
  expect(tracker.observe('57')).toBe(true);
  expect(tracker.observe('57')).toBe(false);
});
it('detects the first ticket in an empty kitchen and resets independently for a new scope', () => {
  const tracker = createKitchenArrivalTracker();
  expect(tracker.observe('0')).toBe(false);
  expect(tracker.observe('1')).toBe(true);
  expect(createKitchenArrivalTracker().observe('1')).toBe(false);
});
it('does not lose precision or accept malformed revisions', () => {
  const tracker = createKitchenArrivalTracker();
  expect(tracker.observe('9007199254740992')).toBe(false);
  expect(tracker.observe('9007199254740993')).toBe(true);
  expect(() => tracker.observe('-1')).toThrow();
  expect(() => tracker.observe('1.5')).toThrow();
});
