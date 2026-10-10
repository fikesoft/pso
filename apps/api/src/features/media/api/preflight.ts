import { mediaUploadQuerySchema, idSchema } from '@pos/contracts';
import type { NextFunction, Request, Response } from 'express';
import { loadAccess } from '../../../entities/tenant-access';
import { rateLimit } from '../../../entities/session';
import { runtime, withTenantTransaction } from '../../../shared/db';
import type { AuthRequest, TenantAuthState } from '../../../shared/lib/http';
import { assert } from '../../../shared/lib/http';
import { writableAvatar, writableProduct } from '../model/media-authorization';
import { reserveUpload } from '../model/upload-admission';
import { MEDIA_ACTOR_UPLOAD_LIMIT, MEDIA_ACTOR_UPLOAD_WINDOW_MS } from '../config/media.constants';

export function mediaPreflight(purpose: 'STAFF_AVATAR' | 'PRODUCT_IMAGE') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const state = (req as AuthRequest).auth;
      assert(state?.kind === 'TENANT' && state.user.organizationId, 401);
      const auth = state as TenantAuthState;
      const id = idSchema.parse(req.params.id);
      mediaUploadQuerySchema.parse(req.query);
      await withTenantTransaction(
        runtime,
        { organizationId: auth.user.organizationId, userId: auth.user.id },
        async (tx) => {
          const access = await loadAccess(tx, auth);
          if (purpose === 'STAFF_AVATAR') await writableAvatar(tx, access, auth.user.id, id);
          else await writableProduct(tx, access, auth.user.id, id);
        },
      );
      await rateLimit(
        `media:upload:${auth.user.organizationId}:${auth.user.id}`,
        MEDIA_ACTOR_UPLOAD_LIMIT,
        MEDIA_ACTOR_UPLOAD_WINDOW_MS,
      );
      const reservation = reserveUpload();
      res.locals.mediaUploadReservation = reservation;
      res.once('finish', reservation.responseClosed);
      res.once('close', reservation.responseClosed);
      next();
    } catch (error) {
      next(error);
    }
  };
}
