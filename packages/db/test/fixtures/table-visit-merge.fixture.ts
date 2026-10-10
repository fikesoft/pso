import { randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src';
export async function mergeVisits(
  tx: TenantTransaction,
  sourceId: string,
  targetId: string,
  actorUserId: string,
  changes: Partial<Prisma.TableVisitMergeUncheckedCreateInput> = {},
) {
  const source = await tx.tableVisit.findUniqueOrThrow({ where: { id: sourceId } });
  const target = await tx.tableVisit.findUniqueOrThrow({ where: { id: targetId } });
  return tx.tableVisitMerge.create({
    data: {
      organizationId: source.organizationId,
      locationId: source.locationId,
      requestKey: randomUUID(),
      requestHash: 'b'.repeat(64),
      sourceVisitId: sourceId,
      targetVisitId: targetId,
      actorUserId,
      sourceVersion: source.version,
      targetVersion: target.version,
      sourceEventId: randomUUID(),
      targetEventId: randomUUID(),
      reason: 'Clienții se reunesc la masa destinație',
      ...changes,
    },
  });
}
