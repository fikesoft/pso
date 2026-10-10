import { BrowserSession, fixturePasswords } from './support/harness';
import { prepareWebsite } from './website-setup';

export async function prepareMenuSchedules() {
  const fixture = await prepareWebsite();
  const { a } = fixture;
  const role = (
    await a.primary.expect('/roles', 'POST', {
      name: 'Responsabil programe locale',
      permissions: [{ permission: 'catalog.read' }, { permission: 'catalog.manage' }],
    })
  ).role;
  const actor = await a.primary.expect('/staff', 'POST', {
    login: 'menu-schedule-manager',
    displayName: 'Responsabil programe',
    authenticationMethod: 'PIN',
    locationIds: [a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: a.location.id },
    ],
  });
  fixturePasswords.add(actor.pin);
  const manager = new BrowserSession('TENANT');
  await manager.expect('/auth/session');
  await manager.expect('/auth/pin', 'POST', {
    companySlug: a.company.organization.slug,
    pin: actor.pin,
  });
  const worker = await fixture.login('operator');
  return { ...fixture, manager, worker };
}
