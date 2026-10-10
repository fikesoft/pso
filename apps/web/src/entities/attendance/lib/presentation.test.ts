import { describe, expect, it } from 'vitest';
import { defaultAttendancePeriod } from './presentation';

describe('perioada implicită după ziua locală', () => {
  it('include ziua curentă din Chișinău când UTC este încă în ziua precedentă', () => {
    expect(defaultAttendancePeriod('Europe/Chisinau', new Date('2026-09-25T22:15:00Z'))).toEqual({
      from: '2026-08-28',
      to: '2026-09-26',
    });
  });
  it('păstrează ziua precedentă într-un fus din vestul UTC', () => {
    expect(defaultAttendancePeriod('America/New_York', new Date('2026-01-01T02:00:00Z'))).toEqual({
      from: '2025-12-02',
      to: '2025-12-31',
    });
  });
  it('numără date calendaristice peste schimbarea orei', () => {
    expect(defaultAttendancePeriod('Europe/Chisinau', new Date('2026-03-30T00:15:00Z'))).toEqual({
      from: '2026-03-01',
      to: '2026-03-30',
    });
  });
});
