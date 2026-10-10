import { randomUUID } from 'node:crypto';
import { prepareOperations } from './operations-setup';
import { BrowserSession, fixturePasswords } from './support/harness';
export async function prepareCouriers() {
  const f = await prepareOperations();
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Curieri disponibili',
      permissions: ['orders.read', 'delivery.update', 'couriers.availability'].map(
        (permission) => ({ permission }),
      ),
    })
  ).role;
  const create = async (login: string, roleVersionId = role.versions[0].id) => {
    const actor = await f.a.primary.expect('/staff', 'POST', {
      login,
      displayName: login,
      authenticationMethod: 'PIN',
      locationIds: [f.a.location.id],
      assignments: [{ roleVersionId, scopeType: 'LOCATION', locationId: f.a.location.id }],
    });
    fixturePasswords.add(actor.pin);
    return actor as { user: { id: string }; pin: string };
  };
  const own = await create('courier-own'),
    second = await create('courier-second'),
    third = await create('courier-third');
  const readerRole = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Roster fără administrare',
      permissions: [{ permission: 'couriers.read' }],
    })
  ).role;
  const reader = await create('courier-reader', readerRole.versions[0].id);
  const login = async (actor = own) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: actor.pin,
    });
    return session;
  };
  const body = (userId = own.user.id) => ({
    action: 'CREATE',
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    userId,
    profile: { vehicle: 'BICYCLE', capacity: 1 },
  });
  return { ...f, own, second, third, reader, login, body };
}
