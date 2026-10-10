import { randomUUID } from 'node:crypto';
import { stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import {
  normalizeImage,
  privateOrgDirectory,
  reconcileOrphanImages,
  storageKey,
  storePrivateImage,
} from '../../apps/api/src/entities/file-assets';
import { db } from './support/harness';
import type { OperationsFixture } from './operations.types';

export async function verifyReconcilePastIndexedBatch(fixture: OperationsFixture, png: Buffer) {
  const { b } = fixture;
  const organizationId = b.company.organization.id;
  const actorUserId = (await b.primary.expect('/context')).user.id;
  const product = (
    await b.primary.expect('/catalog/products', 'POST', {
      locationId: b.location.id,
      name: 'Test retenție imagini',
      sku: 'RETAIN-IMAGE',
      price: '1.0000',
    })
  ).product;
  const image = await normalizeImage(png, 'image/png', 'PRODUCT_IMAGE');
  const ids = Array.from({ length: 41 }, () => randomUUID()).sort();
  const indexed = ids.slice(0, 40);
  const staleOrphanId = ids[40]!;
  const directory = privateOrgDirectory(organizationId);
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
  for (const id of ids) {
    await storePrivateImage(organizationId, id, image.bytes);
    await utimes(join(directory, `${id}.webp`), old, old);
  }
  await db.withTenantTransaction(db.runtime, { organizationId, userId: actorUserId }, (tx) =>
    tx.fileAsset.createMany({
      data: indexed.map((id) => ({
        id,
        organizationId,
        locationId: null,
        purpose: 'PRODUCT_IMAGE',
        employeeId: null,
        productId: product.id,
        storageKey: storageKey(organizationId, id),
        mimeType: 'image/webp',
        size: image.bytes.length,
        width: image.width,
        height: image.height,
        checksum: image.checksum,
        createdByUserId: actorUserId,
      })),
    }),
  );
  let removed = 0;
  for (let pass = 0; pass < 4 && removed === 0; pass += 1)
    removed += await reconcileOrphanImages(organizationId, actorUserId);
  expect(removed).toBe(1);
  for (const id of indexed)
    await expect(stat(join(directory, `${id}.webp`))).resolves.toBeDefined();
  await expect(stat(join(directory, `${staleOrphanId}.webp`))).rejects.toMatchObject({
    code: 'ENOENT',
  });
}
