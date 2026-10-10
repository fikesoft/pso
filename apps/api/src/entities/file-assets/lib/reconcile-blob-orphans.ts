import { list, del, head } from '@vercel/blob';
import { idSchema } from '@pos/contracts';
import { runtime, withTenantTransaction } from '../../../shared/db';
import {
  MEDIA_ORPHAN_GRACE_MS,
  MEDIA_RECONCILE_BATCH,
  MEDIA_RECONCILE_CURSOR_LIMIT,
} from '../config/media.constants';
import { blobOptions } from './blob-files';
import { storageKey } from './storage-key';

const cursors = new Map<string, string>();

export async function reconcileBlobOrphans(organizationId: string, userId: string) {
  const prefix = `${idSchema.parse(organizationId)}/`;
  const page = await list({
    ...blobOptions(),
    prefix,
    limit: MEDIA_RECONCILE_BATCH,
    cursor: cursors.get(organizationId),
  });
  if (page.hasMore && page.cursor) {
    if (cursors.size >= MEDIA_RECONCILE_CURSOR_LIMIT && !cursors.has(organizationId))
      cursors.delete(cursors.keys().next().value!);
    cursors.set(organizationId, page.cursor);
  } else cursors.delete(organizationId);
  const cutoff = Date.now() - MEDIA_ORPHAN_GRACE_MS;
  const candidates = page.blobs.flatMap((item) => {
    const parsed = idSchema.safeParse(item.pathname.slice(prefix.length, -5));
    return parsed.success &&
      item.pathname === storageKey(organizationId, parsed.data) &&
      item.uploadedAt.getTime() < cutoff
      ? [{ ...item, id: parsed.data }]
      : [];
  });
  if (!candidates.length) return 0;
  return withTenantTransaction(runtime, { organizationId, userId }, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId},0))`;
    const indexed = await tx.fileAsset.findMany({
      where: { organizationId, id: { in: candidates.map((item) => item.id) } },
      select: { id: true },
    });
    const known = new Set(indexed.map((item) => item.id));
    let removed = 0;
    for (const item of candidates) {
      if (known.has(item.id)) continue;
      const current = await head(item.pathname, blobOptions());
      if (
        current.pathname !== item.pathname ||
        current.etag !== item.etag ||
        current.size !== item.size ||
        current.uploadedAt.getTime() >= cutoff
      )
        continue;
      await del(item.pathname, { ...blobOptions(), ifMatch: current.etag });
      removed++;
    }
    return removed;
  });
}
