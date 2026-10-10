import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import { prepareWebsite } from './api/website-setup';
import { closeOperations } from './api/operations-setup';
import { deliveryZoneProfile } from '../packages/db/test/fixtures/delivery-zone.fixture';
it('website local: acceptarea păstrează inboxul și cere confirmarea explicită a taxei în POS', async () => {
  const f = await prepareWebsite();
  try {
    const zoneId = randomUUID();
    await f.a.primary.expect(`/delivery-zones/${zoneId}/commands`, 'POST', {
      action: 'CREATE',
      locationId: f.a.location.id,
      requestKey: randomUUID(),
      profile: { ...deliveryZoneProfile(), minimumOrder: '0.00' },
    });
    const actor = await f.login('operator');
    const incoming = await f.inbound('/orders', 'POST', f.order());
    expect(incoming.status).toBe(200);
    const receipt = incoming.data.receipt;
    const accepted = await actor.expect(`/website/orders/${receipt.id}/accept`, 'POST', {
      version: 1,
    });
    const path = `/orders/${accepted.orderId}`;
    const initial = (await actor.expect(path)).order;
    expect(initial).toMatchObject({
      status: 'DRAFT',
      total: '10.01',
      deliveryFee: '0.00',
      deliveryFeeConfirmed: false,
    });
    expect(
      (
        await actor.call(`${path}/send`, 'POST', {
          version: initial.version,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
    const priced = (
      await actor.expect(`${path}/delivery-fee`, 'POST', {
        version: initial.version,
        requestKey: randomUUID(),
        destination: { latitude: 47.02, longitude: 28.83 },
        zoneId,
        zoneVersion: 1,
        subtotal: '10.01',
        fee: '25.00',
        total: '35.01',
        confirmed: true,
      })
    ).order;
    expect(priced).toMatchObject({
      total: '35.01',
      deliveryFee: '25.00',
      deliveryFeeConfirmed: true,
    });
    expect((await f.stored(receipt.id)).order.total.toFixed(2)).toBe('10.01');
    expect(
      await actor.expect(`/website/orders/${receipt.id}/accept`, 'POST', { version: 1 }),
    ).toEqual(accepted);
    const sent = await actor.expect(`${path}/send`, 'POST', {
      version: priced.version,
      requestKey: randomUUID(),
    });
    expect(sent.order.total).toBe('35.01');
    expect(sent.ticket.items).toHaveLength(1);
  } finally {
    await closeOperations(f.owner.id);
  }
});
