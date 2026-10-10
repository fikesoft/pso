import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { KitchenTicket, Order } from '../packages/contracts/src';
import { prepareOperations, closeOperations } from './api/operations-setup';
import { activate, BrowserSession } from './api/support/harness';

let f: Awaited<ReturnType<typeof prepareOperations>>;
let launcher: BrowserSession;
let launcherId: string;
let launcherPassword: string;
let cook: BrowserSession;
beforeAll(async () => {
  f = await prepareOperations();
  const { role } = await f.a.primary.expect('/roles', 'POST', {
    name: 'Lansare locală',
    permissions: [{ permission: 'kitchen.courses.fire' }],
  });
  const created = await f.a.primary.expect('/staff', 'POST', {
    login: 'lansare',
    displayName: 'Lansare sintetică',
    locationIds: [f.a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
    ],
  });
  launcherId = created.user.id;
  const cookRole = await f.a.primary.expect('/roles', 'POST', {
    name: 'Bucătar etape',
    permissions: [{ permission: 'kitchen.read' }, { permission: 'kitchen.update' }],
  });
  const cookAccount = await f.a.primary.expect('/staff', 'POST', {
    login: 'bucatar-etape',
    displayName: 'Bucătar etape',
    locationIds: [f.a.location.id],
    assignments: [
      {
        roleVersionId: cookRole.role.versions[0].id,
        scopeType: 'LOCATION',
        locationId: f.a.location.id,
      },
    ],
  });
  cook = new BrowserSession('TENANT');
  await activate(
    cook,
    'bucatar-etape',
    cookAccount.temporaryPassword,
    f.a.company.organization.slug,
  );
  launcher = new BrowserSession('TENANT');
  launcherPassword = (
    await activate(launcher, 'lansare', created.temporaryPassword, f.a.company.organization.slug)
  ).permanent;
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

async function sendCourses() {
  const { order }: { order: Order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [1, 2, 3].map((courseNumber) => ({
        productId: f.product.id,
        quantity: '1',
        courseNumber,
      })),
    }),
  );
  expect(order.items.map((item) => item.courseNumber)).toEqual([1, 2, 3]);
  return (await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
  })) as { order: Order; ticket: KitchenTicket };
}

it('etapele păstrează snapshotul, se lansează separat și recuperează rezultatul istoric', async () => {
  const { order }: { order: Order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [
        { productId: f.product.id, quantity: '1', courseNumber: 1 },
        { productId: f.secondProduct.id, quantity: '1', courseNumber: 1 },
        { productId: f.product.id, quantity: '1', courseNumber: 3 },
      ],
    }),
  );
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    code: 'COURSE',
    name: 'Stație etape',
    sortOrder: 0,
  });
  await f.a.primary.expect('/kitchen-routing', 'PUT', {
    locationId: f.a.location.id,
    productId: f.product.id,
    stationId: station.id,
    version: 0,
    requestKey: randomUUID(),
  });
  const { ticket }: { ticket: KitchenTicket } = await f.a.primary.expect(
    `/orders/${order.id}/send`,
    'POST',
    { version: order.version, requestKey: randomUUID() },
  );
  expect(ticket.batches).toHaveLength(3);
  expect(ticket.batches.every((batch) => batch.firedAt === null)).toBe(true);
  const dessert = ticket.batches.find((batch) => batch.courseNumber === 3)!;
  expect(
    (
      await cook.call(`/kitchen/tickets/${ticket.id}/batches/${dessert.id}`, 'PATCH', {
        version: dessert.version,
        status: 'PREPARING',
      })
    ).status,
  ).toBe(409);
  const path = `/kitchen/tickets/${ticket.id}/fire`;
  const body = { version: ticket.version, requestKey: randomUUID(), course: 1 };
  const first = await launcher.expect(path, 'POST', body);
  expect(first.result.batchIds.sort()).toEqual(
    ticket.batches
      .filter((batch) => batch.courseNumber === 1)
      .map((batch) => batch.id)
      .sort(),
  );
  expect(first.result.version).toBe(2);
  expect((await cook.call(path, 'POST', body)).status).toBe(403);
  expect((await f.b.primary.call(path, 'POST', body)).status).toBe(404);
  expect((await launcher.call(path, 'POST', { ...body, course: 'ALL' })).status).toBe(409);
  const { tickets }: { tickets: KitchenTicket[] } = await cook.expect(
    `/kitchen/tickets?locationId=${f.a.location.id}`,
  );
  const released = tickets.find((row) => row.id === ticket.id)!;
  expect(released.batches.find((batch) => batch.id === dessert.id)!.firedAt).toBeNull();
  const firstBatch = released.batches.find((batch) => batch.courseNumber === 1)!;
  expect(firstBatch.firedAt).toBe(first.result.firedAt);
  await cook.expect(`/kitchen/tickets/${ticket.id}/batches/${firstBatch.id}`, 'PATCH', {
    version: firstBatch.version,
    status: 'PREPARING',
  });
  expect(await launcher.expect(path, 'POST', body)).toEqual(first);
  expect(
    await launcher.expect('/kitchen-course-commands/resolution', 'POST', {
      ticketId: ticket.id,
      requestKey: body.requestKey,
    }),
  ).toEqual({
    status: 'SUCCEEDED',
    command: { ticketId: ticket.id, requestKey: body.requestKey },
    result: first.result,
  });
  const all = await launcher.expect(path, 'POST', {
    version: 3,
    requestKey: randomUUID(),
    course: 'ALL',
  });
  expect(all.result.batchIds).toEqual([dessert.id]);
  expect(
    (await launcher.call(path, 'POST', { version: 4, requestKey: randomUUID(), course: 'ALL' }))
      .status,
  ).toBe(409);
});

