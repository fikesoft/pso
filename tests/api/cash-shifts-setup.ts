import { completePacking } from './complete-packing';
import { randomUUID } from 'node:crypto';
import { prepareOperations } from './operations-setup';
import { BrowserSession, fixturePasswords } from './support/harness';
import type { CashShiftActor } from './cash-shifts.types';

export async function prepareCashShifts() {
  const f = await prepareOperations();
  const actors: Record<string, CashShiftActor> = {};
  const common = ['cash.registers.read', 'cash.shifts.read'];
  for (const [name, permissions] of Object.entries({
    cashier: [
      ...common,
      'cash.shifts.open',
      'cash.shifts.close',
      'orders.read',
      'payments.collect',
      'payments.refund',
    ],
    other: [
      ...common,
      'cash.shifts.open',
      'cash.shifts.close',
      'orders.read',
      'payments.collect',
      'payments.refund',
    ],
    reader: common,
    demoA: ['orders.read', 'orders.create'],
    demoB: ['orders.read', 'orders.create'],
    closeOnly: ['cash.shifts.close'],
    limited: [...common, 'cash.shifts.open'],
    denied: [...common, 'cash.shifts.open'],
  })) {
    const { role } = await f.a.primary.expect('/roles', 'POST', {
      name: `Ture ${name}`,
      permissions: permissions.map((permission) => ({
        permission,
        ...(name === 'limited' && permission === 'cash.shifts.open'
          ? { limits: { maxAmount: '10' } }
          : {}),
      })),
    });
    const { user, pin } = await f.a.primary.expect('/staff', 'POST', {
      login: `shift-${name}`,
      displayName: `Tură ${name}`,
      authenticationMethod: 'PIN',
      locationIds: [f.a.location.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
      ],
    });
    fixturePasswords.add(pin);
    actors[name] = { session: new BrowserSession('TENANT'), userId: user.id, pin };
  }
  await f.a.primary.expect(`/staff/${actors.denied!.userId}/overrides`, 'POST', {
    permission: 'cash.shifts.open',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const login = async (actor: CashShiftActor) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: actor.pin,
    });
    return session;
  };
  for (const actor of Object.values(actors)) actor.session = await login(actor);
  const locationId = f.a.location.id;
  const register = async (scope = locationId) =>
    (
      await f.a.primary.expect('/cash-registers', 'POST', {
        locationId: scope,
        requestKey: randomUUID(),
        code: `SHIFT-${randomUUID().slice(0, 8)}`,
        name: 'Casă pentru testul turelor',
      })
    ).register;
  const open = async (actor = f.a.primary, openingAmount = '100.00') => {
    const target = await register();
    const body = { locationId, requestKey: randomUUID(), openingAmount };
    return {
      register: target,
      body,
      ...(await actor.expect(`/cash-registers/${target.id}/open`, 'POST', body)),
    };
  };
  const detail = (id: string, actor = f.a.primary) =>
    actor.expect(`/cash-shifts/${id}?locationId=${locationId}`);
  const close = async (id: string, actor = f.a.primary, changes: Record<string, unknown> = {}) => {
    const current = await detail(id, actor);
    const body = {
      locationId,
      requestKey: randomUUID(),
      version: current.shift.version,
      countedCash: current.summary.expectedCash,
      ...changes,
    };
    return { body, ...(await actor.expect(`/cash-shifts/${id}/close`, 'POST', body)) };
  };
  const order = async (ready = false, price = '60') => {
    const { product } = await f.a.primary.expect('/catalog/products', 'POST', {
      locationId,
      name: 'Produs sumar tură',
      sku: randomUUID(),
      price,
    });
    const created = (
      await f.a.primary.expect(
        '/orders',
        'POST',
        f.draft({
          serviceType: 'PICKUP',
          tableLabel: undefined,
          items: [{ productId: product.id, quantity: '1' }],
        }),
      )
    ).order;
    const path = `/orders/${created.id}`;
    if (!ready)
      return (
        await f.a.primary.expect(`${path}/confirm`, 'POST', {
          version: created.version,
          requestKey: randomUUID(),
        })
      ).order;
    const sent = await f.a.primary.expect(`${path}/send`, 'POST', {
      version: created.version,
      requestKey: randomUUID(),
    });
    for (const [index, status] of ['PREPARING', 'READY'].entries())
      await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
        version: index + 1,
        status,
      });
    return completePacking(f.a.primary, created.id);
  };
  return { ...f, actors, login, locationId, register, open, detail, close, order };
}
