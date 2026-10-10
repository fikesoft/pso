import { describe, expect, it, vi } from 'vitest';
import type { CatalogProduct } from '@pos/contracts';
import { readCatalogWindow } from './catalog-window';
const product = (id: string, version = 1) => ({ id, version }) as CatalogProduct;
describe('catalog search window', () => {
  it('starts with a fresh cursor and counts sparse pages toward the requested depth', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ categories: [], products: [product('new')], nextCursor: 'fresh' })
      .mockResolvedValueOnce({ categories: [], products: [], nextCursor: 'last' })
      .mockResolvedValueOnce({ categories: [], products: [product('old')], nextCursor: 'unread' });
    const result = await readCatalogWindow(load, 3);
    expect(load.mock.calls).toEqual([[], ['fresh'], ['last']]);
    expect(result.products.map((item) => item.id)).toEqual(['new', 'old']);
    expect(result.nextCursor).toBe('unread');
  });
  it('keeps the latest duplicate version and stops at the requested page bound', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce({ categories: [], products: [product('a', 4)], nextCursor: 'next' })
      .mockResolvedValueOnce({ categories: [], products: [product('a', 3)], nextCursor: 'unread' });
    expect((await readCatalogWindow(load, 2)).products).toEqual([product('a', 4)]);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('does not request nonexistent pages after exhaustion', async () => {
    const load = vi.fn().mockResolvedValue({ categories: [], products: [], nextCursor: null });
    await readCatalogWindow(load, 5);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
