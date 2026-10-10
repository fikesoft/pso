import { describe, expect, it } from 'vitest';
import { discrepancyQuery } from './discrepancy-query';
const location = '11111111-1111-4111-8111-111111111111';
describe('discrepancy applied civil query', () => {
  it('requires explicit valid dates and rejects reverse and 367-day ranges', () => {
    for (const [closedFrom, closedTo] of [
      ['', ''],
      ['2024-02-30', '2024-03-01'],
      ['2024-04-02', '2024-04-01'],
      ['2024-01-01', '2025-01-01'],
    ])
      expect(
        discrepancyQuery(location, { closedFrom, closedTo, discrepancy: 'ALL', registerId: '' })
          .success,
      ).toBe(false);
  });
  it('keeps civil values intact across leap years and daylight saving boundaries', () => {
    for (const [closedFrom, closedTo] of [
      ['2024-01-01', '2024-12-31'],
      ['2026-03-28', '2026-03-30'],
      ['9998-12-31', '9998-12-31'],
    ]) {
      const result = discrepancyQuery(location, {
        closedFrom,
        closedTo,
        discrepancy: 'NONZERO',
        registerId: '',
      });
      expect(result.success).toBe(true);
      if (result.success)
        expect(result.data).toMatchObject({
          locationId: location,
          closedFrom,
          closedTo,
          discrepancy: 'NONZERO',
        });
    }
  });
  it('includes an explicit register filter without changing the date interval', () => {
    const registerId = '22222222-2222-4222-8222-222222222222';
    const result = discrepancyQuery(location, {
      closedFrom: '2026-09-01',
      closedTo: '2026-09-27',
      discrepancy: 'ALL',
      registerId,
    });
    expect(result.success && result.data.registerId).toBe(registerId);
  });
});
