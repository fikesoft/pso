import { describe, expect, it } from 'vitest';
import { summarizeWorkShifts, workShiftDto } from './attendance-time';
import type { ShiftWithBreaks } from './attendance.types';

function entry(
  startedAt: string,
  endedAt: string | null,
  breaks: Array<[string, string | null]>,
): ShiftWithBreaks {
  return {
    shift: {
      id: 'shift',
      userId: 'user',
      locationId: 'location',
      status: endedAt ? 'ENDED' : 'ON_BREAK',
      version: 1,
      startedAt: new Date(startedAt),
      endedAt: endedAt ? new Date(endedAt) : null,
      roleSnapshot: null,
    },
    breaks: breaks.map(([start, end], index) => ({
      id: `break-${index}`,
      startedAt: new Date(start),
      endedAt: end ? new Date(end) : null,
    })),
  };
}

describe('pontaj pe zile locale', () => {
  it('împarte o tură peste miezul nopții fără dublarea pauzelor', () => {
    const shift = entry('2026-09-25T19:00:00Z', '2026-09-25T23:00:00Z', [
      ['2026-09-25T20:00:00Z', '2026-09-25T20:30:00Z'],
      ['2026-09-25T22:00:00Z', '2026-09-25T22:15:00Z'],
    ]);
    expect(
      summarizeWorkShifts([shift], {
        from: new Date('2026-09-24T21:00:00Z'),
        to: new Date('2026-09-26T21:00:00Z'),
        dayBoundaries: [
          new Date('2026-09-24T21:00:00Z'),
          new Date('2026-09-25T21:00:00Z'),
          new Date('2026-09-26T21:00:00Z'),
        ],
        now: new Date('2026-09-25T23:00:00Z'),
      }),
    ).toEqual({ daysWorked: 2, workedSeconds: 11_700, breakSeconds: 2700, shiftCount: 1 });
  });
  it('folosește orele reale ale zilelor de 23 și 25 de ore la schimbarea orei', () => {
    const spring = entry('2026-03-28T22:00:00Z', '2026-03-29T21:00:00Z', []);
    const autumn = entry('2026-10-24T21:00:00Z', '2026-10-25T22:00:00Z', []);
    const report = (shift: ShiftWithBreaks, from: string, to: string) =>
      summarizeWorkShifts([shift], {
        from: new Date(from),
        to: new Date(to),
        dayBoundaries: [new Date(from), new Date(to)],
        now: new Date(to),
      });
    expect(report(spring, '2026-03-28T22:00:00Z', '2026-03-29T21:00:00Z').workedSeconds).toBe(
      23 * 3600,
    );
    expect(report(autumn, '2026-10-24T21:00:00Z', '2026-10-25T22:00:00Z').workedSeconds).toBe(
      25 * 3600,
    );
  });
  it('arată pauza deschisă la timpul serverului și păstrează munca deja efectuată', () => {
    const shift = entry('2026-09-25T19:00:00Z', null, [['2026-09-25T20:00:00Z', null]]);
    expect(workShiftDto(shift.shift, shift.breaks, new Date('2026-09-25T21:00:00Z'))).toMatchObject(
      {
        status: 'ON_BREAK',
        endedAt: null,
        workedSeconds: 3600,
        breakSeconds: 3600,
        breaks: [{ endedAt: null }],
      },
    );
  });
});
