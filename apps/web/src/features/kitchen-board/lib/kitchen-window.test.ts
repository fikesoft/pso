import { describe, expect, it, vi } from 'vitest';
import type { KitchenTicket } from '@pos/contracts';
import { readKitchenWindow } from './kitchen-window';
function ticket(id: string, version = 1) {
  return { id, version } as KitchenTicket;
}
describe('live kitchen window', () => {
  it('preserves page depth across sparse pages and restarts from a fresh cursor', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        tickets: [ticket('new')],
        nextCursor: 'fresh-1',
        serverTime: '2026-10-04T09:00:00Z',
        receivedAt: 100,
      })
      .mockResolvedValueOnce({ tickets: [], nextCursor: 'fresh-2' })
      .mockResolvedValueOnce({
        tickets: [ticket('old')],
        nextCursor: 'fresh-3',
        serverTime: '2026-10-04T09:00:03Z',
        receivedAt: 3100,
      });
    const result = await readKitchenWindow(load, 3);
    expect(load.mock.calls).toEqual([[], ['fresh-1'], ['fresh-2']]);
    expect(result.tickets.map((value) => value.id)).toEqual(['new', 'old']);
    expect(result.nextCursor).toBe('fresh-3');
    expect(result.serverTime).toBe('2026-10-04T09:00:03Z');
    expect(result.receivedAt).toBe(3100);
  });
  it('never fetches past the loaded window or downgrades a duplicate ticket', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        tickets: [ticket('a', 5)],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        tickets: [ticket('a', 4)],
        nextCursor: 'unused',
      });
    const result = await readKitchenWindow(load, 2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.tickets).toEqual([ticket('a', 5)]);
  });
  it('stops on exhausted data rather than replaying obsolete cursors', async () => {
    const load = vi.fn().mockResolvedValue({ tickets: [], nextCursor: null });
    expect((await readKitchenWindow(load, 4)).tickets).toEqual([]);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
