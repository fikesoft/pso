import { completePacking } from './complete-packing';
import { randomUUID } from 'node:crypto';
import { prepareCustomerLookup } from './customer-lookup-setup';
import { BrowserSession, db, fixturePasswords } from './support/harness';

export async function prepareOrderRepeat() {
  const f = await prepareCustomerLookup();
  const customer = (await f.a.primary.expect('/customers', 'POST', f.registration())).customer;
  const makeActor = async (name: string, readLimit?: string, createLimit?: string) => {
    const role = (
      await f.a.primary.expect('/roles', 'POST', {
        name,
        permissions: [
          { permission: 'orders.read', ...(readLimit ? { limits: { maxAmount: readLimit } } : {}) },
          {
            permission: 'orders.create',
            ...(createLimit ? { limits: { maxAmount: createLimit } } : {}),
          },
        ],
      })
    ).role;
    const crm = (
      await f.a.primary.expect('/roles', 'POST', {
        name: `${name} CRM`,
        permissions: [{ permission: 'customers.read' }],
      })
    ).role;
    const actor = await f.a.primary.expect('/staff', 'POST', {
      login: name,
      displayName: name,
      authenticationMethod: 'PIN',
      locationIds: [f.a.location.id, f.otherLocation.id],
      assignments: [
        { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
        {
          roleVersionId: role.versions[0].id,
          scopeType: 'LOCATION',
          locationId: f.otherLocation.id,
        },
        { roleVersionId: crm.versions[0].id, scopeType: 'ORGANIZATION' },
      ],
    });
    fixturePasswords.add(actor.pin);
    return actor as { pin: string; user: { id: string } };
  };
  const limitedRead = await makeActor('repeat-read-limit', '5');
  const limitedCreate = await makeActor('repeat-create-limit', undefined, '5');
  const full = await makeActor('repeat-full');
  const loginRepeat = async (actor = full) => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: actor.pin,
    });
    return session;
  };
  const makeProduct = async (extra: Record<string, unknown> = {}) =>
    (
      await f.a.primary.expect('/catalog/products', 'POST', {
        locationId: f.a.location.id,
        name: 'Produs repetare',
        sku: randomUUID(),
        price: '10',
        ...extra,
      })
    ).product;
  const create = async (extra: Record<string, unknown> = {}) =>
    (await f.a.primary.expect('/orders', 'POST', f.draft({ serviceType: 'PICKUP', ...extra })))
      .order;
  const current = async (id: string) => (await f.a.primary.expect(`/orders/${id}`)).order;
  const confirm = async (id: string) =>
    (
      await f.a.primary.expect(`/orders/${id}/confirm`, 'POST', {
        version: (await current(id)).version,
        requestKey: randomUUID(),
      })
    ).order;
  const complete = async (extra: Record<string, unknown> = {}) => {
    const order = await create(extra);
    const sent = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    });
    await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: 1,
      status: 'PREPARING',
    });
    await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: 2,
      status: 'READY',
    });
    await completePacking(f.a.primary, order.id);
    await f.a.primary.expect(`/orders/${order.id}/complete`, 'POST', {
      version: (await current(order.id)).version,
      requestKey: randomUUID(),
    });
    return current(order.id);
  };
  const preview = (id: string, actor = f.a.primary, locationId = f.a.location.id) =>
    actor.expect(`/orders/${id}/repeat-preview`, 'POST', { locationId });
  const effects = (id: string) =>
    db.withTenantTransaction(
      db.runtime,
      { organizationId: f.a.company.organization.id },
      async (tx) => ({
        order: await tx.order.findUniqueOrThrow({ where: { id } }),
        items: await tx.orderItem.findMany({ where: { orderId: id }, orderBy: { id: 'asc' } }),
        orders: await tx.order.count(),
        claims: await tx.orderCreationClaim.count(),
        events: await tx.orderStatusEvent.count(),
        payments: await tx.payment.count(),
        tickets: await tx.kitchenTicket.count(),
        audits: await tx.auditEvent.count(),
        checkouts: await tx.checkout.count(),
      }),
    );
  return {
    ...f,
    customer,
    limitedRead,
    limitedCreate,
    full,
    loginRepeat,
    makeProduct,
    create,
    current,
    confirm,
    complete,
    preview,
    effects,
  };
}
