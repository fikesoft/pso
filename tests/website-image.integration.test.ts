import './api/support/harness';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { uploadImage } from './api/media-http';
import { closeOperations } from './api/operations-setup';
import { prepareWebsite } from './api/website-setup';
import type { WebsiteFixture } from './api/website.types';
import { bases } from './api/support/harness';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVQImWM448JwxoUBhM+4MAAAIP4EQeprLZYAAAAASUVORK5CYII=',
  'base64',
);
let fixture: WebsiteFixture;
beforeAll(async () => {
  fixture = await prepareWebsite();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

function image(path: string, apiKey?: string) {
  return fetch(`${bases.TENANT}${path}`, {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
  });
}

it('website livrează numai imaginea curentă a produsului activ și disponibil în conexiunea autorizată', async () => {
  const f = fixture;
  const first = await uploadImage(
    f.a.primary,
    `/catalog/products/${f.product.id}/image?version=${f.product.version}&requestKey=${randomUUID()}`,
    png,
  );
  expect(first.status).toBe(200);
  const catalog = await f.inbound('/catalog');
  expect(catalog.status).toBe(200);
  const row = catalog.data.products.find(
    (entry: { productId: string }) => entry.productId === f.product.id,
  );
  expect(row.imageUrl).toBe(
    `/api/integrations/website/products/${f.product.id}/image?assetId=${first.data.assetId}`,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    const delivered = await image(row.imageUrl, f.credentials.apiKey);
    expect(delivered.status).toBe(200);
    expect(delivered.headers.get('content-type')).toContain('image/webp');
    expect(delivered.headers.get('cache-control')).toBe('no-store');
    expect(Buffer.from(await delivered.arrayBuffer()).toString('ascii', 8, 12)).toBe('WEBP');
  }
  expect((await image(row.imageUrl)).status).toBe(401);
  expect((await image(row.imageUrl, f.secondCredentials.apiKey)).status).toBe(404);
  expect(
    (await image(row.imageUrl.replace(first.data.assetId, randomUUID()), f.credentials.apiKey))
      .status,
  ).toBe(404);
  expect(
    (
      await image(
        `/api/integrations/website/staff/${f.a.company.organization.id}/avatar?assetId=${first.data.assetId}`,
        f.credentials.apiKey,
      )
    ).status,
  ).toBe(404);

  const foreignConnection = await f.b.primary.expect('/website/connections', 'POST', {
    locationId: f.b.location.id,
    name: 'Website altă companie',
  });
  const foreignKey = await f.b.primary.expect(
    `/website/connections/${foreignConnection.connection.id}/keys`,
    'POST',
    { name: 'Cheie străină' },
  );
  expect((await image(row.imageUrl, foreignKey.apiKey)).status).toBe(404);

  const disabled = await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
    'PUT',
    { version: f.product.locationVersion, price: f.product.price, enabled: false },
  );
  expect((await image(row.imageUrl, f.credentials.apiKey)).status).toBe(404);
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.a.location.id}`,
    'PUT',
    { version: disabled.product.locationVersion, price: f.product.price, enabled: true },
  );

  const archived = await f.a.primary.expect(`/catalog/products/${f.product.id}`, 'PATCH', {
    version: first.data.version,
    status: 'ARCHIVED',
  });
  expect((await image(row.imageUrl, f.credentials.apiKey)).status).toBe(404);
  const restored = await f.a.primary.expect(`/catalog/products/${f.product.id}`, 'PATCH', {
    version: archived.product.version,
    status: 'ACTIVE',
  });
  const second = await uploadImage(
    f.a.primary,
    `/catalog/products/${f.product.id}/image?version=${restored.product.version}&requestKey=${randomUUID()}`,
    png,
  );
  expect(second.status).toBe(200);
  expect((await image(row.imageUrl, f.credentials.apiKey)).status).toBe(404);
  const current = (await f.inbound('/catalog')).data.products.find(
    (entry: { productId: string }) => entry.productId === f.product.id,
  );
  expect(current.imageUrl).toContain(`assetId=${second.data.assetId}`);
  expect((await image(current.imageUrl, f.credentials.apiKey)).status).toBe(200);

  await f.a.primary.expect(`/website/connections/${f.connection.id}`, 'PATCH', {
    version: f.connection.version,
    status: 'PAUSED',
  });
  expect((await image(current.imageUrl, f.credentials.apiKey)).status).toBe(401);
});
