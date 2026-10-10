import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { bases } from './support/harness';
import type { WebsiteFixture } from './website.types';

export async function verifyWebsiteKeyGuards(f: WebsiteFixture) {
  expect((await f.inbound('/catalog', 'GET', undefined, randomUUID(), 'invalid')).status).toBe(401);
  expect(
    (
      await f.inbound('/catalog', 'GET', undefined, randomUUID(), f.credentials.apiKey, {
        origin: 'http://localhost:3002',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.inbound('/catalog', 'GET', undefined, randomUUID(), f.credentials.apiKey, {
        cookie: 'anything=value',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${bases.PLATFORM}/api/integrations/catalog`, {
        headers: { authorization: `Bearer ${f.credentials.apiKey}` },
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await fetch(`${bases.TENANT}/api/tenant/context`, {
        headers: { authorization: `Bearer ${f.credentials.apiKey}` },
      })
    ).status,
  ).toBe(401);
  expect((await f.inbound('/orders', 'POST', f.order(), 'bad-key')).status).toBe(400);
  expect(
    (await f.inbound('/orders', 'POST', f.order({ locationId: f.a.location.id }))).status,
  ).toBe(400);
  expect((await f.inbound('/orders', 'POST', f.order({ paymentMethod: 'PAID' }))).status).toBe(400);
  expect((await f.inbound('/orders', 'POST', f.order({ expectedTotal: undefined }))).status).toBe(
    400,
  );
  expect(
    (
      await f.inbound(
        '/orders',
        'POST',
        f.order({ items: [{ externalProductId: 'UNKNOWN', quantity: '1' }] }),
      )
    ).status,
  ).toBe(404);
  const primary = f.a.primary;
  const issued = await f.issue();
  const body = f.order();
  const requestKey = randomUUID();
  const result = await f.inbound('/orders', 'POST', body, requestKey, issued.apiKey);
  expect(result.status).toBe(200);
  const revoked = await primary.expect(`/website/keys/${issued.key.id}`, 'DELETE');
  expect(revoked.key.revokedAt).toBeTruthy();
  expect((await primary.expect(`/website/keys/${issued.key.id}`, 'DELETE')).key).toEqual(
    revoked.key,
  );
  expect((await f.inbound('/orders', 'POST', body, requestKey, issued.apiKey)).status).toBe(401);
  expect((await f.inbound('/orders', 'POST', body, requestKey)).data).toEqual(result.data);
  await primary.expect(`/website/connections/${f.connection.id}`, 'PATCH', {
    version: 1,
    status: 'PAUSED',
  });
  expect((await f.inbound('/catalog')).status).toBe(401);
  expect((await f.inbound('/orders', 'POST', body, requestKey)).status).toBe(401);
  await primary.expect(`/website/connections/${f.connection.id}`, 'PATCH', {
    version: 2,
    status: 'ACTIVE',
  });
  expect((await f.inbound('/catalog')).status).toBe(200);
  const metadata = await primary.expect('/website/connections');
  expect(JSON.stringify(metadata)).not.toMatch(/apiKey|secretHash|pos_web_v1/);
}

export async function verifyWebsiteScope(f: WebsiteFixture) {
  const operator = await f.login('operator');
  const reader = await f.login('reader');
  const limited = await f.login('limited');
  expect((await operator.call('/website/connections')).status).toBe(403);
  expect(
    (
      await operator.call(`/website/connections/${f.connection.id}/keys`, 'POST', {
        name: 'Interzis',
      })
    ).status,
  ).toBe(403);
  expect((await operator.call(`/website/keys/${f.credentials.key.id}`, 'DELETE')).status).toBe(403);
  const incoming = await f.inbound('/orders', 'POST', f.order());
  const id = incoming.data.receipt.id;
  expect((await reader.expect(`/website/orders/${id}`)).websiteOrder.id).toBe(id);
  expect((await reader.call(`/website/orders/${id}/accept`, 'POST', { version: 1 })).status).toBe(
    403,
  );
  expect((await limited.call(`/website/orders/${id}/accept`, 'POST', { version: 1 })).status).toBe(
    403,
  );
  expect((await f.b.primary.call(`/website/orders/${id}`)).status).toBe(404);
  expect(
    (await f.b.primary.call(`/website/orders/${id}/accept`, 'POST', { version: 1 })).status,
  ).toBe(404);
  expect((await f.b.primary.call(`/website/keys/${f.credentials.key.id}`, 'DELETE')).status).toBe(
    404,
  );
  expect((await operator.call(`/website/orders?locationId=${f.otherLocation.id}`)).status).toBe(
    403,
  );
  expect(
    (await f.inbound('/orders', 'POST', f.order({ externalLocationCode: f.otherLocation.code })))
      .status,
  ).toBe(404);
  expect(
    (
      await f.inbound(
        `/orders?externalOrderId=${incoming.data.receipt.externalOrderId}`,
        'GET',
        undefined,
        randomUUID(),
        f.secondCredentials.apiKey,
      )
    ).status,
  ).toBe(404);
  expect(
    (await f.inbound('/catalog', 'GET', undefined, randomUUID(), f.secondCredentials.apiKey)).data
      .products,
  ).toHaveLength(0);
  const foreign = (
    await f.b.primary.expect('/website/connections', 'POST', {
      locationId: f.b.location.id,
      name: 'Companie izolată',
    })
  ).connection;
  expect(
    (
      await f.a.primary.call(`/website/connections/${foreign.id}/keys`, 'POST', {
        name: 'Interzis',
      })
    ).status,
  ).toBe(404);
}
