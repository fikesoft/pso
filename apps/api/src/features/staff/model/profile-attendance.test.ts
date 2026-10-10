import { describe, expect, it, vi } from 'vitest';
import { profileAttendance } from './profile-attendance';

describe('profile attendance range', () => {
  it('rejects more than 5000 overlapping shifts before computing a partial summary', async () => {
    const findMany = vi.fn().mockResolvedValue(Array.from({ length: 5001 }, (_, id) => ({ id })));
    const tx = { workShift: { findMany } } as unknown as Parameters<typeof profileAttendance>[0];
    const scope = {
      locationIds: ['location-id'],
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-10-01T00:00:00Z'),
    } as Parameters<typeof profileAttendance>[3];
    await expect(profileAttendance(tx, 'organization-id', 'user-id', scope)).rejects.toMatchObject({
      status: 413,
      message: 'Perioada produce prea multe ture. Alegeți un interval mai scurt.',
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5001 }));
  });
});
