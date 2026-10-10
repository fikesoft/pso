import type { OrderCreationActor } from './order-creation.types';
import { prepareOperations } from './operations-setup';
import { BrowserSession, fixturePasswords } from './support/harness';

export async function prepareOrderCreation() {
  const f = await prepareOperations();
  const actors: OrderCreationActor[] = [];
  for (const [login, maxAmount] of [
    ['creation-writer', '1000'],
    ['creation-limited', '5'],
    ['creation-withdrawn', '1000'],
  ]) {
    const role = (
      await f.a.primary.expect('/roles', 'POST', {
        name: login,
        permissions: [
          { permission: 'orders.create', limits: { maxAmount } },
          { permission: 'orders.read' },
        ],
      })
    ).role;
    const created = await f.a.primary.expect('/staff', 'POST', {
      login,
      displayName: login,
      authenticationMethod: 'PIN',
      locationIds: [f.a.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      ],
    });
    fixturePasswords.add(created.pin);
    actors.push(created);
  }
  const login = async (index = 0) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: actors[index]!.pin,
    });
    return session;
  };
  return { ...f, actors, login };
}
