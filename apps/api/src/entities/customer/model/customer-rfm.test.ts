import { expect, it } from 'vitest';
import { calculateCustomerRfm } from './customer-rfm';
import { createCustomerAnalytics } from './customer-analytics';
import { customerRfmSchema } from '@pos/contracts';

const asOf = '2026-10-04T12:00:00.000Z';
const empty = createCustomerAnalytics(new Date(asOf), []).result();
function report(days: number, frequency = 1, monetary = '0.00') {
  return calculateCustomerRfm(
    {
      ...empty,
      completedOrders: frequency,
      totalSpent: monetary,
      lastOrderAt: new Date(Date.parse(asOf) - days * 86_400_000).toISOString(),
    },
    asOf,
  );
}
it('absența istoricului nu înseamnă client pierdut sau scor minim', () => {
  expect(calculateCustomerRfm(empty, asOf)).toEqual({
    policyVersion: 'RFM_V1',
    recencyDays: null,
    frequency: 0,
    monetary: '0.00',
    scores: null,
    segments: [],
  });
});
it.each([
  [0, 5],
  [7, 5],
  [7.99, 5],
  [8, 4],
  [30, 4],
  [31, 3],
  [60, 3],
  [61, 2],
  [90, 2],
  [91, 1],
])('pragul recenței la %s zile complete are scor %s', (days, score) => {
  expect(report(days).scores?.recency).toBe(score);
});
it.each([
  [1, 1],
  [2, 2],
  [3, 3],
  [4, 3],
  [5, 4],
  [9, 4],
  [10, 5],
])('pragul frecvenței %s are scor %s', (frequency, score) => {
  expect(report(0, frequency).scores?.frequency).toBe(score);
});
it.each([
  ['99.99', 1],
  ['100.00', 2],
  ['499.99', 2],
  ['500.00', 3],
  ['999.99', 3],
  ['1000.00', 4],
  ['2499.99', 4],
  ['2500.00', 5],
  ['100000000000000000.00', 5],
])('pragul monetar exact %s are scor %s', (monetary, score) => {
  expect(report(0, 1, monetary).scores?.monetary).toBe(score);
});
it('segmentele se suprapun explicit și păstrează distincția risc/pierdut/nou', () => {
  expect(report(30, 5, '1000.00').segments).toEqual(['VIP', 'LOYAL', 'HIGH_SPENDERS', 'FREQUENT']);
  expect(report(31, 5, '999.99').segments).toEqual(['LOYAL', 'FREQUENT']);
  expect(report(30).segments).toEqual(['NEW']);
  expect(report(31).segments).toEqual([]);
  expect(report(60).segments).toEqual([]);
  expect(report(61).segments).toEqual(['AT_RISK']);
  expect(report(90).segments).toEqual(['AT_RISK']);
  expect(report(91).segments).toEqual(['LOST']);
  expect(customerRfmSchema.safeParse(report(0, 5, '1000.00')).success).toBe(true);
});
it('rambursarea reduce scorul monetar fără a rescrie frecvența sau recența', () => {
  const before = report(7, 5, '1000.00'),
    after = report(7, 5, '999.99');
  expect(before.segments).toContain('VIP');
  expect(after.segments).not.toContain('VIP');
  expect(after.scores).toEqual({ recency: 5, frequency: 4, monetary: 3 });
});
it('datele din viitor sau lipsă nu produc o segmentare inventată', () => {
  expect(() => report(-1)).toThrow();
  expect(() => calculateCustomerRfm({ ...empty, completedOrders: 1 }, asOf)).toThrow();
});
