import { randomBytes } from 'node:crypto';
import { prepareOperations } from './operations-setup';
import { BrowserSession, fixturePasswords } from './support/harness';

export async function preparePinFixture() {
  const operations = await prepareOperations();
  const role = (await operations.a.primary.expect('/roles')).roles.find(
    (item: any) => item.name === 'Chelner',
  );
  const administrativeRole = (
    await operations.a.primary.expect('/roles', 'POST', {
      name: 'Administrator PIN test',
      permissions: [{ permission: 'staff.create' }, { permission: 'staff.credentials.reset' }],
    })
  ).role;
  async function create(login: string, pin = randomBytes(6).toString('hex').toUpperCase()) {
    fixturePasswords.add(pin);
    return operations.a.primary.expect('/staff', 'POST', {
      login,
      displayName: `Lucrător ${login}`,
      authenticationMethod: 'PIN',
      pin,
      locationIds: [operations.a.location.id],
      assignments: [
        {
          roleVersionId: role.versions[0].id,
          scopeType: 'LOCATION',
          locationId: operations.a.location.id,
        },
      ],
    });
  }
  async function login(pin: string, slug = operations.a.company.organization.slug) {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    const response = await session.expect('/auth/pin', 'POST', { companySlug: slug, pin });
    return { session, response };
  }
  return { ...operations, role, administrativeRole, create, login };
}
