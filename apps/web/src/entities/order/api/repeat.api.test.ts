import { expect, it, vi } from 'vitest';
import type { Api } from '../../../shared/api';
import { readOrderRepeat } from './repeat.api';
it('rejects a successful but wrong-source or wrong-location repeat response', async () => {
  for (const data of [
    {
      source: { id: 'other', status: 'COMPLETED' },
      locationId: 'location',
      lines: [],
      products: [],
    },
    { source: { id: 'order', status: 'COMPLETED' }, locationId: 'other', lines: [], products: [] },
  ]) {
    const api = { http: { post: vi.fn().mockResolvedValue({ data }) } } as unknown as Api;
    await expect(readOrderRepeat(api, 'order', 'location')).rejects.toThrow();
  }
});
it('only sends the target location to the read-only preview endpoint', async () => {
  const data = {
    source: { id: 'order', status: 'COMPLETED' },
    locationId: 'location',
    lines: [],
    products: [],
  };
  const post = vi.fn().mockResolvedValue({ data });
  expect(await readOrderRepeat({ http: { post } } as unknown as Api, 'order', 'location')).toBe(
    data,
  );
  expect(post).toHaveBeenCalledWith('/orders/order/repeat-preview', { locationId: 'location' });
});
