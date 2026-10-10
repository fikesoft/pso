import { completePacking } from './complete-packing';
import { randomUUID } from 'node:crypto';
import { prepareOperations } from './operations-setup';
import { BrowserSession, fixturePasswords, db } from './support/harness';
import type { CheckoutActor, CheckoutPermission } from './checkout.types';

export async function prepareCheckout() {
  const base = await prepareOperations();
  const createActor = async (name: CheckoutActor, permissions: CheckoutPermission[]) => {
    const role = (
      await base.a.primary.expect('/roles', 'POST', {
        name: `Checkout ${name}`,
        permissions: [
          ...permissions,
          ...['cash.registers.read', 'cash.shifts.read', 'cash.shifts.open'].map((permission) => ({
            permission,
          })),
        ],
      })
    ).role;
    const created = await base.a.primary.expect('/staff', 'POST', {
      login: `checkout-${name}`,
      displayName: `Casier sintetic ${name}`,
      authenticationMethod: 'PIN',
      locationIds: [base.a.location.id],
      assignments: [
        {
          roleVersionId: role.versions[0].id,
          scopeType: 'LOCATION',
          locationId: base.a.location.id,
        },
      ],
    });
    fixturePasswords.add(created.pin);
    return created as { user: { id: string }; pin: string };
  };
  const actors = {
    cashier: await createActor('cashier', [
      { permission: 'orders.read' },
      { permission: 'payments.collect' },
    ]),
    waiter: await createActor('waiter', [
      { permission: 'orders.read' },
      { permission: 'orders.create' },
    ]),
    limited: await createActor('limited', [
      { permission: 'orders.read' },
      {
        permission: 'payments.collect',
        limits: { maxAmount: '10.00' },
      },
    ]),
    denied: await createActor('denied', [
      { permission: 'orders.read' },
      { permission: 'payments.collect' },
    ]),
    noRead: await createActor('noRead', [{ permission: 'payments.collect' }]),
  };
  await base.a.primary.expect(`/staff/${actors.denied.user.id}/overrides`, 'POST', {
    permission: 'payments.collect',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  await base.a.primary.expect(
    `/catalog/products/${base.product.id}/locations/${base.otherLocation.id}`,
    'PUT',
    {
      price: '10.0050',
      enabled: true,
    },
  );
  const login = async (name: CheckoutActor) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: base.a.company.organization.slug,
      pin: actors[name].pin,
    });
    return session;
  };
  const makeOrder = async (overrides: Record<string, unknown> = {}, ready = true) => {
    const order = (
      await base.a.primary.expect(
        '/orders',
        'POST',
        base.draft({
          items: [{ productId: base.product.id, quantity: '1' }],
          ...overrides,
        }),
      )
    ).order;
    if (!ready) return order;
    const sent = await base.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
      version: 1,
      requestKey: randomUUID(),
    });
    await base.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: 1,
      status: 'PREPARING',
    });
    await base.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: 2,
      status: 'READY',
    });
    return completePacking(base.a.primary, order.id);
  };
  const stored = async (orderId: string) =>
    db.withTenantTransaction(
      db.runtime,
      {
        organizationId: base.a.company.organization.id,
      },
      async (tx) => {
        const checkouts = await tx.checkout.findMany({ where: { orderId } });
        return {
          checkouts,
          payments: await tx.payment.findMany({ where: { orderId } }),
          events: await tx.orderStatusEvent.findMany({ where: { orderId, toStatus: 'COMPLETED' } }),
          audits: await tx.auditEvent.findMany({
            where: {
              targetType: 'CHECKOUT',
              targetId: { in: checkouts.map((checkout) => checkout.id) },
            },
          }),
        };
      },
    );
  return { ...base, actors, login, makeOrder, stored };
}
