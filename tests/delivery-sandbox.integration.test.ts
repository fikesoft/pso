import { afterEach, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createDeliverySandbox } from '../scripts/delivery-sandbox/model/server';
import { close, listen, purchase, storefrontFixture } from './support/storefront-fixture';

let fixture: Awaited<ReturnType<typeof storefrontFixture>>;
beforeEach(async () => {
  fixture = await storefrontFixture();
});
afterEach(async () => {
  await fixture.dispose();
});

it('serves a plain Buy page without a key field, cookies, secrets or configuration files', async () => {
  const page = await fetch(fixture.origin);
  const html = await page.text();
  expect(page.status).toBe(200);
  expect(html).toContain('Website local pentru livrări');
  expect(html).not.toContain('id="api-key"');
  expect(html).not.toContain('<style');
  expect(page.headers.get('set-cookie')).toBeNull();
  expect(page.headers.get('content-security-policy')).toContain("connect-src 'self'");
  expect(page.headers.get('content-security-policy')).toContain("img-src 'self'");
  for (const path of ['/', '/client.mjs', '/config/client.constants.mjs', '/model/purchase.mjs']) {
    const response = await fetch(`${fixture.origin}${path}`);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(fixture.key);
  }
  expect((await fetch(`${fixture.origin}/.local/website-storefront-key.txt`)).status).toBe(404);
});
it('fetches POS products with server-only credentials and returns only public fields', async () => {
  const response = await fetch(`${fixture.origin}/api/products`);
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain(fixture.key);
  expect(JSON.parse(text)).toEqual({
    locationCode: 'CTR',
    currency: 'MDL',
    products: [
      {
        productId: fixture.productId,
        externalProductId: 'TEST',
        name: 'Produs sintetic',
        price: '10.0050',
        unitTotal: '10.01',
        imageUrl: `/api/catalog/products/${fixture.productId}/image?assetId=${fixture.imageAssetId}`,
      },
    ],
    nextCursor: null,
  });
  expect(fixture.received[0].authorization).toBe(`Bearer ${fixture.key}`);
  expect(fixture.received[0].origin).toBeUndefined();
  expect(fixture.received[0].cookie).toBeUndefined();
});
it('proxies only same-origin validated WebP images with server-held credentials and a byte cap', async () => {
  const path = `/api/catalog/products/${fixture.productId}/image?assetId=${fixture.imageAssetId}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${fixture.origin}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(fixture.imageBytes);
  }
  expect(fixture.received).toHaveLength(2);
  expect(fixture.received[0].authorization).toBe(`Bearer ${fixture.key}`);
  expect(fixture.received[0].origin).toBeUndefined();
  expect(fixture.received[0].cookie).toBeUndefined();
  expect(fixture.received[0].path).toBe(
    `/api/integrations/website/products/${fixture.productId}/image?assetId=${fixture.imageAssetId}`,
  );
  expect((await fetch(`${fixture.origin}${path}&url=https://example.invalid`)).status).toBe(400);
  expect((await fetch(`${fixture.origin}/api/catalog/products/bad/image?assetId=bad`)).status).toBe(
    400,
  );
  expect(fixture.received).toHaveLength(2);
  fixture.state.oversizedImage = true;
  expect((await fetch(`${fixture.origin}${path}`)).status).toBe(502);
});
it('drops untrusted integration image URLs rather than fetching them', async () => {
  fixture.state.imageUrlOverride = 'https://example.invalid/secret.webp';
  const response = await fetch(`${fixture.origin}/api/products`);
  expect(response.status).toBe(200);
  expect((await response.json()).products[0].imageUrl).toBeNull();
  expect(fixture.received).toHaveLength(1);
});
it('forwards one-product purchases and preserves the exact idempotent request on retries', async () => {
  const body = purchase();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${fixture.origin}/api/buy`, {
      method: 'POST',
      headers: { ...fixture.headers, Cookie: 'untrusted-browser-cookie' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(fixture.key);
    expect(JSON.parse(text).receipt.status).toBe('AWAITING_ACCEPTANCE');
  }
  expect(fixture.received).toHaveLength(2);
  expect(fixture.received[0]).toEqual(fixture.received[1]);
  expect(fixture.received[0].requestKey).toBe(body.requestKey);
  expect(fixture.received[0].body).toMatchObject({
    expectedTotal: '10.01',
    externalLocationCode: 'CTR',
    externalOrderId: body.externalOrderId,
    items: [{ externalProductId: 'TEST', quantity: '1.000' }],
    paymentMethod: 'CASH_ON_DELIVERY',
    customer: { name: 'Client website sintetic' },
  });
  expect(fixture.received[0].cookie).toBeUndefined();
});
it('keeps distinct cart lines and canonical modifier selections in one retryable order', async () => {
  const requestKey = randomUUID();
  const bindingId = randomUUID();
  const firstOption = randomUUID();
  const secondOption = randomUUID();
  const body = {
    requestKey,
    externalOrderId: `local-${requestKey}`,
    externalLocationCode: 'CTR',
    expectedTotal: '22.02',
    items: [
      {
        externalProductId: 'TEST',
        quantity: '1.000',
        modifiers: [{ bindingId, bindingVersion: 2, groupVersion: 3, optionIds: [firstOption] }],
      },
      {
        externalProductId: 'TEST',
        quantity: '1.000',
        modifiers: [{ bindingId, bindingVersion: 2, groupVersion: 3, optionIds: [secondOption] }],
      },
    ],
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(`${fixture.origin}/api/buy`, {
      method: 'POST',
      headers: fixture.headers,
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
  }
  expect(fixture.received).toHaveLength(2);
  expect(fixture.received[0]).toEqual(fixture.received[1]);
  expect(fixture.received[0].body).toMatchObject({ items: body.items });
  expect((fixture.received[0].body as { items: unknown[] }).items).toHaveLength(2);
});
it('rejects foreign and absent origins, foreign hosts, browser keys and wrong methods', async () => {
  for (const origin of ['https://example.invalid', '']) {
    expect(
      (
        await fetch(`${fixture.origin}/api/buy`, {
          method: 'POST',
          headers: { ...fixture.headers, Origin: origin },
          body: JSON.stringify(purchase()),
        })
      ).status,
    ).toBe(403);
  }
  expect((await fetch(`${fixture.origin}/api/buy`)).status).toBe(405);
  expect(
    (await fetch(`${fixture.origin}/api/products`, { headers: { Authorization: 'Bearer wrong' } }))
      .status,
  ).toBe(400);
  expect(
    (
      await fetch(`${fixture.origin}/api/products`, {
        headers: { Origin: 'http://example.invalid' },
      })
    ).status,
  ).toBe(403);
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(
      `${fixture.origin}/api/products`,
      { headers: { Host: 'example.invalid' } },
      (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      },
    );
    request.on('error', reject);
    request.end();
  });
  expect(status).toBe(403);
  expect(fixture.received).toHaveLength(0);
});
it('rejects malformed, oversized, mismatched intent and extra-field requests', async () => {
  for (const [body, status] of [
    ['{', 400],
    [JSON.stringify({ ...purchase(), apiKey: 'browser-secret' }), 400],
    [JSON.stringify({ ...purchase(), externalOrderId: 'different' }), 400],
    [' '.repeat(17 * 1024), 413],
  ] as const) {
    expect(
      (await fetch(`${fixture.origin}/api/buy`, { method: 'POST', headers: fixture.headers, body }))
        .status,
    ).toBe(status);
  }
  expect((await fetch(`${fixture.origin}/api/products?url=http://example.invalid`)).status).toBe(
    400,
  );
  expect(fixture.received).toHaveLength(0);
});
it('reports missing, revoked and price-changed configuration without echoing secrets', async () => {
  const missing = createDeliverySandbox({ apiKey: '', posOrigin: fixture.posOrigin });
  const origin = await listen(missing);
  try {
    const response = await fetch(`${origin}/api/products`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'WEBSITE_NOT_CONFIGURED' });
  } finally {
    await close(missing);
  }
  for (const [status, code] of [
    [401, 'INVALID_API_KEY'],
    [409, 'WEBSITE_PRICE_CHANGED'],
  ] as const) {
    Object.assign(fixture.state, { status, code });
    const response = await fetch(`${fixture.origin}/api/buy`, {
      method: 'POST',
      headers: fixture.headers,
      body: JSON.stringify(purchase()),
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
  }
});
it('refuses external destinations and never follows upstream redirects', async () => {
  for (const posOrigin of [
    'https://example.invalid',
    'http://localhost:4000',
    'http://127.0.0.1:4000/evil',
    'http://a:b@127.0.0.1:4000',
  ]) {
    expect(() => createDeliverySandbox({ apiKey: fixture.key, posOrigin })).toThrow();
  }
  fixture.state.redirect = true;
  const response = await fetch(`${fixture.origin}/api/products`);
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ code: 'POS_UNAVAILABLE' });
  expect(fixture.received).toHaveLength(1);
});
it('limits repeated calls before they reach POS', async () => {
  for (let attempt = 0; attempt < 30; attempt++)
    expect((await fetch(`${fixture.origin}/api/products`)).status).toBe(200);
  const response = await fetch(`${fixture.origin}/api/products`);
  expect(response.status).toBe(429);
  expect(response.headers.get('retry-after')).toBe('60');
  expect(fixture.received).toHaveLength(30);
});
