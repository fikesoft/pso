import { describe, expect, it, vi } from 'vitest';
import type { Order } from '@pos/contracts';
import { readOrderSearchWindow } from './order-search-window';
function order(id: string, version = 1) {
  return { id, version } as Order;
}
describe('live order search window', () => {
  it('preserves page depth across sparse pages and restarts from a fresh cursor', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        orders: [order('new')],
        nextCursor: 'fresh-1',
        timezone: 'Europe/Chisinau',
      })
      .mockResolvedValueOnce({ orders: [], nextCursor: 'fresh-2', timezone: 'Europe/Chisinau' })
      .mockResolvedValueOnce({
        orders: [order('old')],
        nextCursor: 'fresh-3',
        timezone: 'Europe/Chisinau',
      });
    const result = await readOrderSearchWindow(load, 3);
    expect(load.mock.calls).toEqual([[], ['fresh-1'], ['fresh-2']]);
    expect(result.orders.map((value) => value.id)).toEqual(['new', 'old']);
    expect(result.pageDepth).toBe(3);
    expect(result.nextCursor).toBe('fresh-3');
  });
  it('never fetches past the loaded window or downgrades a duplicate order', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        orders: [order('a', 5)],
        nextCursor: 'next',
        timezone: 'Europe/Chisinau',
      })
      .mockResolvedValueOnce({
        orders: [order('a', 4)],
        nextCursor: 'unused',
        timezone: 'Europe/Chisinau',
      });
    const result = await readOrderSearchWindow(load, 2);
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.orders).toEqual([order('a', 5)]);
  });
  it('stops on exhausted data rather than replaying obsolete cursors', async () => {
    const load = vi
      .fn()
      .mockResolvedValue({ orders: [], nextCursor: null, timezone: 'Europe/Chisinau' });
    expect((await readOrderSearchWindow(load, 4)).pageDepth).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
