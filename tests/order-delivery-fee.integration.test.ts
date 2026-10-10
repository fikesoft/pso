import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
import { deliveryZoneProfile } from '../packages/db/test/fixtures/delivery-zone.fixture';
import { completePacking } from './api/complete-packing';
let f: Awaited<ReturnType<typeof prepareOperations>>;
let zoneId: string;
beforeAll(async () => {
  f = await prepareOperations();
  zoneId = randomUUID();
  await f.a.primary.expect(`/delivery-zones/${zoneId}/commands`, 'POST', {
    action: 'CREATE',
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    profile: { ...deliveryZoneProfile(), minimumOrder: '0.00' },
  });
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
async function createDraft() {
  return (
    await f.worker.expect(
      '/orders',
      'POST',
      f.draft({
        serviceType: 'DELIVERY',
        tableLabel: undefined,
        deliveryAddress: { address: 'Adresă sintetică pentru tarif' },
      }),
    )
  ).order;
}
it('tariful folosește subtotalul serverului, se confirmă explicit și se recuperează idempotent', async () => {
  let order = await createDraft();
  const path = `/orders/${order.id}/delivery-fee`;
  const previewBody = {
    version: order.version,
    destination: { latitude: 47.02, longitude: 28.83 },
  };
  const preview = await f.worker.expect(`${path}/preview`, 'POST', previewBody);
  expect(preview.result).toMatchObject({
    status: 'AVAILABLE',
    subtotal: '10.50',
    fee: '25.00',
    total: '35.50',
  });
  expect(
    (await f.worker.call(`${path}/preview`, 'POST', { ...previewBody, subtotal: '300.00' })).status,
  ).toBe(400);
  const body = {
    ...previewBody,
    requestKey: randomUUID(),
    zoneId,
    zoneVersion: 1,
    subtotal: '10.50',
    fee: '25.00',
    total: '35.50',
    confirmed: true,
  };
  expect((await f.worker.call(path, 'POST', { ...body, confirmed: false })).status).toBe(400);
  expect((await f.worker.call(path, 'POST', { ...body, fee: '0.00', total: '10.50' })).status).toBe(
    409,
  );
  const response = await f.worker.expect(path, 'POST', body);
  order = response.order;
  expect(order).toMatchObject({
    total: '35.50',
    deliveryFee: '25.00',
    deliveryFeeConfirmed: true,
    version: 2,
  });
  expect((await f.worker.expect(path, 'POST', body)).resultVersion).toBe(2);
  expect(
    (await f.worker.expect(`${path}/resolution`, 'POST', { requestKey: body.requestKey })).status,
  ).toBe('SUCCEEDED');
  expect(
    (
      await f.worker.call(path, 'POST', {
        ...body,
        destination: { latitude: 47.021, longitude: 28.83 },
      })
    ).status,
  ).toBe(409);
  const patch = {
    serviceType: 'DELIVERY',
    items: [{ id: order.items[0].id, productId: f.secondProduct.id, quantity: '2' }],
  };
  order = (
    await f.worker.expect(`/orders/${order.id}`, 'PATCH', {
      ...patch,
      version: order.version,
      notes: 'Tariful rămâne',
    })
  ).order;
  expect(order).toMatchObject({ total: '35.50', deliveryFeeConfirmed: true });
  order = (
    await f.worker.expect(`/orders/${order.id}`, 'PATCH', {
      ...patch,
      version: order.version,
      items: [{ ...patch.items[0], quantity: '3' }],
    })
  ).order;
  expect(order).toMatchObject({ total: '15.75', deliveryFee: '0.00', deliveryFeeConfirmed: false });
  const replay = await f.worker.expect(path, 'POST', body);
  expect(replay.resultVersion).toBe(2);
  expect(replay.order.version).toBe(order.version);
  expect(replay.order.deliveryFeeConfirmed).toBe(false);
});
it('rezoluția retrage cheia necunoscută și verifică accesul curent la comandă', async () => {
  const order = await createDraft();
  const path = `/orders/${order.id}/delivery-fee`;
  const requestKey = randomUUID();
  const body = {
    version: order.version,
    destination: { latitude: 47.02, longitude: 28.83 },
    requestKey,
    zoneId,
    zoneVersion: 1,
    subtotal: '10.50',
    fee: '25.00',
    total: '35.50',
    confirmed: true,
  };
  expect((await f.b.primary.call(path, 'POST', body)).status).toBe(404);
  expect((await f.cook.call(path, 'POST', body)).status).toBe(403);
  expect((await f.cook.call(`${path}/resolution`, 'POST', { requestKey })).status).toBe(403);
  expect((await f.worker.expect(`${path}/resolution`, 'POST', { requestKey })).status).toBe(
    'RETIRED',
  );
  expect((await f.worker.call(path, 'POST', body)).status).toBe(409);
  expect((await f.worker.expect(`${path}/resolution`, 'POST', { requestKey })).order.version).toBe(
    order.version,
  );
});
it('adresa invalidează tariful, iar bucătăria, plata și bonul folosesc snapshotul confirmat', async () => {
  let order = await createDraft();
  const path = `/orders/${order.id}`;
  const attempt = () => ({ version: order.version, requestKey: randomUUID() });
  for (const action of ['confirm', 'send'])
    expect((await f.worker.call(`${path}/${action}`, 'POST', attempt())).status).toBe(409);
  const apply = async () => {
    const body = {
      ...attempt(),
      destination: { latitude: 47.02, longitude: 28.83 },
      zoneId,
      zoneVersion: 1,
      subtotal: '10.50',
      fee: '25.00',
      total: '35.50',
      confirmed: true,
    };
    order = (await f.worker.expect(`${path}/delivery-fee`, 'POST', body)).order;
  };
  await apply();
  order = (
    await f.worker.expect(path, 'PATCH', {
      version: order.version,
      serviceType: 'DELIVERY',
      deliveryAddress: { address: 'Altă adresă sintetică' },
      items: [{ id: order.items[0].id, productId: f.secondProduct.id, quantity: '2' }],
    })
  ).order;
  expect(order).toMatchObject({ deliveryFee: '0.00', deliveryFeeConfirmed: false, total: '10.50' });
  await apply();
  const sent = await f.worker.expect(`${path}/send`, 'POST', attempt());
  expect(sent.ticket.items).toHaveLength(1);
  expect(sent.order.total).toBe('35.50');
  for (const [index, status] of ['PREPARING', 'READY'].entries())
    await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: index + 1,
      status,
    });
  order = await completePacking(f.a.primary, order.id);
  const split = { locationId: order.locationId, context: { kind: 'ORDER', id: order.id } };
  const equal = await f.a.primary.expect('/bill-splits/preview', 'POST', {
    ...split,
    division: { mode: 'EQUAL', count: 2 },
  });
  expect(equal.preview.total).toBe('35.50');
  expect(
    (
      await f.a.primary.call('/bill-splits/preview', 'POST', {
        ...split,
        division: {
          mode: 'ITEMS',
          parts: [
            { items: [{ orderItemId: order.items[0].id, quantity: '1' }] },
            { items: [{ orderItemId: order.items[0].id, quantity: '1' }] },
          ],
        },
      })
    ).status,
  ).toBe(409);
  const paid = await f.a.primary.expect(`${path}/checkout/manual`, 'POST', {
    ...attempt(),
    confirmed: true,
    method: 'CASH',
    receivedAmount: '40.00',
    cashShiftId: (await f.cashShift()).id,
  });
  expect(paid.receipt).toMatchObject({
    total: '35.50',
    deliveryFee: '25.00',
    changeAmount: '4.50',
  });
  expect(paid.receipt.items).toHaveLength(1);
  expect(paid.order.paymentSummary.netPaidAmount).toBe('35.50');
  const repeat = await f.a.primary.expect(`${path}/repeat-preview`, 'POST', {
    locationId: order.locationId,
  });
  expect(repeat.estimatedTotal).toBe('10.50');
  const repeated = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        serviceType: 'DELIVERY',
        tableLabel: undefined,
        deliveryAddress: order.deliveryAddress,
        items: repeat.lines.map((line: { candidate: unknown }) => line.candidate),
      }),
    )
  ).order;
  expect(repeated).toMatchObject({
    total: '10.50',
    deliveryFee: '0.00',
    deliveryFeeConfirmed: false,
    version: 1,
  });
});
