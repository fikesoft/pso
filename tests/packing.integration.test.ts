import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import type { PackingSessionDto } from '../packages/contracts/src';
import { preparePacking } from './api/packing-setup';
import type { PackingFixture } from './api/packing.types';
import { closeOperations } from './api/operations-setup';

let f: PackingFixture;
beforeAll(async () => {
  f = await preparePacking();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('ambalare: snapshot fără date comerciale/private, cantități exacte și paginare stabilă', async () => {
  const { session } = await f.create({
    serviceType: 'DELIVERY',
    customer: { name: 'Contact privat sintetic', phone: '060123456' },
    deliveryAddress: { address: 'Destinație privată sintetică' },
    notes: 'Notă internă operator',
  });
  const read = await f.reader.session.call(`/packing/sessions/${session.id}`);
  expect(read.status).toBe(200);
  expect(read.headers.get('cache-control')).toBe('no-store');
  expect(read.data.session).toMatchObject({
    status: 'WAITING',
    version: 1,
    kitchenStatus: 'READY',
  });
  expect(read.data.session.items).toHaveLength(2);
  expect(read.data.session.items[0]).toMatchObject({
    productName: f.product.name,
    quantity: '1.250',
    note: 'Notă preparare',
    checked: false,
    modifierGroups: [{ groupName: 'Adaos istoric', options: ['Sos sintetic'] }],
  });
  expect(JSON.stringify(read.data)).not.toMatch(
    /price|Price|total|currency|customer|phone|address|encrypted|Contact privat|Destinație privată|Notă internă/,
  );
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
    'PUT',
    { version: f.product.locationVersion, price: '777', enabled: true },
  );
  expect((await f.reader.session.expect(`/packing/sessions/${session.id}`)).session).toEqual(
    read.data.session,
  );
  await f.create();
  await f.create();
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await f.reader.session.expect(
      `/packing/sessions?locationId=${f.a.location.id}&limit=1${cursor ? `&cursor=${cursor}` : ''}`,
    );
    for (const row of page.sessions as PackingSessionDto[]) {
      expect(seen.has(row.id)).toBe(false);
      seen.add(row.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  expect(seen.size).toBe(3);
  expect(
    (
      await f.reader.session.call(
        `/packing/sessions?locationId=${f.a.location.id}&cursor=${randomUUID()}`,
      )
    ).status,
  ).toBe(400);
});

it('ambalare: pornire, bifare/debifare și finalizare distinctă cu replay istoric', async () => {
  const { session, path } = await f.create();
  const start = { action: 'START', version: 1, requestKey: randomUUID() };
  const first = await f.operator.session.expect(path, 'POST', start);
  expect(first.result).toMatchObject({
    action: 'START',
    status: 'PACKING',
    expectedVersion: 1,
    version: 2,
  });
  expect((await f.operator.session.call(path, 'POST', { ...start, version: 2 })).status).toBe(409);
  expect(
    (
      await f.finisher.session.call(path, 'POST', {
        action: 'COMPLETE',
        version: 2,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  let version = 2;
  for (const [itemId, checked] of [
    [session.items[0]!.id, true],
    [session.items[0]!.id, false],
    [session.items[0]!.id, true],
    [session.items[1]!.id, true],
  ] as const) {
    const body = { action: 'CHECK_ITEM', itemId, checked, version, requestKey: randomUUID() };
    const saved = await f.operator.session.expect(path, 'POST', body);
    expect(saved.result.version).toBe(++version);
    expect(await f.operator.session.expect(path, 'POST', body)).toEqual(saved);
  }
  const complete = { action: 'COMPLETE', version, requestKey: randomUUID() };
  const done = await f.finisher.session.expect(path, 'POST', complete);
  expect(done.result.status).toBe('READY');
  expect(await f.finisher.session.expect(path, 'POST', complete)).toEqual(done);
  expect(await f.operator.session.expect(path, 'POST', start)).toEqual(first);
  const command = { sessionId: session.id, action: 'START', requestKey: start.requestKey };
  expect(await f.operator.session.expect('/packing/commands/resolution', 'POST', command)).toEqual({
    status: 'SUCCEEDED',
    command,
    result: first.result,
  });
  const current = (await f.reader.session.expect(`/packing/sessions/${session.id}`)).session;
  expect(current.items.every((item: { checked: boolean }) => item.checked)).toBe(true);
  expect(current.startedAt).toBe(first.result.occurredAt);
  expect(current.completedAt).toBe(done.result.occurredAt);
  expect(
    (
      await f.reader.session.expect(`/packing/sessions?locationId=${f.a.location.id}&status=READY`)
    ).sessions.map((row: PackingSessionDto) => row.id),
  ).toContain(session.id);
});

it('ambalare: retragere, conflict, bucătărie în așteptare și istoric după anulare', async () => {
  const { session, path, order } = await f.create({}, false);
  const body = { action: 'START', version: 1, requestKey: randomUUID() };
  expect((await f.operator.session.call(path, 'POST', body)).status).toBe(409);
  const command = { sessionId: session.id, action: body.action, requestKey: body.requestKey };
  expect(await f.operator.session.expect('/packing/commands/resolution', 'POST', command)).toEqual({
    status: 'RETIRED',
    command,
  });
  expect((await f.operator.session.call(path, 'POST', body)).status).toBe(409);
  expect(
    (
      await f.operator.session.call('/packing/commands/resolution', 'POST', {
        ...command,
        action: 'CHECK_ITEM',
      })
    ).status,
  ).toBe(409);
  const current = (await f.a.primary.expect(`/orders/${order.id}`)).order;
  await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
    version: current.version,
    requestKey: randomUUID(),
    reason: 'Anulare sintetică',
  });
  expect((await f.reader.session.expect(`/packing/sessions/${session.id}`)).session).toMatchObject({
    status: 'CANCELLED',
    kitchenStatus: 'CANCELLED',
    version: 2,
  });
  expect(await f.operator.session.expect('/packing/commands/resolution', 'POST', command)).toEqual({
    status: 'RETIRED',
    command,
  });
  expect(
    (await f.operator.session.call(path, 'POST', { ...body, version: 2, requestKey: randomUUID() }))
      .status,
  ).toBe(409);
});

it('ambalare: două porniri concurente modifică sesiunea o singură dată', async () => {
  const { session, path } = await f.create();
  const bodies = [0, 1].map(() => ({
    action: 'START',
    version: 1,
    requestKey: randomUUID(),
  }));
  const responses = await Promise.all(
    bodies.map((body) => f.operator.session.call(path, 'POST', body)),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  const winner = responses.findIndex((response) => response.status === 200);
  expect(await f.operator.session.expect(path, 'POST', bodies[winner])).toEqual(
    responses[winner]!.data,
  );
  expect((await f.reader.session.expect(`/packing/sessions/${session.id}`)).session).toMatchObject({
    status: 'PACKING',
    version: 2,
  });
});

it('ambalare: executarea concurentă cu recuperarea păstrează un singur rezultat definitiv', async () => {
  const { session, path } = await f.create();
  const body = { action: 'START', version: 1, requestKey: randomUUID() };
  const command = { sessionId: session.id, action: body.action, requestKey: body.requestKey };
  const [executed, resolved] = await Promise.all([
    f.operator.session.call(path, 'POST', body),
    f.operator.session.expect('/packing/commands/resolution', 'POST', command),
  ]);
  const current = (await f.reader.session.expect(`/packing/sessions/${session.id}`)).session;
  if (resolved.status === 'SUCCEEDED') {
    expect(executed.status).toBe(200);
    expect(resolved.result).toEqual(executed.data.result);
    expect(current).toMatchObject({ status: 'PACKING', version: 2 });
    expect(await f.operator.session.expect(path, 'POST', body)).toEqual(executed.data);
  } else {
    expect(resolved).toEqual({ status: 'RETIRED', command });
    expect(executed.status).toBe(409);
    expect(current).toMatchObject({ status: 'WAITING', version: 1 });
    expect((await f.operator.session.call(path, 'POST', body)).status).toBe(409);
  }
  expect(await f.operator.session.expect('/packing/commands/resolution', 'POST', command)).toEqual(
    resolved,
  );
});
