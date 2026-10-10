import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { prepareMenuSchedules } from './api/menu-schedule-setup';
import type { WebsiteFixture } from './api/website.types';

let fixture: WebsiteFixture;
beforeAll(async () => {
  fixture = await prepareMenuSchedules();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('scopes schedules to the local manager, replays creation and enforces current availability across channels', async () => {
  const f = fixture;
  const { a, b, manager, worker, product } = f;
  const base = {
    name: 'Mic dejun sintetic',
    eventName: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startMinute: 0,
    endMinute: 1440,
    startsOn: null,
    endsOn: null,
    productIds: [product.id],
  };
  const create = { ...base, locationId: a.location.id, requestKey: randomUUID() };
  expect((await worker.call('/catalog/menu-schedules', 'POST', create)).status).toBe(403);
  let schedule = (await manager.expect('/catalog/menu-schedules', 'POST', create)).schedule;
  const replay = await manager.expect('/catalog/menu-schedules', 'POST', {
    ...create,
    weekdays: [...base.weekdays].reverse(),
  });
  expect(replay.schedule).toEqual(schedule);
  expect(
    (await manager.call('/catalog/menu-schedules', 'POST', { ...create, name: 'Alt program' }))
      .status,
  ).toBe(409);
  expect((await b.primary.call(`/catalog/menu-schedules/${schedule.id}`)).status).toBe(404);
  expect((await b.primary.call(`/catalog/menu-schedules?locationId=${a.location.id}`)).status).toBe(
    403,
  );
  expect(
    (
      await manager.call('/catalog/menu-schedules', 'POST', {
        ...create,
        requestKey: randomUUID(),
        locationId: f.otherLocation.id,
      })
    ).status,
  ).toBe(403);
  const list = await manager.expect(
    `/catalog/menu-schedules?locationId=${a.location.id}&includeArchived=true`,
  );
  expect(list.schedules).toHaveLength(1);
  expect(list.timezone).toBe(a.location.timezone);
  const creation = f.draft({ items: [{ productId: product.id, quantity: '1' }] });
  const draft = (await worker.expect('/orders', 'POST', creation)).order;
  const inbound = await f.inbound('/orders', 'POST', f.order());
  expect(inbound.status).toBe(200);
  const closed = { ...base, status: 'ACTIVE', startsOn: '1970-01-01', endsOn: '1970-01-01' };
  expect(
    (
      await manager.call(`/catalog/menu-schedules/${schedule.id}`, 'PATCH', {
        ...closed,
        version: schedule.version - 1,
      })
    ).status,
  ).toBe(409);
  const edits = await Promise.all([
    manager.call(`/catalog/menu-schedules/${schedule.id}`, 'PATCH', {
      ...closed,
      version: schedule.version,
    }),
    manager.call(`/catalog/menu-schedules/${schedule.id}`, 'PATCH', {
      ...closed,
      name: 'Concurent',
      version: schedule.version,
    }),
  ]);
  expect(edits.map((result) => result.status).sort()).toEqual([200, 409]);
  schedule = (await manager.expect(`/catalog/menu-schedules/${schedule.id}`)).schedule;
  const catalog = (
    await worker.expect(`/catalog/products/${product.id}?locationId=${a.location.id}`)
  ).product;
  expect(catalog.scheduleAvailability).toMatchObject({ available: false, scheduled: true });
  const availabilityPath = `/catalog/menu-availability?locationId=${a.location.id}&productIds=${product.id},${f.secondProduct.id},${randomUUID()}`;
  const availability = await worker.expect(availabilityPath);
  expect(availability.products).toHaveLength(2);
  expect(
    availability.products.find((entry: { productId: string }) => entry.productId === product.id)
      .scheduleAvailability.available,
  ).toBe(false);
  expect(
    availability.products.find(
      (entry: { productId: string }) => entry.productId === f.secondProduct.id,
    ).scheduleAvailability.available,
  ).toBe(true);
  expect((await b.primary.call(availabilityPath)).status).toBe(403);
  expect(
    (
      await worker.call(
        `/catalog/menu-availability?locationId=${f.otherLocation.id}&productIds=${product.id}`,
      )
    ).status,
  ).toBe(403);
  const overlapping = (
    await manager.expect('/catalog/menu-schedules', 'POST', {
      ...create,
      requestKey: randomUUID(),
      name: 'Fereastră alternativă',
    })
  ).schedule;
  expect(
    (await worker.expect(availabilityPath)).products.find(
      (entry: { productId: string }) => entry.productId === product.id,
    ).scheduleAvailability.available,
  ).toBe(true);
  await manager.expect(`/catalog/menu-schedules/${overlapping.id}`, 'PATCH', {
    ...base,
    status: 'ARCHIVED',
    version: overlapping.version,
  });
  expect(
    (await worker.expect(availabilityPath)).products.find(
      (entry: { productId: string }) => entry.productId === product.id,
    ).scheduleAvailability.available,
  ).toBe(false);
  expect((await worker.expect('/orders', 'POST', creation)).order.id).toBe(draft.id);
  const newDraft = await worker.call('/orders', 'POST', { ...creation, requestKey: randomUUID() });
  expect(newDraft.status).toBe(409);
  expect(newDraft.data.code).toBe('MENU_SCHEDULE_UNAVAILABLE');
  const send = { version: draft.version, requestKey: randomUUID() };
  expect((await worker.call(`/orders/${draft.id}/send`, 'POST', send)).data.code).toBe(
    'MENU_SCHEDULE_UNAVAILABLE',
  );
  expect((await worker.expect(`/orders/${draft.id}`)).order).toMatchObject({
    status: 'DRAFT',
    version: draft.version,
  });
  const websiteCatalog = await f.inbound('/catalog');
  expect(
    websiteCatalog.data.products.find(
      (entry: { productId: string }) => entry.productId === product.id,
    ).scheduleAvailability.available,
  ).toBe(false);
  expect((await f.inbound('/orders', 'POST', f.order())).data.code).toBe(
    'MENU_SCHEDULE_UNAVAILABLE',
  );
  expect(
    (
      await a.primary.call(`/website/orders/${inbound.data.receipt.id}/accept`, 'POST', {
        version: 1,
      })
    ).data.code,
  ).toBe('MENU_SCHEDULE_UNAVAILABLE');
  schedule = (
    await manager.expect(`/catalog/menu-schedules/${schedule.id}`, 'PATCH', {
      ...closed,
      status: 'ARCHIVED',
      version: schedule.version,
    })
  ).schedule;
  const reopened = (
    await worker.expect(`/catalog/products/${product.id}?locationId=${a.location.id}`)
  ).product;
  expect(reopened.scheduleAvailability).toMatchObject({ available: true, scheduled: false });
  expect((await worker.expect(`/orders/${draft.id}/send`, 'POST', send)).order.status).toBe(
    'CONFIRMED',
  );
  expect(
    (
      await a.primary.expect(`/website/orders/${inbound.data.receipt.id}/accept`, 'POST', {
        version: 1,
      })
    ).orderId,
  ).toBeTruthy();
  schedule = (
    await manager.expect(`/catalog/menu-schedules/${schedule.id}`, 'PATCH', {
      ...closed,
      version: schedule.version,
    })
  ).schedule;
  expect((await worker.expect(`/orders/${draft.id}/send`, 'POST', send)).order.status).toBe(
    'CONFIRMED',
  );
  expect((await manager.expect(`/catalog/menu-schedules/${schedule.id}`)).schedule.version).toBe(
    schedule.version,
  );
});
