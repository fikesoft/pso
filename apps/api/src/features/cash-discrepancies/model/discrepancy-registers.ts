import { Prisma } from '@pos/db';
import type { TenantTransaction } from '@pos/db';
import type {
  CashDiscrepancyRegisterOption,
  CashDiscrepancyRegisterResponse,
} from '@pos/contracts';
import type { DiscrepancyContext } from './discrepancy.types';
import { discrepancyFilter } from './discrepancy-query';
import { readRegisterCursor, registerCursor } from './discrepancy-cursor';
export async function discrepancyRegisters(
  tx: TenantTransaction,
  c: DiscrepancyContext,
): Promise<CashDiscrepancyRegisterResponse> {
  const after = c.cursor ? readRegisterCursor(c, c.cursor) : undefined;
  const rows = await tx.$queryRaw<CashDiscrepancyRegisterOption[]>(Prisma.sql`
    SELECT DISTINCT ON (s."registerId") s."registerId",s."registerCode",s."registerName"
    FROM "CashClosing" c JOIN "CashShift" s ON s."organizationId"=c."organizationId" AND s."locationId"=c."locationId" AND s.id=c."shiftId"
    WHERE ${discrepancyFilter(c)} ${after ? Prisma.sql`AND s."registerId">${after.registerId}::uuid` : Prisma.empty}
    ORDER BY s."registerId" ASC,c."closedAt" DESC,c.id DESC LIMIT ${c.limit + 1}`);
  const registers = rows.slice(0, c.limit);
  return {
    registers,
    nextCursor: rows.length > c.limit ? registerCursor(c, registers.at(-1)!.registerId) : null,
    timezone: c.timezone,
  };
}
