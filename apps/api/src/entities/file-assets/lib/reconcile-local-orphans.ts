import { lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { idSchema } from '@pos/contracts';
import { runtime, withTenantTransaction } from '../../../shared/db';
import { MEDIA_ORPHAN_GRACE_MS } from '../config/media.constants';
import type { OrphanCandidate } from '../model/reconcile.types';
import { privateOrgDirectory } from './local-files';
import { scanPrivateNames } from './reconcile-cursor';

export async function reconcileOrphanImages(organizationId: string, userId: string) {
  const directory = privateOrgDirectory(organizationId);
  const names = await scanPrivateNames(organizationId, directory);
  const candidates: OrphanCandidate[] = [];
  const cutoff = Date.now() - MEDIA_ORPHAN_GRACE_MS;
  for (const name of names) {
    if (!name.endsWith('.webp')) continue;
    const id = name.slice(0, -5);
    if (!idSchema.safeParse(id).success || name !== `${id}.webp`) continue;
    const stat = await lstat(join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink() || stat.mtimeMs > cutoff) continue;
    candidates.push({
      id,
      name,
      ino: stat.ino,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }
  if (candidates.length === 0) return 0;
  return withTenantTransaction(runtime, { organizationId, userId }, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId},0))`;
    const indexed = await tx.fileAsset.findMany({
      where: { organizationId, id: { in: candidates.map((item) => item.id) } },
      select: { id: true },
    });
    const known = new Set(indexed.map((item) => item.id));
    let removed = 0;
    for (const candidate of candidates) {
      if (known.has(candidate.id)) continue;
      const path = join(directory, candidate.name);
      const current = await lstat(path);
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        current.ino !== candidate.ino ||
        current.size !== candidate.size ||
        current.mtimeMs !== candidate.mtimeMs ||
        current.mtimeMs > cutoff
      )
        continue;
      await unlink(path);
      removed += 1;
    }
    return removed;
  });
}
