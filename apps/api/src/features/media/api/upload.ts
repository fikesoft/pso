import { randomUUID } from 'node:crypto';
import { idSchema, mediaUploadQuerySchema } from '@pos/contracts';
import type { Request, Response } from 'express';
import {
  normalizeImage,
  reconcileOrphanImages,
  storePrivateImage,
} from '../../../entities/file-assets';
import type { MediaPurpose } from '../../../entities/file-assets';
import { loadAccess } from '../../../entities/tenant-access';
import { runtime, withTenantTransaction } from '../../../shared/db';
import type { AuthRequest, TenantAuthState } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import { mediaRequestHash } from '../model/media-hash';
import { checkMediaReplay, mutateMedia } from '../model/media-mutation';
import type { MediaMutationInput } from '../model/media-mutation.types';
import { assertMediaQuota } from '../model/media-quota';
import type { UploadReservation } from '../model/upload-admission.types';

export function mediaUpload(purpose: MediaPurpose) {
  return async (req: Request, res: Response) => {
    const reservation = res.locals.mediaUploadReservation as UploadReservation | undefined;
    assert(reservation, 500, 'Admiterea imaginii lipsește.');
    if (res.destroyed || !reservation.enter()) {
      reservation.responseClosed();
      return;
    }
    try {
      const state = (req as AuthRequest).auth;
      assert(state?.kind === 'TENANT' && state.user.organizationId, 401);
      const auth = state as TenantAuthState;
      const resourceId = idSchema.parse(req.params.id);
      const { version, requestKey } = mediaUploadQuerySchema.parse(req.query);
      const bytes = Buffer.isBuffer(req.body) ? req.body : undefined;
      const contentType = req.headers['content-type'];
      const input: MediaMutationInput = {
        purpose,
        action: 'SET',
        resourceId,
        version,
        requestKey,
        requestHash: mediaRequestHash({
          purpose,
          action: 'SET',
          resourceId,
          version,
          contentType,
          bytes,
        }),
        auth,
        req,
      };
      const replay = await withTenantTransaction(
        runtime,
        { organizationId: auth.user.organizationId, userId: auth.user.id },
        async (tx) => {
          const previous = await checkMediaReplay(tx, await loadAccess(tx, auth), input);
          if (previous) return previous;
          const usage = await tx.fileAsset.aggregate({
            where: { organizationId: auth.user.organizationId },
            _sum: { size: true },
          });
          assertMediaQuota(usage._sum.size ?? 0, 1);
          return null;
        },
      );
      if (replay) return res.json(replay);
      assert(bytes, 415, 'Imaginea lipsește.');
      try {
        await reconcileOrphanImages(auth.user.organizationId, auth.user.id);
      } catch {
        // Cleanup is best effort; a storage maintenance failure must never delete an indexed image.
        console.error(
          JSON.stringify({
            event: 'media.orphan_reconcile.failed',
            requestId: (req as AuthRequest).requestId,
          }),
        );
      }
      const image = await normalizeImage(bytes, contentType, purpose);
      const assetId = randomUUID();
      await storePrivateImage(auth.user.organizationId, assetId, image.bytes);
      const result = await withTenantTransaction(
        runtime,
        { organizationId: auth.user.organizationId, userId: auth.user.id },
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${auth.user.organizationId},0))`;
          const access = await loadAccess(tx, auth);
          return mutateMedia(tx, access, { ...input, prepared: { assetId, image } });
        },
      );
      return res.json(result);
    } finally {
      reservation.settle();
    }
  };
}
