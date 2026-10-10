import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareCatalogSearch } from './api/catalog-search-setup';
import type { CatalogSearchFixture } from './api/catalog-search.types';
import { closeOperations } from './api/operations-setup';
import type { BrowserSession } from './api/support/harness';

let f: CatalogSearchFixture;
beforeAll(async () => {
  f = await prepareCatalogSearch();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const path = (extra: Record<string, string> = {}) =>
  `/catalog?${new URLSearchParams({ locationId: f.a.location.id, ...extra })}`;
const search = (extra: Record<string, string> = {}, session?: BrowserSession) =>
  (session ?? f.a.primary).expect(path(extra));

it('searches the entire scoped catalog before LIMIT using literal case-insensitive Unicode name/SKU and category AND', async () => {
  const first = await search({ limit: '100' });
  expect(first.products.map((product: { id: string }) => product.id)).not.toContain(f.idAt(210));
  const found = await search({ q: '  NeEdLe  ' });
  expect(found.products.map((product: { id: string }) => product.id)).toEqual([
    f.idAt(210),
    f.idAt(211),
    f.idAt(212),
  ]);
  expect(
    (await search({ q: 'needle', categoryId: f.searchCategory.id })).products.map(
      (product: { id: string }) => product.id,
    ),
  ).toEqual([f.idAt(211)]);
  for (const q of ['ȘNIȚEL', '%', '_', '\\literal', '%_\\'])
    expect((await search({ q })).products.map((product: { id: string }) => product.id)).toEqual([
      f.idAt(210),
    ]);
  expect((await search({ q: 'Snitel' })).products).toHaveLength(0);
  expect((await search({ q: "' OR 1=1 --" })).products).toHaveLength(0);
  expect(found.products[0]).toMatchObject({ enabled: true, price: '7.5000' });
  expect(found.products[1]).toMatchObject({ enabled: false, price: null });
  expect(found.products[2]).toMatchObject({ enabled: false, price: '7.5000' });
  expect(
    (await search({ q: 'needle', locationId: f.otherLocation.id })).products.every(
      (product: { price: string | null; enabled: boolean }) =>
        product.price === null && !product.enabled,
    ),
  ).toBe(true);
  expect((await search({ q: 'needle', includeArchived: 'true' })).products).toHaveLength(4);
  expect((await f.a.primary.call(path({ q: 'x'.repeat(151) }))).status).toBe(400);
  expect((await f.a.primary.call(path({ categoryId: f.foreignCategory.id }))).status).toBe(404);
  expect((await search({ q: ' ', limit: '1' })).products[0].id).toBe(first.products[0].id);
});

it('binds opaque pagination to current actor/scope/filters and retains only visible unfiltered legacy anchors', async () => {
  const first = await search({ q: 'PageMarker', limit: '2' });
  expect(first.products.map((product: { id: string }) => product.id)).toEqual([
    f.idAt(0),
    f.idAt(1),
  ]);
  expect(first.nextCursor).not.toMatch(/^[0-9a-f-]{36}$/);
  await f.seed(`${f.prefix}000000000005`, 'PageMarker nou anterior', 'NEW-BEFORE-ANCHOR');
  const seen = first.products.map((product: { id: string }) => product.id);
  let cursor = first.nextCursor;
  while (cursor) {
    const page = await search({ q: 'PageMarker', limit: '2', cursor });
    seen.push(...page.products.map((product: { id: string }) => product.id));
    cursor = page.nextCursor;
  }
  expect(seen).toEqual(Array.from({ length: 10 }, (_, index) => f.idAt(index)));
  const changedFilters: Array<Record<string, string>> = [
    { q: 'needle' },
    { q: '' },
    { categoryId: f.category.id },
    { locationId: f.otherLocation.id },
    { includeArchived: 'true' },
  ];
  for (const change of changedFilters)
    expect(
      (await f.a.primary.call(path({ q: 'PageMarker', cursor: first.nextCursor, ...change })))
        .status,
    ).toBe(400);
  const damaged = `${first.nextCursor.slice(0, 8)}${first.nextCursor[8] === 'A' ? 'B' : 'A'}${first.nextCursor.slice(9)}`;
  expect((await f.a.primary.call(path({ q: 'PageMarker', cursor: damaged }))).status).toBe(400);
  const operator = await f.loginSearch(f.hidden);
  expect((await operator.call(path({ q: 'PageMarker', cursor: first.nextCursor }))).status).toBe(
    400,
  );
  expect(
    (
      await f.b.primary.call(
        path({ q: 'PageMarker', locationId: f.b.location.id, cursor: first.nextCursor }),
      )
    ).status,
  ).toBe(400);
  expect((await search({ cursor: f.idAt(1), limit: '1' })).products[0].id).toBe(f.idAt(2));
  for (const cursor of [f.idAt(213), f.foreign.id, randomUUID()])
    expect((await f.a.primary.call(path({ cursor }))).status).toBe(400);
  expect((await f.a.primary.call(path({ cursor: f.idAt(1), q: 'PageMarker' }))).status).toBe(400);
  const archived = (
    await f.a.primary.expect('/catalog/categories', 'POST', { name: 'Categorie arhivată' })
  ).category;
  await f.a.primary.expect(`/catalog/categories/${archived.id}`, 'PATCH', {
    version: archived.version,
    status: 'ARCHIVED',
  });
  expect((await f.a.primary.call(path({ categoryId: archived.id }))).status).toBe(404);
  expect(
    (await search({ categoryId: archived.id, includeArchived: 'true' })).products,
  ).toHaveLength(0);
});

it('keeps existing permissions, archive restrictions, tenant isolation and server-side availability checks', async () => {
  const operator = await f.loginSearch(f.hidden);
  expect((await search({ q: 'needle' }, operator)).products).toHaveLength(3);
  expect((await operator.call(path({ q: 'needle', includeArchived: 'true' }))).status).toBe(403);
  expect((await operator.call(path({ locationId: f.otherLocation.id, q: 'needle' }))).status).toBe(
    403,
  );
  const reader = await f.loginSearch();
  expect((await reader.call(path({ q: 'needle' }))).status).toBe(403);
  expect((await f.b.primary.call(path({ q: 'needle' }))).status).toBe(403);
  expect(
    (
      await operator.call(
        '/orders',
        'POST',
        f.searchDraft({ items: [{ productId: f.idAt(212), quantity: '1' }] }),
      )
    ).status,
  ).toBe(409);
  await f.a.primary.expect(`/staff/${f.hidden.user.id}/overrides`, 'POST', {
    permission: 'orders.create',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await f.loginSearch(f.hidden);
  expect((await denied.call(path({ q: 'needle' }))).status).toBe(403);
});
