import { randomUUID } from 'node:crypto';
import { prepareOrderRepeat } from './order-repeat-setup';
import { BrowserSession, fixturePasswords } from './support/harness';

export async function prepareActiveOrders() {
  const f = await prepareOrderRepeat();
  const actor = async (name: string, permissions: string[]) => {
    const role = (
      await f.a.primary.expect('/roles', 'POST', {
        name,
        permissions: permissions.map((permission) => ({ permission })),
      })
    ).role;
    const user = await f.a.primary.expect('/staff', 'POST', {
      login: name,
      displayName: name,
      authenticationMethod: 'PIN',
      locationIds: [f.a.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      ],
    });
    fixturePasswords.add(user.pin);
    return user as { pin: string; user: { id: string } };
  };
  const courier = await actor('active-courier', ['orders.read', 'delivery.update']);
  const creator = await actor('active-creator', ['orders.create']);
  const loginActor = async (account: typeof creator) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: account.pin,
    });
    return session;
  };
  const path = (query = '', locationId = f.a.location.id) =>
    `/orders/active?locationId=${locationId}${query}`;
  const list = (query = '', session = f.a.primary) => session.expect(path(query));
  const command = async (id: string, action: string, extra: Record<string, unknown> = {}) =>
    f.a.primary.expect(`/orders/${id}/${action}`, 'POST', {
      version: (await f.current(id)).version,
      requestKey: randomUUID(),
      ...extra,
    });
  const pay = async (id: string) =>
    command(id, 'payments', {
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
      payments: [{ method: 'CARD', amount: (await f.current(id)).total }],
    });
  return { ...f, courier, creator, loginActor, path, list, command, pay };
}