it('retragerea tentativei blochează cererea întârziată și contractul respinge scope fals', async () => {
  const { ticket } = await sendCourses();
  const body = { version: 1, requestKey: randomUUID(), course: 2 };
  const command = { ticketId: ticket.id, requestKey: body.requestKey };
  const path = `/kitchen/tickets/${ticket.id}/fire`;
  expect(await launcher.expect('/kitchen-course-commands/resolution', 'POST', command)).toEqual({
    status: 'RETIRED',
    command,
  });
  expect((await launcher.call(path, 'POST', body)).status).toBe(409);
  expect(
    (await launcher.call(path, 'POST', { ...body, organizationId: f.b.company.organization.id }))
      .status,
  ).toBe(400);
  expect(
    (await launcher.call(path, 'POST', { ...body, requestKey: randomUUID() }, {}, false)).status,
  ).toBe(403);
  const result = await launcher.expect(path, 'POST', { ...body, requestKey: randomUUID() });
  expect(result.result.version).toBe(2);
  expect((await launcher.call(path, 'POST', { ...body, requestKey: randomUUID() })).status).toBe(
    409,
  );
});

it('dreptul local nu lansează și nu recuperează etape din altă locație', async () => {
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.otherLocation.id}`,
    'PUT',
    { price: '10', enabled: true },
  );
  const { order }: { order: Order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      locationId: f.otherLocation.id,
      items: [{ productId: f.product.id, quantity: '1', courseNumber: 1 }],
    }),
  );
  const { ticket } = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
  });
  const requestKey = randomUUID();
  expect(
    (
      await launcher.call(`/kitchen/tickets/${ticket.id}/fire`, 'POST', {
        version: 1,
        requestKey,
        course: 1,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await launcher.call('/kitchen-course-commands/resolution', 'POST', {
        ticketId: ticket.id,
        requestKey,
      })
    ).status,
  ).toBe(403);
});

it('DENY curent retrage lansarea și recuperarea, fără drept implicit de citire KDS', async () => {
  const { ticket } = await sendCourses();
  const body = { version: 1, requestKey: randomUUID(), course: 1 };
  const path = `/kitchen/tickets/${ticket.id}/fire`;
  expect((await launcher.call(`/kitchen/tickets?locationId=${f.a.location.id}`)).status).toBe(403);
  await launcher.expect(path, 'POST', body);
  await f.a.primary.expect(`/staff/${launcherId}/overrides`, 'POST', {
    permission: 'kitchen.courses.fire',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  expect((await launcher.call(path, 'POST', body)).status).toBe(401);
  launcher = new BrowserSession('TENANT');
  await launcher.login('lansare', launcherPassword, f.a.company.organization.slug);
  expect((await launcher.call(path, 'POST', body)).status).toBe(403);
  expect(
    (
      await launcher.call('/kitchen-course-commands/resolution', 'POST', {
        ticketId: ticket.id,
        requestKey: body.requestKey,
      })
    ).status,
  ).toBe(403);
});
