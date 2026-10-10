import { cashShiftFixture } from './cash-shift-setup';
import { randomUUID } from 'node:crypto';
import { BrowserSession, activate, db, passwordHash, fixturePasswords } from './support/harness';

export async function prepareOperations() {
  const suffix = randomUUID().slice(0, 8);
  const password = `Operations-${randomUUID()}`;
  fixturePasswords.add(password);
  const owner = await db.platformDb.platformAdmin.create({
    data: {
      loginNormalized: `operations-${suffix}`,
      displayName: 'Operațiuni sintetice',
      passwordHash: await passwordHash(password),
    },
  });
  const platform = new BrowserSession('PLATFORM');
  await platform.login(owner.loginNormalized, password);
  await platform.enroll();
  const createTenant = async (label: string) => {
    const company = await platform.expect(
      '/organizations',
      'POST',
      {
        slug: `operations-${suffix}-${label}`,
        name: `Operațiuni ${label}`,
        adminLogin: 'admin',
        adminDisplayName: 'Administrator sintetic',
      },
      201,
    );
    const primary = new BrowserSession('TENANT');
    await activate(primary, 'admin', company.temporaryPassword, company.organization.slug);
    await primary.enroll();
    const location = (await primary.expect('/locations', 'POST', { name: 'Centru', code: 'CTR' }))
      .location;
    return { primary, company, location };
  };
  const a = await createTenant('a');
  const b = await createTenant('b');
  const otherLocation = (
    await a.primary.expect('/locations', 'POST', { name: 'Nord', code: 'NORD' })
  ).location;
  const category = (await a.primary.expect('/catalog/categories', 'POST', { name: 'Băuturi' }))
    .category;
  const product = (
    await a.primary.expect('/catalog/products', 'POST', {
      locationId: a.location.id,
      categoryId: category.id,
      name: 'Cafea inițială',
      sku: 'CAFEA',
      price: '10.0050',
    })
  ).product;
  const secondProduct = (
    await a.primary.expect('/catalog/products', 'POST', {
      locationId: a.location.id,
      name: 'Ceai',
      sku: 'CEAI',
      price: '5.2500',
    })
  ).product;
  const createWorker = async (login: string, permissions: string[]) => {
    const role = (
      await a.primary.expect('/roles', 'POST', {
        name: login,
        permissions: permissions.map((permission) => ({ permission })),
      })
    ).role;
    const created = await a.primary.expect('/staff', 'POST', {
      login,
      displayName: login,
      locationIds: [a.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: a.location.id },
      ],
    });
    const session = new BrowserSession('TENANT');
    return { session, login, temporaryPassword: created.temporaryPassword as string };
  };
  const pendingWorker = await createWorker('Chelner', [
    'orders.read',
    'orders.create',
    'kitchen.read',
  ]);
  const pendingCook = await createWorker('bucatar', ['kitchen.read', 'kitchen.update']);
  const pendingManager = await createWorker('Catalog-local', ['catalog.read', 'catalog.manage']);
  // Role/staff policy changes revoke existing sessions; activate after provisioning ends.
  for (const account of [pendingWorker, pendingCook, pendingManager]) {
    await activate(
      account.session,
      account.login,
      account.temporaryPassword,
      a.company.organization.slug,
    );
  }
  const worker = pendingWorker.session;
  const cook = pendingCook.session;
  const manager = pendingManager.session;
  const draft = (overrides: Record<string, unknown> = {}) => ({
    locationId: a.location.id,
    serviceType: 'DINE_IN',
    tableLabel: '7',
    notes: 'Observație sintetică pentru operator, exclusă din bucătărie',
    items: [{ productId: secondProduct.id, quantity: '2', note: 'Fără zahăr' }],
    requestKey: randomUUID(),
    ...overrides,
  });
  return {
    a,
    b,
    cashShift: cashShiftFixture(a.primary, a.location.id),
    otherLocation,
    category,
    product,
    secondProduct,
    worker,
    cook,
    manager,
    draft,
    owner,
  };
}

export async function closeOperations(ownerId: string) {
  await db.platformDb.platformSession.updateMany({
    where: { platformAdminId: ownerId },
    data: { revokedAt: new Date() },
  });
  await db.platformDb.platformAdmin.update({
    where: { id: ownerId },
    data: { status: 'DISABLED', authVersion: { increment: 1 } },
  });
  await db.platformDb.$disconnect();
}
