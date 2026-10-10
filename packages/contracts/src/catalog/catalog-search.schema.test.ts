import { describe, expect, it } from 'vitest';
import { catalogQuerySchema } from './catalog.schema';

const locationId = 'abcdef00-0000-4000-8000-000000000001';
describe('contractul căutării catalogului', () => {
  it('păstrează valorile implicite și tratează q gol ca lipsa filtrului', () => {
    expect(catalogQuerySchema.parse({ locationId })).toEqual({ locationId, limit: 50 });
    expect(catalogQuerySchema.parse({ locationId, q: '   ' }).q).toBeUndefined();
    expect(
      catalogQuerySchema.parse({ locationId, q: '  %_\\ȘNIȚEL ', includeArchived: 'false' }),
    ).toMatchObject({ q: '%_\\ȘNIȚEL', includeArchived: false });
  });
  it('acceptă cursorul opac și respinge filtre prea lungi, categorii nevalide și proprietăți necunoscute', () => {
    expect(
      catalogQuerySchema.parse({ locationId, cursor: 'opaque', categoryId: locationId }).cursor,
    ).toBe('opaque');
    for (const change of [
      { q: 'a'.repeat(151) },
      { categoryId: 'invalid' },
      { cursor: '' },
      { cursor: 'a'.repeat(2049) },
      { name: 'inventat' },
    ])
      expect(catalogQuerySchema.safeParse({ locationId, ...change }).success).toBe(false);
  });
});
