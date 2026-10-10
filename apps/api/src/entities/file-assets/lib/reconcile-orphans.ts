import { config } from '../../../shared/config';
import { reconcileOrphanImages as reconcileLocal } from './reconcile-local-orphans';
import { reconcileBlobOrphans } from './reconcile-blob-orphans';

export async function reconcileOrphanImages(organizationId: string, userId: string) {
  return config.MEDIA_STORAGE === 'vercel-blob'
    ? reconcileBlobOrphans(organizationId, userId)
    : reconcileLocal(organizationId, userId);
}
