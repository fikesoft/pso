import { randomUUID } from 'node:crypto';
import { prepareWebsite } from './website-setup';
import { BrowserSession, fixturePasswords } from './support/harness';
import type { CustomerLookupActor } from './customer-lookup.types';

export async function prepareCustomerLookup() {
  const f = await prepareWebsite();
  const localRole = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Operațiuni clienți',
      permissions: [{ permission: 'orders.read' }, { permission: 'orders.create' }],
    })
  ).role;
  const createActor = async (login: string, permissions: string[], bothLocations = false) => {
    const role = permissions.length
      ? (
          await f.a.primary.expect('/roles', 'POST', {
            name: login,
            permissions: permissions.map((permission) => ({ permission })),
          })
        ).role
      : null;
    const result = await f.a.primary.expect('/staff', 'POST', {
      login,
      displayName: login,
      authenticationMethod: 'PIN',
      locationIds: [f.a.location.id, ...(bothLocations ? [f.otherLocation.id] : [])],
      assignments: [
        {
          roleVersionId: localRole.versions[0].id,
          scopeType: 'LOCATION',
          locationId: f.a.location.id,
        },
        ...(role ? [{ roleVersionId: role.versions[0].id, scopeType: 'ORGANIZATION' }] : []),
      ],
    });
    fixturePasswords.add(result.pin);
    return { actor: result as CustomerLookupActor, role };
  };
  const writer = await createActor('customer-writer', ['customers.read', 'customers.create'], true);
  const secondWriter = await createActor(
    'customer-second',
    ['customers.read', 'customers.create'],
    true,
  );
  const restricted = await createActor('customer-restricted', [
    'customers.read',
    'customers.create',
  ]);
  const reader = await createActor('customer-reader', ['customers.read']);
  const createOnly = await createActor('customer-create-only', ['customers.create']);
  const basic = await createActor('customer-basic', []);
  const loginCustomer = async (account = writer) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: account.actor.pin,
    });
    return session;
  };
  let sequence = 0;
  const registration = (extra: Record<string, unknown> = {}) => ({
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    phone: `0608${String(++sequence).padStart(5, '0')}`,
    name: 'Client sintetic',
    ...extra,
  });
  const lookup = (phone: string, session = f.a.primary, locationId = f.a.location.id) =>
    session.expect('/customers/lookup', 'POST', { locationId, phone });
  return {
    ...f,
    writer,
    secondWriter,
    restricted,
    reader,
    createOnly,
    basic,
    loginCustomer,
    registration,
    lookup,
  };
}
