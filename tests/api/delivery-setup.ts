import { completePacking } from './complete-packing';
import { randomUUID } from 'node:crypto';
import { prepareOrderLifecycle } from './order-lifecycle-setup';
import { BrowserSession, fixturePasswords } from './support/harness';

export async function prepareDelivery() {
  const f = await prepareOrderLifecycle();
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Curier local PIN',
      permissions: [{ permission: 'orders.read' }, { permission: 'delivery.update' }],
    })
  ).role;
  const createCourier = async (login: string, locationId = f.a.location.id) => {
    const created = await f.a.primary.expect('/staff', 'POST', {
      login,
      displayName: login,
      authenticationMethod: 'PIN',
      locationIds: [locationId],
      assignments: [{ roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId }],
    });
    fixturePasswords.add(created.pin);
    return created;
  };
  const courier = await createCourier('curier-unu');
  const second = await createCourier('curier-doi');
  const outside = await createCourier('curier-nord', f.otherLocation.id);
  const login = async (pin = courier.pin) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', { companySlug: f.a.company.organization.slug, pin });
    return session;
  };
  const create = async (serviceType = 'DELIVERY') =>
    (
      await f.a.primary.expect(
        '/orders',
        'POST',
        f.draft({
          serviceType,
          tableLabel: undefined,
          items: [{ productId: f.product.id, quantity: '2' }],
        }),
      )
    ).order;
  const ready = async (id: string) => {
    const sent = await f.send(id);
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
        version: index + 1,
        status,
      });
    return completePacking(f.a.primary, id);
  };
  const command = async (id: string, status: string, extra: Record<string, unknown> = {}) => {
    const order = await f.current(id);
    return { version: order.version, requestKey: randomUUID(), status, ...extra };
  };
  return { ...f, courier, second, outside, login, create, ready, command };
}
