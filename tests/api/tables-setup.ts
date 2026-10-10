import { randomUUID } from 'node:crypto';
import { prepareOperations } from './operations-setup';
import { activate, BrowserSession, fixturePasswords } from './support/harness';
import type { TableActor } from './tables.types';

export async function prepareTables(withBillActors = false) {
  const f = await prepareOperations();
  const locationId = f.a.location.id;
  const actors: Record<string, TableActor> = {};
  const service = ['tables.read', 'tables.visits.manage'];
  const waiter = [...service, 'orders.read', 'orders.create', 'orders.complete', 'orders.cancel'];
  const definitions: Record<string, string[]> = {
    waiter,
    colleague: waiter,
    limited: [...service, 'orders.read'],
    reader: ['tables.read'],
    assigner: ['tables.read', 'tables.visits.assign'],
    administrator: ['tables.read', 'tables.manage'],
  };
  if (withBillActors) {
    definitions.splitter = [...service, 'orders.read', 'orders.split'];
    definitions.splitLimited = [...service, 'orders.read', 'orders.split'];
    definitions.hiddenSplit = [...service, 'orders.read', 'orders.split'];
    definitions.collectionLimited = ['orders.read', 'payments.collect', 'cash.shifts.read'];
    definitions.collectionHidden = ['orders.read', 'payments.collect', 'cash.shifts.read'];
  }
  const pending = [];
  for (const [name, permissions] of Object.entries(definitions)) {
    const { role } = await f.a.primary.expect('/roles', 'POST', {
      name: `Mese ${name}`,
      permissions: permissions.map((permission) => ({
        permission,
        ...(['limited', 'hiddenSplit', 'collectionHidden'].includes(name) &&
        permission === 'orders.read'
          ? { limits: { maxAmount: '10' } }
          : {}),
        ...(name === 'collectionLimited' && permission === 'payments.collect'
          ? { limits: { maxAmount: '5' } }
          : {}),
        ...(name === 'splitLimited' && permission === 'orders.split'
          ? { limits: { maxAmount: '15' } }
          : {}),
      })),
    });
    const login = `table-${name}`;
    const account = await f.a.primary.expect('/staff', 'POST', {
      login,
      displayName: `Chelner ${name}`,
      ...(name === 'administrator' ? {} : { authenticationMethod: 'PIN' }),
      locationIds: [locationId],
      assignments: [{ roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId }],
    });
    pending.push({ name, login, account });
  }
  for (const { name, login, account } of pending) {
    const session = new BrowserSession('TENANT');
    if (name === 'administrator') {
      const result = await activate(
        session,
        login,
        account.temporaryPassword,
        f.a.company.organization.slug,
      );
      actors[name] = { userId: account.user.id, login, session, password: result.permanent };
    } else {
      fixturePasswords.add(account.pin);
      await session.expect('/auth/session');
      await session.expect('/auth/pin', 'POST', {
        companySlug: f.a.company.organization.slug,
        pin: account.pin,
      });
      actors[name] = { userId: account.user.id, login, session, pin: account.pin };
    }
  }
  const login = async (name: string) => {
    const actor = actors[name]!;
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: actor.pin,
    });
    actor.session = session;
    return session;
  };
  const tableBody = (changes: Record<string, unknown> = {}) => ({
    locationId,
    requestKey: randomUUID(),
    code: `T-${randomUUID().slice(0, 8)}`,
    name: 'Masă sintetică',
    capacity: 4,
    sortOrder: 10,
    ...changes,
  });
  const table = async (changes: Record<string, unknown> = {}, actor = f.a.primary) => {
    const body = tableBody(changes);
    return { body, ...(await actor.expect('/dining-tables', 'POST', body)) };
  };
  const visit = (id: string, actor = actors.waiter!.session) =>
    actor.expect(`/table-visits/${id}?locationId=${locationId}`);
  const history = (id: string, actor = actors.waiter!.session, query = '') =>
    actor.expect(`/table-visits/${id}/events?locationId=${locationId}${query}`);
  const open = async (
    tableId: string,
    actor = actors.waiter!.session,
    changes: Record<string, unknown> = {},
  ) => {
    const body = { locationId, requestKey: randomUUID(), guestCount: 2, ...changes };
    return { body, ...(await actor.expect(`/dining-tables/${tableId}/visits`, 'POST', body)) };
  };
  const command = async (
    id: string,
    changes: Record<string, unknown>,
    actor = actors.waiter!.session,
  ) => {
    const current = await visit(id, actor);
    const body = {
      locationId,
      requestKey: randomUUID(),
      version: current.visit.version,
      ...changes,
    };
    return { body, ...(await actor.expect(`/table-visits/${id}/commands`, 'POST', body)) };
  };
  const map = (actor = actors.reader!.session, changes: Record<string, string> = {}) =>
    actor.expect(`/table-map?${new URLSearchParams({ locationId, ...changes })}`);
  const currentOrder = async (id: string, actor = f.a.primary) =>
    (await actor.expect(`/orders/${id}`)).order;
  const linked = async (
    visitId: string,
    price = '20',
    actor = actors.waiter!.session,
    changes: Record<string, unknown> = {},
  ) => {
    const { product } = await f.a.primary.expect('/catalog/products', 'POST', {
      locationId,
      sku: randomUUID(),
      name: 'Produs pentru vizita mesei',
      price,
    });
    const body = {
      locationId,
      requestKey: randomUUID(),
      source: 'WAITER',
      serviceType: 'DINE_IN',
      tableVisitId: visitId,
      items: [{ productId: product.id, quantity: '1', note: 'Servire explicită' }],
      ...changes,
    };
    return { body, ...(await actor.expect('/orders', 'POST', body)) };
  };
  const orderAction = async (
    id: string,
    action: string,
    changes: Record<string, unknown> = {},
    actor = f.a.primary,
  ) => {
    const current = await currentOrder(id, actor);
    return actor.expect(`/orders/${id}/${action}`, 'POST', {
      version: current.version,
      requestKey: randomUUID(),
      ...changes,
    });
  };
  const kitchen = (ticketId: string, version: number, status: string) =>
    f.a.primary.expect(`/kitchen/tickets/${ticketId}`, 'PATCH', { version, status });
  const ready = async (id: string) => {
    const sent = await orderAction(id, 'send');
    await kitchen(sent.ticket.id, 1, 'PREPARING');
    await kitchen(sent.ticket.id, 2, 'READY');
    return currentOrder(id);
  };
  const close = (id: string, actor = actors.waiter!.session) =>
    command(id, { kind: 'CLOSE', reason: 'Vizită încheiată după verificare' }, actor);
  return {
    ...f,
    locationId,
    tableActors: actors,
    login,
    tableBody,
    table,
    visit,
    history,
    open,
    command,
    map,
    linked,
    currentOrder,
    orderAction,
    kitchen,
    ready,
    close,
  };
}
