import { describe, expect, it } from 'vitest';
import { businessDateSchema, businessTimestampSchema } from './business-date.schema';

describe('business dates supported by PostgreSQL day boundaries', () => {
  it('accepts inclusive supported years and rejects year zero and the unbounded upper year', () => {
    for (const value of ['0001-01-01', '9998-12-31'])
      expect(businessDateSchema.safeParse(value).success).toBe(true);
    for (const value of ['0000-01-01', '9999-12-31', '2026-02-30'])
      expect(businessDateSchema.safeParse(value).success).toBe(false);
  });
  it('checks both written and UTC years for offset-aware timestamp filters', () => {
    expect(businessTimestampSchema.safeParse('0001-01-01T01:00:00+01:00').success).toBe(true);
    expect(businessTimestampSchema.safeParse('9998-12-31T23:00:00Z').success).toBe(true);
    for (const value of [
      '0000-01-01T00:00:00Z',
      '9999-12-31T00:00:00Z',
      '0001-01-01T00:00:00+01:00',
      '9998-12-31T23:30:00-01:00',
    ])
      expect(businessTimestampSchema.safeParse(value).success).toBe(false);
  });
});
