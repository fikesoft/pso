import { idSchema, mediaClearSchema, productImageReadQuerySchema } from '@pos/contracts';
import express from 'express';
import type { Router } from 'express';
import { MEDIA_INPUT_BYTES, readPrivateImage } from '../../../entities/file-assets';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { readableProductImage } from '../model/media-authorization';
import { mutateMedia } from '../model/media-mutation';
import { mediaRequestHash } from '../model/media-hash';
import { mediaPreflight } from './preflight';
import { mediaUpload } from './upload';

export function addProductImageRoutes(router: Router) {
  router.get(
    '/catalog/products/:id/image',
    endpoint(async (tx, access, auth, req, res) => {
      const productId = idSchema.parse(req.params.id);
      const { locationId, assetId } = productImageReadQuerySchema.parse(req.query);
      const product = await readableProductImage(tx, access, auth.user.id, productId, locationId);
      assert(product.imageAssetId === assetId, 404, 'Imaginea nu este disponibilă.');
      const asset = await tx.fileAsset.findFirst({
        where: { id: assetId, productId, purpose: 'PRODUCT_IMAGE' },
      });
      assert(asset, 404, 'Imaginea nu este disponibilă.');
      const bytes = await readPrivateImage(access.org.id, assetId, asset.checksum, asset.size);
      res.type('image/webp').send(bytes);
    }),
  );
  router.put(
    '/catalog/products/:id/image',
    mediaPreflight('PRODUCT_IMAGE'),
    express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: MEDIA_INPUT_BYTES }),
    mediaUpload('PRODUCT_IMAGE'),
  );
  router.post(
    '/catalog/products/:id/image/clear',
    endpoint(async (tx, access, auth, req) => {
      const productId = idSchema.parse(req.params.id);
      const { version, requestKey } = mediaClearSchema.parse(req.body);
      return mutateMedia(tx, access, {
        purpose: 'PRODUCT_IMAGE',
        action: 'CLEAR',
        resourceId: productId,
        version,
        requestKey,
        requestHash: mediaRequestHash({
          purpose: 'PRODUCT_IMAGE',
          action: 'CLEAR',
          resourceId: productId,
          version,
        }),
        auth,
        req,
      });
    }),
  );
}
