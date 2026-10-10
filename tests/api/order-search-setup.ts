import { randomUUID } from 'node:crypto';
import { prepareWebsite } from './website-setup';
import { BrowserSession, fixturePasswords } from './support/harness';
import type { OrderSearchActor } from './order-search.types';

export async function prepareOrderSearch() {
  const f = await prepareWebsite();
  const product = (
    await f.a.primary.expect('/catalog/products', 'POST', {
      locationId: f.a.location.id,
      name: 'Produs căutare',
      sku: randomUUID(),
      price: '1',
    })
  ).product;
  const createActor = async (name: string, permissions: unknown[]) => {
    const role = (await f.a.primary.expect('/roles', 'POST', { name, permissions })).role;
    const actor = await f.a.primary.expect('/staff', 'POST', {
      login: name,
      displayName: name,
      authenticationMethod: 'PIN',
      locationIds: [f.a.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      ],
    });
    fixturePasswords.add(actor.pin);
    return actor as OrderSearchActor;
  };
  const reader = await createActor('search-reader', [
    { permission: 'orders.read', limits: { maxAmount: '5' } },
  ]);
  const writer = await createActor('search-writer', [
    { permission: 'orders.create' },
    { permission: 'orders.read', limits: { maxAmount: '5' } },
  ]);
  const hidden = await createActor('search-hidden', [{ permission: 'orders.create' }]);
  const loginSearch = async (actor = reader) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: actor.pin,
    });
    return session;
  };
  const draft = (extra: Record<string, unknown> = {}) =>
    f.draft({
      serviceType: 'PICKUP',
      tableLabel: undefined,
      items: [{ productId: product.id, quantity: '1' }],
      ...extra,
    });
  const create = async (extra: Record<string, unknown> = {}, session = f.a.primary) =>
    (await session.expect('/orders', 'POST', draft(extra))).order;
  const search = async (extra: Record<string, unknown> = {}, session = f.a.primary) =>
    session.expect('/orders/search', 'POST', { locationId: f.a.location.id, ...extra });
  return {
    ...f,
    searchProduct: product,
    reader,
    writer,
    hidden,
    loginSearch,
    searchDraft: draft,
    create,
    search,
  };
}
