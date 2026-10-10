import { createHash, randomUUID } from 'node:crypto';
import { stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  privateOrgDirectory,
  readPrivateImage,
  reconcileOrphanImages,
  storePrivateImage,
} from '../apps/api/src/entities/file-assets';
import { readImage, uploadImage } from './api/media-http';
import { verifyReconcilePastIndexedBatch } from './api/media-reconcile.cases';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFElEQVQImWM448JwxoUBhM+4MAAAIP4EQeprLZYAAAAASUVORK5CYII=',
  'base64',
);
let fixture: OperationsFixture;
beforeAll(async () => {
  fixture = await prepareOperations();
});

it('curăță orfanii vechi dincolo de 32 active indexate fără a șterge istoricul', async () => {
  await verifyReconcilePastIndexedBatch(fixture, png);
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('încarcă avatarul privat cu autentificare, replay și invalidare la înlocuire/ștergere', async () => {
  const { a, b, worker, manager } = fixture;
  const user = (await a.primary.expect('/staff')).users.find(
    (item: { login: string }) => item.login.toLowerCase() === 'chelner',
  );
  expect(user).toBeTruthy();
  const base = `/staff/${user.id}/avatar`;
  const key = randomUUID();
  const path = `${base}?version=${user.version}&requestKey=${key}`;
  expect((await uploadImage(b.primary, path, Buffer.from('bad'))).status).toBe(404);
  expect((await uploadImage(manager, path, png)).status).toBe(403);
  expect(
    (await uploadImage(worker, path, png, 'image/png', { origin: 'http://invalid.local' })).status,
  ).toBe(403);
  expect(
    (await uploadImage(worker, path, png, 'image/png', { 'x-csrf-token': 'wrong' })).status,
  ).toBe(403);
  expect((await uploadImage(worker, path, png, 'image/svg+xml')).status).toBe(415);
  expect((await uploadImage(worker, path, Buffer.from('not an image'))).status).toBe(415);
  const saved = await uploadImage(worker, path, png);
  expect(saved.status).toBe(200);
  expect(saved.data).toMatchObject({ resourceId: user.id, version: user.version + 1 });
  expect(saved.data.assetId).toMatch(/^[a-f0-9-]{36}$/);
  expect((await uploadImage(worker, path, png)).data).toEqual(saved.data);
  expect((await uploadImage(worker, path, Buffer.from('different'))).status).toBe(409);
  const profile = (await worker.expect(`/staff/${user.id}/profile`)).profile;
  expect(profile.user.avatarUrl).toContain(`assetId=${saved.data.assetId}`);
  const read = await readImage(worker, profile.user.avatarUrl);
  expect(read.status).toBe(200);
  expect(read.contentType).toContain('image/webp');
  expect(read.bytes.toString('ascii', 8, 12)).toBe('WEBP');
  expect((await readImage(b.primary, profile.user.avatarUrl)).status).toBe(404);
  const newKey = randomUUID();
  const second = await uploadImage(
    worker,
    `${base}?version=${saved.data.version}&requestKey=${newKey}`,
    png,
  );
  expect(second.status).toBe(200);
  expect(second.data.assetId).not.toBe(saved.data.assetId);
  expect((await readImage(worker, profile.user.avatarUrl)).status).toBe(404);
  const cleared = await worker.expect(`${base}/clear`, 'POST', {
    version: second.data.version,
    requestKey: randomUUID(),
  });
  expect(cleared.assetId).toBeNull();
  expect((await worker.expect(`/staff/${user.id}/profile`)).profile.user.avatarUrl).toBeNull();
});

it('protejează produsul pe locație și serializează scrierile concurente', async () => {
  const { a, b, product, worker, manager } = fixture;
  const base = `/catalog/products/${product.id}/image`;
  const key = randomUUID();
  const path = `${base}?version=${product.version}&requestKey=${key}`;
  expect((await uploadImage(manager, path, png)).status).toBe(403);
  expect((await uploadImage(b.primary, path, png)).status).toBe(404);
  const tooLarge = Buffer.alloc(4 * 1024 * 1024 + 1);
  expect((await uploadImage(a.primary, path, tooLarge)).status).toBe(413);
  const results = await Promise.all([
    uploadImage(a.primary, path, png),
    uploadImage(a.primary, `${base}?version=${product.version}&requestKey=${randomUUID()}`, png),
  ]);
  expect(results.map((item) => item.status).sort()).toEqual([200, 409]);
  const saved = results.find((item) => item.status === 200)!.data;
  expect((await uploadImage(a.primary, path, png)).status).toBe(
    results[0]!.status === 200 ? 200 : 409,
  );
  const catalog = await worker.expect(
    `/catalog/products/${product.id}?locationId=${a.location.id}`,
  );
  expect(catalog.product.imageUrl).toContain(`assetId=${saved.assetId}`);
  const publicImage = await readImage(worker, catalog.product.imageUrl);
  expect(publicImage.status).toBe(200);
  await expect(
    readPrivateImage(
      a.company.organization.id,
      saved.assetId,
      createHash('sha256').update(publicImage.bytes).digest('hex'),
      publicImage.bytes.length + 1,
    ),
  ).rejects.toMatchObject({ status: 500 });
  const wrongLocation = catalog.product.imageUrl.replace(a.location.id, b.location.id);
  expect((await readImage(worker, wrongLocation)).status).toBe(403);
  expect((await readImage(b.primary, catalog.product.imageUrl)).status).toBe(403);
  const clearKey = randomUUID();
  const clear = { version: saved.version, requestKey: clearKey };
  const cleared = await a.primary.expect(`${base}/clear`, 'POST', clear);
  expect(cleared.assetId).toBeNull();
  expect((await a.primary.expect(`${base}/clear`, 'POST', clear)).version).toBe(cleared.version);
  expect(
    (
      await a.primary.call(`${base}/clear`, 'POST', {
        version: cleared.version,
        requestKey: clearKey,
      })
    ).status,
  ).toBe(409);
  expect((await readImage(a.primary, catalog.product.imageUrl)).status).toBe(404);
  expect(
    (await a.primary.expect(`/catalog/products/${product.id}?locationId=${a.location.id}`)).product
      .imageUrl,
  ).toBeNull();

  const orgId = a.company.organization.id;
  const actorId = (await a.primary.expect('/context')).user.id;
  const directory = privateOrgDirectory(orgId);
  const indexedPath = join(directory, `${saved.assetId}.webp`);
  const staleId = randomUUID();
  const recentId = randomUUID();
  await storePrivateImage(orgId, staleId, Buffer.from('stale unindexed test file'));
  await storePrivateImage(orgId, recentId, Buffer.from('recent unindexed test file'));
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
  await utimes(indexedPath, old, old);
  await utimes(join(directory, `${staleId}.webp`), old, old);
  expect(await reconcileOrphanImages(orgId, actorId)).toBe(1);
  await expect(stat(indexedPath)).resolves.toBeDefined();
  await expect(stat(join(directory, `${recentId}.webp`))).resolves.toBeDefined();
  await expect(stat(join(directory, `${staleId}.webp`))).rejects.toMatchObject({ code: 'ENOENT' });

  const limited: number[] = [];
  for (let attempt = 0; attempt < 13; attempt += 1) {
    const result = await uploadImage(
      a.primary,
      `${base}?version=${cleared.version}&requestKey=${randomUUID()}`,
      Buffer.from('corrupt test image'),
    );
    limited.push(result.status);
    if (result.status === 429) break;
  }
  expect(limited.at(-1)).toBe(429);
  expect(limited.slice(0, -1).every((status) => status === 415)).toBe(true);
});
