import { randomUUID } from 'node:crypto';
import { prepareCustomerLookup } from './customer-lookup-setup';
import { BrowserSession, fixturePasswords } from './support/harness';

export async function prepareCustomerAddresses() {
  const f = await prepareCustomerLookup();
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Gestionare adrese',
      permissions: [{ permission: 'customers.read' }, { permission: 'customers.addresses.manage' }],
    })
  ).role;
  const ordersRole = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Comenzi pentru adresar',
      permissions: [{ permission: 'orders.read' }, { permission: 'orders.create' }],
    })
  ).role;
  const addManager = async (name: string, both = true) => {
    const actor = await f.a.primary.expect('/staff', 'POST', {
      login: name,
      displayName: name,
      authenticationMethod: 'PIN',
      locationIds: [f.a.location.id, ...(both ? [f.otherLocation.id] : [])],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'ORGANIZATION' },
        {
          roleVersionId: ordersRole.versions[0].id,
          scopeType: 'LOCATION',
          locationId: f.a.location.id,
        },
      ],
    });
    fixturePasswords.add(actor.pin);
    return actor as { pin: string; user: { id: string } };
  };
  const manager = await addManager('address-manager');
  const otherManager = await addManager('address-other');
  const restrictedManager = await addManager('address-restricted', false);
  const loginAddress = async (actor = manager) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: actor.pin,
    });
    return session;
  };
  const customer = (await f.a.primary.expect('/customers', 'POST', f.registration())).customer;
  const secondCustomer = (await f.a.primary.expect('/customers', 'POST', f.registration()))
    .customer;
  const foreignCustomer = (
    await f.b.primary.expect('/customers', 'POST', {
      ...f.registration(),
      locationId: f.b.location.id,
    })
  ).customer;
  const path = (id: string = customer.id) => `/customers/${id}/addresses`;
  const addressBody = (extra: Record<string, unknown> = {}) => ({
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    label: 'Acasă sintetic',
    address: 'Strada Test 12, ap. 3',
    instructions: 'Intrarea curte',
    ...extra,
  });
  const listPath = (id: string = customer.id, locationId: string = f.a.location.id) =>
    `${path(id)}?locationId=${locationId}`;
  return {
    ...f,
    manager,
    otherManager,
    restrictedManager,
    loginAddress,
    role,
    customer,
    secondCustomer,
    foreignCustomer,
    path,
    addressBody,
    listPath,
  };
}
