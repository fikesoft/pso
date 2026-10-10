import { avatarReadQuerySchema, idSchema, mediaClearSchema } from '@pos/contracts';
import express from 'express';
import type { Router } from 'express';
import { MEDIA_INPUT_BYTES, readPrivateImage } from '../../../entities/file-assets';
import { endpoint } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { readableAvatar } from '../model/media-authorization';
import { mutateMedia } from '../model/media-mutation';
import { mediaRequestHash } from '../model/media-hash';
import { mediaPreflight } from './preflight';
import { mediaUpload } from './upload';

export function addAvatarRoutes(router: Router) {
  router.get(
    '/staff/:id/avatar',
    endpoint(async (tx, access, auth, req, res) => {
      const userId = idSchema.parse(req.params.id);
      const { assetId } = avatarReadQuerySchema.parse(req.query);
      const user = await readableAvatar(tx, access, auth.user.id, userId);
      assert(user.avatarAssetId === assetId, 404, 'Imaginea nu este disponibilă.');
      const asset = await tx.fileAsset.findFirst({
        where: { id: assetId, employeeId: userId, purpose: 'STAFF_AVATAR' },
      });
      assert(asset, 404, 'Imaginea nu este disponibilă.');
      const bytes = await readPrivateImage(access.org.id, assetId, asset.checksum, asset.size);
      res.type('image/webp').send(bytes);
    }),
  );
  router.put(
    '/staff/:id/avatar',
    mediaPreflight('STAFF_AVATAR'),
    express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: MEDIA_INPUT_BYTES }),
    mediaUpload('STAFF_AVATAR'),
  );
  router.post(
    '/staff/:id/avatar/clear',
    endpoint(async (tx, access, auth, req) => {
      const userId = idSchema.parse(req.params.id);
      const { version, requestKey } = mediaClearSchema.parse(req.body);
      return mutateMedia(tx, access, {
        purpose: 'STAFF_AVATAR',
        action: 'CLEAR',
        resourceId: userId,
        version,
        requestKey,
        requestHash: mediaRequestHash({
          purpose: 'STAFF_AVATAR',
          action: 'CLEAR',
          resourceId: userId,
          version,
        }),
        auth,
        req,
      });
    }),
  );
}
