import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
import type { CashDiscrepancyResponse } from '@pos/contracts';
import { closingResponse } from '../../../entities/cash-shift';
import { discrepancyFilter } from './discrepancy-query';
import { closingCursor, readClosingCursor } from './discrepancy-cursor';
import type { DiscrepancyContext, ReportClosing } from './discrepancy.types';
export async function discrepancyPage(
  tx: TenantTransaction,
  c: DiscrepancyContext,
): Promise<CashDiscrepancyResponse> {
  const after = c.cursor ? readClosingCursor(c, c.cursor) : undefined;
  const rows = await tx.$queryRaw<ReportClosing[]>(Prisma.sql`
    SELECT c.* FROM "CashClosing" c JOIN "CashShift" s ON s."organizationId"=c."organizationId" AND s."locationId"=c."locationId" AND s.id=c."shiftId"
    WHERE ${discrepancyFilter(c)}
    ${after ? Prisma.sql`AND (c."closedAt",c.id)<(${new Date(after.closedAt)}::timestamptz,${after.id}::uuid)` : Prisma.empty}
    ORDER BY c."closedAt" DESC,c.id DESC LIMIT ${c.limit + 1}`);
  const page = rows.slice(0, c.limit);
  const shifts = await tx.cashShift.findMany({
    where: {
      organizationId: c.organizationId,
      locationId: c.locationId,
      id: { in: page.map((row) => row.shiftId) },
    },
  });
  const byId = new Map(shifts.map((row) => [row.id, row]));
  return {
    closings: page.map((row) => {
      const s = byId.get(row.shiftId);
      if (!s) throw new Error('Snapshotul închiderii nu are tura corespunzătoare.');
      return {
        shift: {
          id: s.id,
          registerId: s.registerId,
          registerCode: s.registerCode,
          registerName: s.registerName,
          ownerUserId: s.ownerUserId,
          ownerDisplayName: s.ownerDisplayName,
          openedAt: s.openedAt.toISOString(),
        },
        closing: closingResponse(row),
      };
    }),
    nextCursor: rows.length > c.limit ? closingCursor(c, page.at(-1)!) : null,
    timezone: c.timezone,
  };
}
