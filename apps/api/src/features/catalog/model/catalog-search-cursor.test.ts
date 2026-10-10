import { describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@pos/db';
import { encodeCatalogCursor, readCatalogCursor } from './catalog-search-cursor';
import type { CatalogCursorContext } from './catalog-search.types';

vi.mock('../../../shared/config', () => ({ config: { MFA_ENCRYPTION_KEY: 'a'.repeat(64) } }));
const context: CatalogCursorContext = {
  organizationId: 'organization',
  userId: 'actor',
  locationId: 'location',
  q: 'Needle',
};
const id = 'abcdef00-0000-4000-8000-000000000001';
describe('cursorul catalogului', () => {
  it('autentifică scope-ul și filtrele, fără să lege mărimea paginii', async () => {
    const tx = {} as TenantTransaction;
    const cursor = encodeCatalogCursor(context, id);
    expect(await readCatalogCursor(tx, { ...context, cursor, limit: 1 })).toBe(id);
    for (const changed of [
      { organizationId: 'other' },
      { userId: 'other' },
      { locationId: 'other' },
      { q: 'other' },
      { categoryId: id },
      { includeArchived: true },
    ])
      await expect(readCatalogCursor(tx, { ...context, ...changed, cursor })).rejects.toMatchObject(
        { status: 400 },
      );
    await expect(readCatalogCursor(tx, { ...context, cursor: `${cursor}=` })).rejects.toMatchObject(
      { status: 400 },
    );
  });
  it('permite UUID vechi numai pentru ancore vizibile fără căutare', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id });
    const tx = { product: { findFirst } } as unknown as TenantTransaction;
    expect(await readCatalogCursor(tx, { ...context, q: undefined, cursor: id })).toBe(id);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id, organizationId: context.organizationId, status: 'ACTIVE' },
      select: { id: true },
    });
    await expect(readCatalogCursor(tx, { ...context, cursor: id })).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      readCatalogCursor(tx, { ...context, q: undefined, categoryId: id, cursor: id }),
    ).rejects.toMatchObject({ status: 400 });
    findFirst.mockResolvedValue(null);
    await expect(
      readCatalogCursor(tx, { ...context, q: undefined, cursor: id }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
